"use strict";

const ExtracaoContatosService = require("./extracao-contatos.service");

const TAVILY_URL = "https://api.tavily.com/search";

const DOMINIOS_DESCARTADOS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "jusbrasil.com.br",
  "econodata.com.br",
  "cnpj.biz",
  "consultacnpj.com",
  "empresascnpj.com",
  "escavador.com",
];

const PALAVRAS_IGNORADAS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "as",
  "os",
  "ltda",
  "mei",
  "me",
  "eireli",
  "empresa",
  "comercio",
  "servicos",
  "delicatessen",
  "padaria",
]);

function palavrasSignificativas(texto) {
  return normalizarTexto(texto)
    .split(" ")
    .filter(
      (palavra) => palavra.length >= 3 && !PALAVRAS_IGNORADAS.has(palavra),
    );
}

function calcularCorrespondencia(nomeEmpresa, textoResultado) {
  const palavras = [...new Set(palavrasSignificativas(nomeEmpresa))];

  if (!palavras.length) return 0;

  const palavrasResultado = new Set(normalizarTexto(textoResultado).split(" "));

  const encontradas = palavras.filter((palavra) =>
    palavrasResultado.has(palavra),
  );

  return encontradas.length / palavras.length;
}

function compararDominio(nomeEmpresa, dominio) {
  const palavras = palavrasSignificativas(nomeEmpresa);

  if (!palavras.length) return 0;

  const dominioNormalizado = normalizarTexto(
    dominio.replace(/\./g, " "),
  ).replace(/\s/g, "");

  const encontradas = palavras.filter((palavra) =>
    dominioNormalizado.includes(palavra),
  );

  return encontradas.length / palavras.length;
}

function normalizarTexto(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarCnpj(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function extrairDominio(urlOriginal) {
  try {
    const url = new URL(urlOriginal);

    if (url.protocol !== "https:") return null;

    const host = url.hostname.toLowerCase();

    if (
      DOMINIOS_DESCARTADOS.some(
        (dominio) => host === dominio || host.endsWith(`.${dominio}`),
      )
    ) {
      return null;
    }

    return {
      website: url.origin,
      dominio: host.replace(/^www\./, ""),
    };
  } catch {
    return null;
  }
}

async function pesquisarTavily(query) {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error("TAVILY_API_KEY não configurada no worker.");
  }

  const resposta = await fetch(TAVILY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "basic",
      topic: "general",
      max_results: 8,
      include_answer: false,
      include_raw_content: false,
      exclude_domains: DOMINIOS_DESCARTADOS,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resposta.ok) {
    const mensagem = await resposta.text();

    throw new Error(
      `Erro Tavily HTTP ${resposta.status}: ` + mensagem.slice(0, 300),
    );
  }

  const dados = await resposta.json();

  return Array.isArray(dados.results) ? dados.results : [];
}

class PesquisaEmpresarialService {
  static async pesquisar(empresa) {
    const cnpj = normalizarCnpj(empresa.cnpj);

    const razaoSocial = String(empresa.razao_social || "").trim();

    const nomeFantasia = String(empresa.nome_fantasia || "").trim();

    const municipio = String(empresa.municipio || "Ceará").trim();

    const nomePesquisa = nomeFantasia || razaoSocial;

    if (!nomePesquisa) {
      throw new Error(`Empresa ${cnpj} sem nome para pesquisa.`);
    }

    console.log(`[TAVILY] Pesquisando ${nomePesquisa}`);

    // Uma consulta básica por empresa.
    // Reduz o consumo da franquia gratuita.
    const query =
      `"${nomePesquisa}" "${municipio}" ` +
      `site oficial contato empresa Ceará`;

    const resultados = await pesquisarTavily(query);

    const candidatos = [];

    for (const resultado of resultados) {
      const dominio = extrairDominio(resultado.url);

      if (!dominio) continue;

      const textoResultado = [
        resultado.title || "",
        resultado.content || "",
      ].join(" ");

      const correspondenciaNome = calcularCorrespondencia(
        nomePesquisa,
        textoResultado,
      );

      const correspondenciaRazao = calcularCorrespondencia(
        razaoSocial,
        textoResultado,
      );

      const correspondenciaDominio = compararDominio(
        nomePesquisa,
        dominio.dominio,
      );

      const scoreTavily = Math.max(
        0,
        Math.min(1, Number(resultado.score) || 0),
      );

      // Pontuação heurística de triagem.
      // Não representa uma probabilidade.
      const pontuacao =
        correspondenciaNome * 40 +
        correspondenciaRazao * 10 +
        correspondenciaDominio * 40 +
        scoreTavily * 10;

      console.log("[TAVILY CANDIDATO]", {
        titulo: resultado.title,
        url: resultado.url,
        correspondenciaNome,
        correspondenciaDominio,
        pontuacao: pontuacao.toFixed(2),
      });

      // Exigir alguma correspondência significativa
      // para evitar associar empresas diferentes.
      if (correspondenciaNome < 0.5 && correspondenciaDominio < 0.5) {
        continue;
      }

      candidatos.push({
        website: dominio.website,
        url_fonte: resultado.url,
        confianca: Math.round(Math.min(pontuacao, 80)),
      });
    }

    candidatos.sort((a, b) => b.confianca - a.confianca);

    console.log("[TAVILY] Candidatos encontrados:", candidatos.length);

    candidatos.sort((a, b) => b.confianca - a.confianca);

    const melhor = candidatos[0];

    if (!melhor) {
      return {
        email_comercial: null,
        website: null,
        telefone_comercial: null,
        whatsapp: null,
        instagram: null,
        fonte: "TAVILY",
        url_fonte: null,
        status_verificacao: "NAO_ENCONTRADO",
        confianca: 0,
      };
    }

    // ==========================================
    // EXTRAÇÃO DE CONTATOS DO WEBSITE CANDIDATO
    // ==========================================

    let extracao;

    try {
      extracao = await ExtracaoContatosService.extrair(
        melhor.website,
        empresa.cnpj,
      );
    } catch (erro) {
      console.error(`[TAVILY EXTRACT] Falha ${empresa.cnpj}:`, erro.message);

      // A falha na extração não deve transformar
      // o website candidato em site verificado.
      return {
        email_comercial: null,
        website: melhor.website,
        telefone_comercial: null,
        whatsapp: null,
        instagram: null,
        fonte: "TAVILY_SEARCH",
        url_fonte: melhor.url_fonte,
        status_verificacao: "REVISAR",
        confianca: melhor.confianca,
      };
    }

    console.log(`[ENRIQUECIMENTO] ${empresa.cnpj}`, {
      website: extracao.website,
      email: extracao.email_comercial,
      telefone: extracao.telefone_comercial,
      cnpjConfirmado: extracao.cnpj_confirmado,
      paginas: extracao.paginas_analisadas,
    });

    // CNPJ localizado no conteúdo é um indício
    // forte, mas ainda exige cuidado com homônimos,
    // páginas de parceiros e contatos de terceiros.
    const identidadeConfirmada = extracao.cnpj_confirmado === true;

    const possuiContato =
      Boolean(extracao.email_comercial) || Boolean(extracao.telefone_comercial);

    const confianca = identidadeConfirmada ? 80 : melhor.confianca;

    const evidenciaCnpj = extracao.evidencias.find(
      (item) => item.cnpj_confirmado,
    );

    return {
      email_comercial: extracao.email_comercial,
      website: extracao.website,
      telefone_comercial: extracao.telefone_comercial,
      whatsapp: null,
      instagram: null,
      fonte: "TAVILY_SEARCH_EXTRACT",
      url_fonte: evidenciaCnpj?.url || melhor.url_fonte,

      // Mantemos revisão humana antes de confirmar
      // definitivamente os contatos comerciais.
      status_verificacao: "REVISAR",
      confianca: possuiContato ? confianca : Math.min(confianca, 60),
    };
  }
}

module.exports = PesquisaEmpresarialService;


'use strict';

const API_URL =
  'https://api.search.brave.com/res/v1/web/search';

const DOMINIOS_DESCARTADOS = [
  'instagram.com',
  'facebook.com',
  'linkedin.com',
  'jusbrasil.com.br',
  'econodata.com.br',
  'cnpj.biz',
  'consultacnpj.com'
];

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dominioDescartado(host) {
  return DOMINIOS_DESCARTADOS.some(
    dominio =>
      host === dominio ||
      host.endsWith(`.${dominio}`)
  );
}

function urlCandidata(valor) {
  try {
    const url = new URL(valor);

    if (url.protocol !== 'https:') return null;

    const host = url.hostname.toLowerCase();

    if (dominioDescartado(host)) return null;

    return url;
  } catch {
    return null;
  }
}

async function pesquisarWeb(consulta) {
  const chave = process.env.BRAVE_SEARCH_API_KEY;

  if (!chave) {
    throw new Error(
      'BRAVE_SEARCH_API_KEY não configurada.'
    );
  }

  const url = new URL(API_URL);

  url.searchParams.set('q', consulta);
  url.searchParams.set('country', 'BR');
  url.searchParams.set('search_lang', 'pt');
  url.searchParams.set('count', '10');

  const resposta = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': chave
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!resposta.ok) {
    throw new Error(
      `Brave Search retornou HTTP ${resposta.status}`
    );
  }

  const dados = await resposta.json();

  return dados.web?.results || [];
}

class PesquisaEmpresarialService {

  static async pesquisar(empresa) {
    const nome =
      empresa.nome_fantasia ||
      empresa.razao_social;

    const consultas = [
      `"${empresa.cnpj}" empresa site`,
      `"${nome}" "${empresa.municipio || 'Ceará'}" site oficial`
    ];

    const resultados = [];

    for (const consulta of consultas) {
      const encontrados = await pesquisarWeb(consulta);
      resultados.push(...encontrados);
    }

    const candidatos = new Map();

    for (const item of resultados) {
      const url = urlCandidata(item.url);

      if (!url) continue;

      const host = url.hostname.replace(/^www\./, '');

      if (!candidatos.has(host)) {
        candidatos.set(host, {
          url: url.origin,
          fonte: item.url,
          titulo: item.title || '',
          descricao: item.description || ''
        });
      }
    }

    const cnpj = String(empresa.cnpj)
      .replace(/\D/g, '');

    const nomeNormalizado = normalizarTexto(nome);

    const avaliados = [...candidatos.values()]
      .map(item => {
        const texto = normalizarTexto(
          `${item.titulo} ${item.descricao}`
        );

        const cnpjNoResultado =
          (item.titulo + ' ' + item.descricao)
            .replace(/\D/g, '')
            .includes(cnpj);

        const nomeNoResultado =
          nomeNormalizado.length >= 5 &&
          texto.includes(nomeNormalizado);

        return {
          ...item,
          cnpjNoResultado,
          nomeNoResultado
        };
      });

    // Um resultado de busca é apenas uma indicação.
    // Não classificamos como VERIFICADO sem consultar
    // uma fonte primária e confirmar a identidade.
    const candidatosFortes = avaliados.filter(
      item => item.cnpjNoResultado
    );

    const candidatosPorNome = avaliados.filter(
      item => item.nomeNoResultado
    );

    const candidato =
      candidatosFortes[0] ||
      candidatosPorNome[0];

    if (!candidato) {
      return {
        email_comercial: null,
        website: null,
        telefone_comercial: null,
        whatsapp: null,
        instagram: null,
        fonte: 'BRAVE_SEARCH',
        url_fonte: null,
        confianca: 0,
        status_verificacao: 'NAO_ENCONTRADO'
      };
    }

    return {
      email_comercial: null,
      website: candidato.url,
      telefone_comercial: null,
      whatsapp: null,
      instagram: null,
      fonte: 'BRAVE_SEARCH',
      url_fonte: candidato.fonte,
      confianca: candidato.cnpjNoResultado ? 60 : 30,
      status_verificacao: 'REVISAR'
    };
  }
}

module.exports = PesquisaEmpresarialService;

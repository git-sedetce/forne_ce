"use strict";

const ENDPOINT = "https://api.tavily.com/extract";

const CAMINHOS = ["/", "/contato", "/fale-conosco", "/sobre"];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const TELEFONE_REGEX =
  /(?:\+?55[\s().-]*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]?\d{4}/g;

function origemSegura(website) {
  try {
    const url = new URL(website);

    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;

    const host = url.hostname.toLowerCase();

    // Aceitar somente domínios públicos, não IPs.
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
      host.includes(":") ||
      !host.includes(".")
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}

function limparEmail(email) {
  const valor = String(email || "")
    .toLowerCase()
    .replace(/[),;:]+$/, "")
    .trim();

  if (
    !valor ||
    valor.length > 254 ||
    /\.(png|jpg|jpeg|gif|webp|svg|css|js)$/.test(valor)
  ) {
    return null;
  }

  return valor;
}

function escolherEmail(emails, dominio) {
  const unicos = [...new Set(emails)];

  const dominioBase = dominio.replace(/^www\./, "");

  const pontuar = (email) => {
    const parteDominio = email.split("@")[1];

    let pontos = 0;

    if (
      parteDominio === dominioBase ||
      parteDominio.endsWith(`.${dominioBase}`)
    ) {
      pontos += 50;
    }

    if (/^(comercial|vendas|contato|atendimento|sac|marketing)@/.test(email)) {
      pontos += 30;
    }

    if (/^(noreply|no-reply|suporte|admin)@/.test(email)) {
      pontos -= 20;
    }

    return pontos;
  };

  return unicos.sort((a, b) => pontuar(b) - pontuar(a))[0] || null;
}

class ExtracaoContatosService {
  static async extrair(website, cnpj) {
    const origem = origemSegura(website);

    if (!origem) {
      throw new Error("Website inválido para extração.");
    }

    const urls = CAMINHOS.map((caminho) => new URL(caminho, origem).href);

    const resposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        urls,
        extract_depth: "basic",
        include_images: false,
        format: "markdown",
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!resposta.ok) {
      throw new Error(`Tavily Extract HTTP ${resposta.status}`);
    }

    const dados = await resposta.json();
    const paginas = Array.isArray(dados.results) ? dados.results : [];

    const emails = [];
    const telefones = [];
    const evidencias = [];

    let cnpjConfirmado = false;

    const cnpjNormalizado = String(cnpj || "").replace(/\D/g, "");

    for (const pagina of paginas) {
      // Aceita conteúdo apenas do domínio consultado.
      if (origemSegura(pagina.url) !== origem) continue;

      const conteudo = String(pagina.raw_content || "").slice(0, 500000);

      const cnpjsEncontrados = (
        conteudo.match(
          /(?<!\d)\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}(?!\d)/g,
        ) || []
      ).map((valor) => valor.replace(/\D/g, ""));

      const confirmou =
        cnpjNormalizado.length === 14 &&
        cnpjsEncontrados.includes(cnpjNormalizado);

      if (confirmou) cnpjConfirmado = true;

      const emailsPagina = (conteudo.match(EMAIL_REGEX) || [])
        .map(limparEmail)
        .filter(Boolean);

      const telefonesPagina = conteudo.match(TELEFONE_REGEX) || [];

      emails.push(...emailsPagina);
      telefones.push(...telefonesPagina);

      if (confirmou || emailsPagina.length || telefonesPagina.length) {
        evidencias.push({
          url: pagina.url,
          cnpj_confirmado: confirmou,
          emails: [...new Set(emailsPagina)].slice(0, 10),
        });
      }
    }

    const dominio = new URL(origem).hostname;

    const email = escolherEmail(emails, dominio);

    const telefone =
      [...new Set(telefones.map((valor) => valor.trim()))][0] || null;

    return {
      website: origem,
      email_comercial: email,
      telefone_comercial: telefone,
      cnpj_confirmado: cnpjConfirmado,
      paginas_analisadas: paginas.length,
      evidencias,
    };
  }
}

module.exports = ExtracaoContatosService;

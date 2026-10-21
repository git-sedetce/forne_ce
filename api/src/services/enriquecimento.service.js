
'use strict';

const { QueryTypes } = require('sequelize');
const database = require('../models');

const PesquisaEmpresarialService = require(
  './provedores/pesquisa-empresarial.service'
);

const sequelize = database.sequelize;

const PRAZOS = {
  VERIFICADO: 90,
  NAO_ENCONTRADO: 30,
  REVISAR: 7,
  ERRO: 1
};

function normalizarCnpj(valor) {
  const cnpj = String(valor ?? '').replace(/\D/g, '');

  if (!/^\d{14}$/.test(cnpj)) {
    throw new Error('CNPJ inválido.');
  }

  return cnpj;
}

function textoOuNull(valor) {
  if (typeof valor !== 'string') return null;

  const texto = valor.trim();

  return texto && texto !== '-' ? texto : null;
}

class EnriquecimentoService {

  static async buscarEmpresa(cnpj) {
    cnpj = normalizarCnpj(cnpj);

    const [empresa] = await sequelize.query(`
      SELECT
        cnpj,
        razao_social,
        nome_fantasia,
        municipio,
        telefone,
        email
      FROM public.junta_empresas
      WHERE cnpj = :cnpj
      ORDER BY id DESC
      LIMIT 1
    `, {
      replacements: { cnpj },
      type: QueryTypes.SELECT
    });

    return empresa || null;
  }

  static async consultarCache(cnpj) {
    cnpj = normalizarCnpj(cnpj);

    const [contato] = await sequelize.query(`
      SELECT *
      FROM public.empresas_contatos_comerciais
      WHERE cnpj = :cnpj
    `, {
      replacements: { cnpj },
      type: QueryTypes.SELECT
    });

    return contato || null;
  }

  static async salvarResultado(cnpj, resultado) {
    cnpj = normalizarCnpj(cnpj);

    const statusPermitidos = [
      'VERIFICADO',
      'NAO_ENCONTRADO',
      'REVISAR'
    ];

    const status = statusPermitidos.includes(
      resultado?.status_verificacao
    )
      ? resultado.status_verificacao
      : 'REVISAR';

    const confianca = Math.max(
      0,
      Math.min(100, Number(resultado?.confianca) || 0)
    );

    const dados = {
      cnpj,
      email_comercial: textoOuNull(resultado?.email_comercial),
      website: textoOuNull(resultado?.website),
      telefone_comercial: textoOuNull(
        resultado?.telefone_comercial
      ),
      whatsapp: textoOuNull(resultado?.whatsapp),
      instagram: textoOuNull(resultado?.instagram),
      fonte: textoOuNull(resultado?.fonte),
      url_fonte: textoOuNull(resultado?.url_fonte),
      status,
      confianca,
      dias: PRAZOS[status]
    };

    // Só aceita VERIFICADO com evidência e canal de contato.
    if (dados.status === 'VERIFICADO' &&
        (!dados.url_fonte ||
         (!dados.email_comercial &&
          !dados.website &&
          !dados.telefone_comercial))) {
      dados.status = 'REVISAR';
      dados.dias = PRAZOS.REVISAR;
    }

    const [salvo] = await sequelize.query(`
      INSERT INTO public.empresas_contatos_comerciais (
        cnpj,
        email_comercial,
        website,
        telefone_comercial,
        whatsapp,
        instagram,
        fonte,
        url_fonte,
        status_verificacao,
        confianca,
        verificado_em,
        proxima_atualizacao
      )
      VALUES (
        :cnpj,
        :email_comercial,
        :website,
        :telefone_comercial,
        :whatsapp,
        :instagram,
        :fonte,
        :url_fonte,
        :status,
        :confianca,
        CASE WHEN :status = 'VERIFICADO'
             THEN NOW() ELSE NULL END,
        NOW() + (:dias * INTERVAL '1 day')
      )
      ON CONFLICT (cnpj)
      DO UPDATE SET
        email_comercial = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN empresas_contatos_comerciais.email_comercial
          ELSE EXCLUDED.email_comercial
        END,

        website = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN empresas_contatos_comerciais.website
          ELSE EXCLUDED.website
        END,

        telefone_comercial = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN empresas_contatos_comerciais.telefone_comercial
          ELSE EXCLUDED.telefone_comercial
        END,

        whatsapp = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN empresas_contatos_comerciais.whatsapp
          ELSE EXCLUDED.whatsapp
        END,

        instagram = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN empresas_contatos_comerciais.instagram
          ELSE EXCLUDED.instagram
        END,

        fonte = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN empresas_contatos_comerciais.fonte
          ELSE EXCLUDED.fonte
        END,

        url_fonte = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN empresas_contatos_comerciais.url_fonte
          ELSE EXCLUDED.url_fonte
        END,

        status_verificacao = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN 'VERIFICADO'
          ELSE EXCLUDED.status_verificacao
        END,

        confianca = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN empresas_contatos_comerciais.confianca
          ELSE EXCLUDED.confianca
        END,

        verificado_em = CASE
          WHEN empresas_contatos_comerciais.status_verificacao
               = 'VERIFICADO'
               AND EXCLUDED.status_verificacao <> 'VERIFICADO'
          THEN empresas_contatos_comerciais.verificado_em
          ELSE EXCLUDED.verificado_em
        END,

        proxima_atualizacao = EXCLUDED.proxima_atualizacao,
        atualizado_em = NOW()
      RETURNING *
    `, {
      replacements: dados,
      type: QueryTypes.SELECT
    });

    return salvo;
  }

  static async processar(cnpj) {
    cnpj = normalizarCnpj(cnpj);

    const empresa = await this.buscarEmpresa(cnpj);

    if (!empresa) {
      throw new Error(
        `Empresa ${cnpj} não encontrada na JUCEC.`
      );
    }

    console.log(
      `[ENRIQUECIMENTO] Pesquisando ${empresa.razao_social}`
    );

    const resultado =
      await PesquisaEmpresarialService.pesquisar(empresa);

    if (!resultado ||
        typeof resultado !== 'object') {
      throw new Error(
        'Provedor retornou uma resposta inválida.'
      );
    }

    // Não confundir uma falha do provedor com
    // ausência confirmada de contatos.
    if (resultado.status_verificacao === 'ERRO') {
      throw new Error(
        resultado.erro || 'Falha no provedor de pesquisa.'
      );
    }

    const contato = await this.salvarResultado(
      cnpj,
      resultado
    );

    console.log(
      `[ENRIQUECIMENTO] ${cnpj}: ` +
      contato.status_verificacao
    );

    return contato;
  }
}

module.exports = EnriquecimentoService;

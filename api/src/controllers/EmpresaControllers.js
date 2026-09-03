const { QueryTypes } = require("sequelize");
const database = require("../models");

class EmpresaControllers {
  /**
   * Localiza a competência solicitada ou retorna a mais recente.
   */
  static async obterCompetencia(competenciaInformada) {
    if (competenciaInformada) {
      if (!/^\d{4}-\d{2}$/.test(competenciaInformada)) {
        const error = new Error("A competência deve estar no formato YYYY-MM.");

        error.status = 400;

        throw error;
      }

      return competenciaInformada;
    }

    const resultado = await database.sequelize.query(
      `
        SELECT MAX(competencia) AS competencia
        FROM public.estabelecimentos
      `,
      {
        type: QueryTypes.SELECT,
      },
    );

    return resultado[0]?.competencia || null;
  }

  /**
   * GET /api/empresas/estatisticas/ativas
   *
   * Retorna a quantidade de estabelecimentos ativos no estado.
   *
   * Query params:
   *   uf=CE
   *   competencia=2026-08
   */
  static async quantidadeEmpresasAtivas(req, res) {
    try {
      const uf = String(req.query.uf || "CE")
        .trim()
        .toUpperCase();

      if (!/^[A-Z]{2}$/.test(uf)) {
        return res.status(400).json({
          message: "A UF deve conter exatamente duas letras.",
        });
      }

      const competencia = await EmpresaControllers.obterCompetencia(
        req.query.competencia,
      );

      if (!competencia) {
        return res.status(404).json({
          message: "Nenhuma competência encontrada.",
        });
      }

      const resultado = await database.sequelize.query(
        `
          SELECT
            COUNT(DISTINCT est.cnpj_completo)::BIGINT
              AS total_estabelecimentos_ativos,

            COUNT(
              DISTINCT CASE
                WHEN est.identificador_matriz_filial = '1'
                THEN est.cnpj_completo
              END
            )::BIGINT AS total_matrizes_ativas,

            COUNT(
              DISTINCT CASE
                WHEN est.identificador_matriz_filial = '2'
                THEN est.cnpj_completo
              END
            )::BIGINT AS total_filiais_ativas,

            COUNT(
              DISTINCT est.cnpj_basico
            )::BIGINT AS total_empresas
          FROM public.estabelecimentos est
          WHERE est.uf = :uf
            AND est.competencia = :competencia
            AND est.situacao_cadastral_codigo = '02'
        `,
        {
          replacements: {
            uf,
            competencia,
          },

          type: QueryTypes.SELECT,
        },
      );

      const dados = resultado[0];

      return res.status(200).json({
        uf,
        competencia,
        situacao_cadastral: {
          codigo: "02",
          descricao: "ATIVA",
        },

        quantidade: {
          empresas: Number(dados.total_empresas),
          estabelecimentos: Number(dados.total_estabelecimentos_ativos),
          matrizes: Number(dados.total_matrizes_ativas),
          filiais: Number(dados.total_filiais_ativas),
        },
      });
    } catch (error) {
      console.error("Erro ao contar empresas ativas:", error);

      return res.status(error.status || 500).json({
        message: error.message || "Erro ao contar empresas ativas.",
      });
    }
  }

  /**
   * GET /api/empresas/estatisticas/por-municipio
   *
   * Query params opcionais:
   *   uf=CE
   *   competencia=2026-08
   */
  static async quantidadeEmpresasAtivasMunicipio(req, res) {
    try {
      const uf = String(req.query.uf || "CE")
        .trim()
        .toUpperCase();

      if (!/^[A-Z]{2}$/.test(uf)) {
        return res.status(400).json({
          message: "A UF deve conter exatamente duas letras.",
        });
      }

      /*
       * Usa a competência informada ou busca
       * automaticamente a mais recente.
       */
      const competencia = await EmpresaControllers.obterCompetencia(
        req.query.competencia,
      );

      if (!competencia) {
        return res.status(404).json({
          message: "Nenhuma competência encontrada.",
        });
      }

      const municipios = await database.sequelize.query(
        `
          SELECT
            est.municipio_codigo,
            mun.nome AS municipio,

            COUNT(
              DISTINCT est.cnpj_basico
            )::BIGINT AS quantidade_empresas,

            COUNT(
              DISTINCT est.cnpj_completo
            )::BIGINT AS quantidade_estabelecimentos,

            COUNT(
              DISTINCT CASE
                WHEN est.identificador_matriz_filial = '1'
                THEN est.cnpj_completo
              END
            )::BIGINT AS quantidade_matrizes,

            COUNT(
              DISTINCT CASE
                WHEN est.identificador_matriz_filial = '2'
                THEN est.cnpj_completo
              END
            )::BIGINT AS quantidade_filiais

          FROM public.estabelecimentos est

          INNER JOIN public.municipios mun
            ON mun.codigo =
               est.municipio_codigo

          WHERE est.uf = :uf
            AND est.competencia = :competencia
            AND est.situacao_cadastral_codigo = '02'

          GROUP BY
            est.municipio_codigo,
            mun.nome

          ORDER BY
            quantidade_empresas DESC,
            mun.nome ASC
        `,
        {
          replacements: {
            uf,
            competencia,
          },

          type: QueryTypes.SELECT,
        },
      );

      /*
       * O PostgreSQL devolve valores BIGINT como string.
       * Por isso convertemos os contadores para Number.
       */
      const dados = municipios.map((municipio) => ({
        municipio_codigo: municipio.municipio_codigo,

        municipio: municipio.municipio,

        quantidade_empresas: Number(municipio.quantidade_empresas),

        quantidade_estabelecimentos: Number(
          municipio.quantidade_estabelecimentos,
        ),

        quantidade_matrizes: Number(municipio.quantidade_matrizes),

        quantidade_filiais: Number(municipio.quantidade_filiais),
      }));

      const totalEmpresas = dados.reduce(
        (total, municipio) => total + municipio.quantidade_empresas,
        0,
      );

      const totalEstabelecimentos = dados.reduce(
        (total, municipio) => total + municipio.quantidade_estabelecimentos,
        0,
      );

      return res.status(200).json({
        filtros: {
          uf,
          competencia,

          situacao_cadastral: {
            codigo: "02",
            descricao: "ATIVA",
          },
        },

        resumo: {
          quantidade_municipios: dados.length,
          total_empresas: totalEmpresas,
          total_estabelecimentos: totalEstabelecimentos,
        },

        dados,
      });
    } catch (error) {
      console.error("Erro ao consultar empresas por município:", error);

      return res.status(error.status || 500).json({
        message: error.message || "Erro ao consultar empresas por município.",
      });
    }
  }

  /**
   * GET /api/empresas/estatisticas/por-cnae
   *
   * Retorna a quantidade de estabelecimentos ativos agrupada
   * pelo CNAE principal.
   *
   * Query params:
   *   uf=CE
   *   competencia=2026-08
   *   page=1
   *   limit=50
   */
  static async quantidadeEmpresasPorCnae(req, res) {
    try {
      const uf = String(req.query.uf || "CE")
        .trim()
        .toUpperCase();

      const page = 10;//Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

      const limit = 10;/*Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
        100,
      );*/

      const offset = (page - 1) * limit;

      if (!/^[A-Z]{2}$/.test(uf)) {
        return res.status(400).json({
          message: "A UF deve conter exatamente duas letras.",
        });
      }

      const competencia = await EmpresaControllers.obterCompetencia(
        req.query.competencia,
      );

      if (!competencia) {
        return res.status(404).json({
          message: "Nenhuma competência encontrada.",
        });
      }

      const totalResultado = await database.sequelize.query(
        `
            SELECT COUNT(DISTINCT est.cnae_principal_codigo)
              AS total
            FROM public.estabelecimentos est
            WHERE est.uf = :uf
              AND est.competencia = :competencia
              AND est.situacao_cadastral_codigo = '02'
              AND est.cnae_principal_codigo IS NOT NULL
          `,
        {
          replacements: {
            uf,
            competencia,
          },

          type: QueryTypes.SELECT,
        },
      );

      const cnaes = await database.sequelize.query(
        `
          SELECT
            est.cnae_principal_codigo AS cnae_codigo,
            cnae.descricao AS cnae_descricao,

            COUNT(
              DISTINCT est.cnpj_completo
            )::BIGINT AS quantidade_estabelecimentos,

            COUNT(
              DISTINCT est.cnpj_basico
            )::BIGINT AS quantidade_empresas,

            COUNT(
              DISTINCT CASE
                WHEN est.identificador_matriz_filial = '1'
                THEN est.cnpj_completo
              END
            )::BIGINT AS quantidade_matrizes,

            COUNT(
              DISTINCT CASE
                WHEN est.identificador_matriz_filial = '2'
                THEN est.cnpj_completo
              END
            )::BIGINT AS quantidade_filiais

          FROM public.estabelecimentos est

          INNER JOIN public.cnaes cnae
            ON cnae.codigo = est.cnae_principal_codigo

          WHERE est.uf = :uf
            AND est.competencia = :competencia
            AND est.situacao_cadastral_codigo = '02'
            AND est.cnae_principal_codigo IS NOT NULL

          GROUP BY
            est.cnae_principal_codigo,
            cnae.descricao

          ORDER BY
            quantidade_estabelecimentos DESC,
            cnae.descricao ASC

          LIMIT :limit
          OFFSET :offset
        `,
        {
          replacements: {
            uf,
            competencia,
            limit,
            offset,
          },

          type: QueryTypes.SELECT,
        },
      );

      const totalItens = Number(totalResultado[0]?.total || 0);

      const dados = cnaes.map((item) => ({
        cnae_codigo: item.cnae_codigo,
        cnae_formatado: EmpresaControllers.formatarCnae(item.cnae_codigo),
        cnae_descricao: item.cnae_descricao,
        quantidade_empresas: Number(item.quantidade_empresas),
        quantidade_estabelecimentos: Number(item.quantidade_estabelecimentos),
        quantidade_matrizes: Number(item.quantidade_matrizes),
        quantidade_filiais: Number(item.quantidade_filiais),
      }));

      return res.status(200).json({
        filtros: {
          uf,
          competencia,
          situacao_cadastral: "02",
          criterio_cnae: "principal",
        },

        paginacao: {
          pagina: page,
          limite: limit,
          total_itens: totalItens,
          total_paginas: Math.ceil(totalItens / limit),
        },

        dados,
      });
    } catch (error) {
      console.error("Erro ao agrupar empresas por CNAE:", error);

      return res.status(error.status || 500).json({
        message: error.message || "Erro ao agrupar empresas por CNAE.",
      });
    }
  }

  /**
   * GET /api/empresas/cnae/:cnae
   *
   * Retorna uma lista de estabelecimentos ativos cujo CNAE
   * principal corresponde ao CNAE informado.
   *
   * Parâmetros:
   *   /api/empresas/cnae/6201501
   *
   * Query params:
   *   uf=CE
   *   municipio=Fortaleza
   *   competencia=2026-08
   *   page=1
   *   limit=20
   */
  static async listarEmpresasPorCnae(req, res) {
    try {
      const cnae = String(req.params.cnae || "").replace(/\D/g, "");

      const uf = String(req.query.uf || "CE")
        .trim()
        .toUpperCase();

      const municipio = String(req.query.municipio || "").trim();

      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
        100,
      );

      const offset = (page - 1) * limit;

      if (cnae.length !== 7) {
        return res.status(400).json({
          message: "O CNAE deve conter exatamente sete números.",
        });
      }

      if (!/^[A-Z]{2}$/.test(uf)) {
        return res.status(400).json({
          message: "A UF deve conter exatamente duas letras.",
        });
      }

      const competencia = await EmpresaControllers.obterCompetencia(
        req.query.competencia,
      );

      if (!competencia) {
        return res.status(404).json({
          message: "Nenhuma competência encontrada.",
        });
      }

      /*
       * O município é opcional. Quando ele não for informado,
       * a condição abaixo será sempre verdadeira.
       */
      const replacements = {
        cnae,
        uf,
        competencia,
        municipio,
        municipioPesquisa: `%${municipio}%`,
        limit,
        offset,
      };

      const whereMunicipio = `
        (
          :municipio = ''
          OR mun.nome ILIKE :municipioPesquisa
        )
      `;

      const totalResultado = await database.sequelize.query(
        `
            SELECT
              COUNT(DISTINCT est.cnpj_completo)::BIGINT
                AS total
            FROM public.estabelecimentos est

            LEFT JOIN public.municipios mun
              ON mun.codigo = est.municipio_codigo

            WHERE
              est.cnae_principal_codigo = :cnae
              AND est.uf = :uf
              AND est.competencia = :competencia
              AND est.situacao_cadastral_codigo = '02'
              AND ${whereMunicipio}
          `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      const empresas = await database.sequelize.query(
        `
          SELECT
            est.cnpj_completo AS cnpj,
            est.cnpj_basico,
            emp.razao_social,
            est.nome_fantasia,

            est.identificador_matriz_filial,

            CASE
              WHEN est.identificador_matriz_filial = '1'
                THEN 'MATRIZ'
              WHEN est.identificador_matriz_filial = '2'
                THEN 'FILIAL'
              ELSE 'NÃO INFORMADO'
            END AS tipo_estabelecimento,

            est.situacao_cadastral_codigo,

            est.cnae_principal_codigo,
            cnae.descricao AS cnae_principal_descricao,

            emp.natureza_juridica_codigo,
            emp.porte_codigo,
            emp.capital_social,

            est.tipo_logradouro,
            est.logradouro,
            est.numero,
            est.complemento,
            est.bairro,
            est.cep,

            est.uf,
            est.municipio_codigo,
            mun.nome AS municipio,

            est.ddd_1,
            est.telefone_1,
            est.ddd_2,
            est.telefone_2,
            est.email,

            est.data_inicio_atividade,
            est.competencia

          FROM public.estabelecimentos est

          INNER JOIN public.empresas emp
            ON emp.id = est.empresa_id
            AND emp.competencia = est.competencia

          INNER JOIN public.cnaes cnae
            ON cnae.codigo =
               est.cnae_principal_codigo

          LEFT JOIN public.municipios mun
            ON mun.codigo = est.municipio_codigo

          WHERE
            est.cnae_principal_codigo = :cnae
            AND est.uf = :uf
            AND est.competencia = :competencia
            AND est.situacao_cadastral_codigo = '02'
            AND ${whereMunicipio}

          ORDER BY
            emp.razao_social ASC,
            est.cnpj_completo ASC

          LIMIT :limit
          OFFSET :offset
        `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      const totalItens = Number(totalResultado[0]?.total || 0);

      return res.status(200).json({
        filtros: {
          cnae,
          cnae_formatado: EmpresaControllers.formatarCnae(cnae),
          uf,
          municipio: municipio || null,
          competencia,
          situacao_cadastral: "02",
          criterio_cnae: "principal",
        },

        paginacao: {
          pagina: page,
          limite: limit,
          total_itens: totalItens,
          total_paginas: Math.ceil(totalItens / limit),
        },

        dados: empresas,
      });
    } catch (error) {
      console.error("Erro ao listar empresas por CNAE:", error);

      return res.status(error.status || 500).json({
        message: error.message || "Erro ao listar empresas por CNAE.",
      });
    }
  }

  /**
   * GET /api/empresas/cnaes
   *
   * Query params:
   *   pesquisa=software
   *   page=1
   *   limit=50
   */
  static async listarCnaes(req, res) {
    try {
      const pesquisa = String(req.query.pesquisa || "").trim();

      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
        100,
      );

      const offset = (page - 1) * limit;

      const pesquisaNumerica = pesquisa.replace(/\D/g, "");

      const replacements = {
        pesquisa,
        codigoPesquisa: `${pesquisaNumerica}%`,
        descricaoPesquisa: `%${pesquisa}%`,
        limit,
        offset,
      };

      const filtroPesquisa = `
      (
        :pesquisa = ''
        OR cnae.codigo LIKE :codigoPesquisa
        OR cnae.descricao ILIKE :descricaoPesquisa
      )
    `;

      const totalResultado = await database.sequelize.query(
        `
          SELECT COUNT(*)::BIGINT AS total
          FROM public.cnaes cnae
          WHERE ${filtroPesquisa}
        `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      const cnaes = await database.sequelize.query(
        `
        SELECT
          cnae.codigo,
          cnae.descricao
        FROM public.cnaes cnae

        WHERE ${filtroPesquisa}

        ORDER BY
          cnae.codigo ASC

        LIMIT :limit
        OFFSET :offset
      `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      const totalItens = Number(totalResultado[0]?.total || 0);

      const dados = cnaes.map((cnae) => ({
        codigo: cnae.codigo,

        codigo_formatado: EmpresaControllers.formatarCnae(cnae.codigo),

        descricao: cnae.descricao,
      }));

      return res.status(200).json({
        filtros: {
          pesquisa: pesquisa || null,
        },

        paginacao: {
          pagina: page,
          limite: limit,
          total_itens: totalItens,
          total_paginas: Math.ceil(totalItens / limit),
        },

        dados,
      });
    } catch (error) {
      console.error("Erro ao listar CNAEs:", error);

      return res.status(500).json({
        message: "Erro ao listar CNAEs.",
        error: error.message,
      });
    }
  }

  /**
   * GET /api/empresas/ativas
   *
   * Query params:
   *   uf=CE
   *   municipio=Fortaleza
   *   cnae=6201501
   *   pesquisa=empresa
   *   tipo=MATRIZ
   *   competencia=2026-08
   *   page=1
   *   limit=20
   */
  static async listarEmpresasAtivas(req, res) {
    try {
      const uf = String(req.query.uf || "CE")
        .trim()
        .toUpperCase();

      const municipio = String(req.query.municipio || "").trim();

      const pesquisa = String(req.query.pesquisa || "").trim();

      const cnae = String(req.query.cnae || "").replace(/\D/g, "");

      const tipo = String(req.query.tipo || "")
        .trim()
        .toUpperCase();

      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
        100,
      );

      const offset = (page - 1) * limit;

      if (!/^[A-Z]{2}$/.test(uf)) {
        return res.status(400).json({
          message: "A UF deve conter exatamente duas letras.",
        });
      }

      if (cnae && cnae.length !== 7) {
        return res.status(400).json({
          message: "O CNAE deve conter exatamente sete números.",
        });
      }

      const tiposPermitidos = ["", "MATRIZ", "FILIAL"];

      if (!tiposPermitidos.includes(tipo)) {
        return res.status(400).json({
          message: "O tipo deve ser MATRIZ ou FILIAL.",
        });
      }

      const competencia = await EmpresaControllers.obterCompetencia(
        req.query.competencia,
      );

      if (!competencia) {
        return res.status(404).json({
          message: "Nenhuma competência encontrada.",
        });
      }

      let identificadorMatrizFilial = "";

      if (tipo === "MATRIZ") {
        identificadorMatrizFilial = "1";
      }

      if (tipo === "FILIAL") {
        identificadorMatrizFilial = "2";
      }

      const cnpjPesquisa = pesquisa.replace(/\D/g, "");

      const replacements = {
        uf,
        municipio,
        municipioPesquisa: `%${municipio}%`,
        cnae,
        pesquisa,
        nomePesquisa: `%${pesquisa}%`,
        cnpjPesquisa: `%${cnpjPesquisa}%`,
        identificadorMatrizFilial,
        competencia,
        limit,
        offset,
      };

      const filtros = `
      est.uf = :uf

      AND est.competencia = :competencia

      AND est.situacao_cadastral_codigo = '02'

      AND (
        :municipio = ''
        OR mun.nome ILIKE :municipioPesquisa
      )

      AND (
        :cnae = ''
        OR est.cnae_principal_codigo = :cnae
      )

      AND (
        :identificadorMatrizFilial = ''
        OR est.identificador_matriz_filial =
           :identificadorMatrizFilial
      )

      AND (
        :pesquisa = ''
        OR emp.razao_social ILIKE :nomePesquisa
        OR est.nome_fantasia ILIKE :nomePesquisa
        OR est.cnpj_completo LIKE :cnpjPesquisa
      )
    `;

      const totalResultado = await database.sequelize.query(
        `
          SELECT
            COUNT(
              DISTINCT est.cnpj_completo
            )::BIGINT AS total

          FROM public.estabelecimentos est

          INNER JOIN public.empresas emp
            ON emp.id = est.empresa_id
            AND emp.competencia =
                est.competencia

          LEFT JOIN public.municipios mun
            ON mun.codigo =
               est.municipio_codigo

          WHERE ${filtros}
        `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      const empresas = await database.sequelize.query(
        `
          SELECT
            est.cnpj_completo AS cnpj,
            est.cnpj_basico,

            emp.razao_social,
            est.nome_fantasia,

            est.identificador_matriz_filial,

            CASE
              WHEN est.identificador_matriz_filial = '1'
                THEN 'MATRIZ'
              WHEN est.identificador_matriz_filial = '2'
                THEN 'FILIAL'
              ELSE 'NÃO INFORMADO'
            END AS tipo_estabelecimento,

            est.situacao_cadastral_codigo,

            est.cnae_principal_codigo,
            cnae.descricao
              AS cnae_principal_descricao,

            emp.natureza_juridica_codigo,
            emp.porte_codigo,
            emp.capital_social,

            est.tipo_logradouro,
            est.logradouro,
            est.numero,
            est.complemento,
            est.bairro,
            est.cep,

            est.uf,
            est.municipio_codigo,
            mun.nome AS municipio,

            est.ddd_1,
            est.telefone_1,
            est.ddd_2,
            est.telefone_2,
            est.email,

            est.data_inicio_atividade,
            est.competencia

          FROM public.estabelecimentos est

          INNER JOIN public.empresas emp
            ON emp.id = est.empresa_id
            AND emp.competencia =
                est.competencia

          INNER JOIN public.cnaes cnae
            ON cnae.codigo =
               est.cnae_principal_codigo

          LEFT JOIN public.municipios mun
            ON mun.codigo =
               est.municipio_codigo

          WHERE ${filtros}

          ORDER BY
            emp.razao_social ASC,
            est.cnpj_completo ASC

          LIMIT :limit
          OFFSET :offset
        `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      const totalItens = Number(totalResultado[0]?.total || 0);

      const dados = empresas.map((empresa) => ({
        ...empresa,

        cnae_principal_formatado: EmpresaControllers.formatarCnae(
          empresa.cnae_principal_codigo,
        ),
      }));

      return res.status(200).json({
        filtros: {
          uf,
          municipio: municipio || null,
          cnae: cnae || null,
          pesquisa: pesquisa || null,
          tipo: tipo || null,
          competencia,
          situacao_cadastral: {
            codigo: "02",
            descricao: "ATIVA",
          },
        },

        paginacao: {
          pagina: page,
          limite: limit,
          total_itens: totalItens,
          total_paginas: Math.ceil(totalItens / limit),
        },

        dados,
      });
    } catch (error) {
      console.error("Erro ao listar empresas ativas:", error);

      return res.status(error.status || 500).json({
        message: error.message || "Erro ao listar empresas ativas.",
      });
    }
  }

  static formatarCnae(cnae) {
    const codigo = String(cnae || "").replace(/\D/g, "");

    if (codigo.length !== 7) {
      return codigo;
    }

    return codigo.replace(/^(\d{2})(\d{2})(\d)(\d{2})$/, "$1.$2-$3-$4");
  }
}

module.exports = EmpresaControllers;

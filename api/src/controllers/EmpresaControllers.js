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
   * Expressão SQL responsável pela classificação do CNAE principal
   * em grandes segmentos econômicos.
   *
   * A classificação utiliza os dois primeiros dígitos do CNAE
   * (divisão CNAE).
   */
  static sqlSegmentoCnae(alias = "est") {
    return `
    CASE
      WHEN ${alias}.cnae_principal_codigo
           ~ '^[0-9]{7}$'
      THEN
        CASE
          /* Indústrias extrativas + transformação */
          WHEN LEFT(
            ${alias}.cnae_principal_codigo,
            2
          )::INTEGER BETWEEN 5 AND 33
            THEN 'INDUSTRIA'
          /* Comércio */
          WHEN LEFT(
            ${alias}.cnae_principal_codigo,
            2
          )::INTEGER BETWEEN 45 AND 47
            THEN 'COMERCIO'
          /* Serviços */
          WHEN (
            LEFT(
              ${alias}.cnae_principal_codigo,
              2
            )::INTEGER BETWEEN 49 AND 66
            OR LEFT(
              ${alias}.cnae_principal_codigo,
              2
            )::INTEGER BETWEEN 68 AND 75
            OR LEFT(
              ${alias}.cnae_principal_codigo,
              2
            )::INTEGER BETWEEN 77 AND 82
            OR LEFT(
              ${alias}.cnae_principal_codigo,
              2
            )::INTEGER BETWEEN 85 AND 88
            OR LEFT(
              ${alias}.cnae_principal_codigo,
              2
            )::INTEGER BETWEEN 90 AND 96
          )
            THEN 'SERVICOS'
          ELSE 'OUTROS'
        END
      ELSE 'OUTROS'
    END
  `;
  }

  /**
   * Monta os filtros compartilhados pelo dashboard de indicadores.
   */
  static montarFiltrosIndicadores(query, competencia) {
    const uf = String(query.uf || "CE")
      .trim()
      .toUpperCase();

    const municipio = String(query.municipio || "").trim();

    const regiao = String(query.regiao || "").trim();

    const segmento = String(query.segmento || "")
      .trim()
      .toUpperCase();

    const situacao = String(query.situacao || "").trim();

    const dataInicial = String(query.dataInicial || "").trim();

    const dataFinal = String(query.dataFinal || "").trim();

    const tipoData = String(query.tipoData || "INICIO_ATIVIDADE")
      .trim()
      .toUpperCase();

    /*
     * Quando o frontend selecionar uma região,
     * enviará também os municípios:
     *
     * municipios=Fortaleza|Caucaia|Maracanau
     */
    const municipios = String(query.municipios || "")
      .split("|")
      .map((item) => item.trim())
      .filter(Boolean);

    // =====================================================
    // VALIDAÇÕES
    // =====================================================

    if (!/^[A-Z]{2}$/.test(uf)) {
      const error = new Error("A UF deve conter exatamente duas letras.");

      error.status = 400;
      throw error;
    }

    const segmentosPermitidos = [
      "",
      "INDUSTRIA",
      "COMERCIO",
      "SERVICOS",
      "OUTROS",
    ];

    if (!segmentosPermitidos.includes(segmento)) {
      const error = new Error(
        "Segmento inválido. Utilize INDUSTRIA, COMERCIO, SERVICOS ou OUTROS.",
      );

      error.status = 400;
      throw error;
    }

    const situacoesPermitidas = ["", "01", "02", "03", "04", "08"];

    if (!situacoesPermitidas.includes(situacao)) {
      const error = new Error("Situação cadastral inválida.");

      error.status = 400;
      throw error;
    }

    const tiposDataPermitidos = ["INICIO_ATIVIDADE", "SITUACAO_CADASTRAL"];

    if (!tiposDataPermitidos.includes(tipoData)) {
      const error = new Error(
        "tipoData deve ser INICIO_ATIVIDADE ou SITUACAO_CADASTRAL.",
      );

      error.status = 400;
      throw error;
    }

    const regexData = /^\d{4}-\d{2}-\d{2}$/;

    if (dataInicial && !regexData.test(dataInicial)) {
      const error = new Error("dataInicial deve estar no formato YYYY-MM-DD.");

      error.status = 400;
      throw error;
    }

    if (dataFinal && !regexData.test(dataFinal)) {
      const error = new Error("dataFinal deve estar no formato YYYY-MM-DD.");

      error.status = 400;
      throw error;
    }

    if (dataInicial && dataFinal && dataInicial > dataFinal) {
      const error = new Error(
        "A data inicial não pode ser maior que a data final.",
      );

      error.status = 400;
      throw error;
    }

    if (regiao && !municipio && municipios.length === 0) {
      const error = new Error(
        "Informe os municípios pertencentes à região selecionada.",
      );

      error.status = 400;
      throw error;
    }

    // =====================================================
    // WHERE
    // =====================================================

    const where = ["est.uf = :uf", "est.competencia = :competencia"];

    const replacements = {
      uf,
      competencia,
    };

    // Município específico tem prioridade sobre região.
    if (municipio) {
      where.push("UPPER(TRIM(mun.nome)) = :municipio");

      replacements.municipio = municipio.toUpperCase();
    } else if (regiao && municipios.length > 0) {
      const parametros = [];

      municipios.forEach((nomeMunicipio, index) => {
        const chave = `municipioRegiao${index}`;

        replacements[chave] = nomeMunicipio.toUpperCase();

        parametros.push(`:${chave}`);
      });

      where.push(`
      UPPER(TRIM(mun.nome))
      IN (${parametros.join(", ")})
    `);
    }

    // Situação cadastral.
    if (situacao) {
      where.push(`
      est.situacao_cadastral_codigo = :situacao
    `);

      replacements.situacao = situacao;
    }

    // Segmento.
    if (segmento) {
      const sqlSegmento = EmpresaControllers.sqlSegmentoCnae("est");

      where.push(`
      (${sqlSegmento}) = :segmento
    `);

      replacements.segmento = segmento;
    }

    // =====================================================
    // PERÍODO
    // =====================================================

    const campoData =
      tipoData === "SITUACAO_CADASTRAL"
        ? "est.data_situacao_cadastral"
        : "est.data_inicio_atividade";

    if (dataInicial) {
      where.push(`
      ${campoData} >= :dataInicial
    `);

      replacements.dataInicial = dataInicial;
    }

    if (dataFinal) {
      where.push(`
      ${campoData} <= :dataFinal
    `);

      replacements.dataFinal = dataFinal;
    }

    return {
      uf,
      municipio,
      regiao,
      municipios,
      segmento,
      situacao,
      dataInicial,
      dataFinal,
      tipoData,
      campoData,

      whereSql: where.join("\n AND "),

      replacements,
    };
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

      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
        100,
      );

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
            CASE
              WHEN est.situacao_cadastral_codigo = '01'
                THEN 'NULA'
              WHEN est.situacao_cadastral_codigo = '02'
                THEN 'ATIVA'
              WHEN est.situacao_cadastral_codigo = '03'
                THEN 'SUSPENSA'
              WHEN est.situacao_cadastral_codigo = '04'
                THEN 'INAPTA'
              WHEN est.situacao_cadastral_codigo = '08'
                THEN 'BAIXADA'
              ELSE 'NÃO INFORMADO'
            END AS situacao_cadastral_descricao,

            est.cnae_principal_codigo,
            cnae.descricao AS cnae_principal_descricao,

            emp.natureza_juridica_codigo,
            emp.porte_codigo,
            CASE
              WHEN emp.porte_codigo = '00'
                THEN 'NÃO INFORMADO'
              WHEN emp.porte_codigo = '01'
                THEN 'MICRO EMPRESA'
              WHEN emp.porte_codigo = '03'
                THEN 'EMPRESA DE PEQUENO PORTE'
              WHEN emp.porte_codigo = '05'
                THEN 'DEMAIS EMPRESAS'
              ELSE 'NÃO INFORMADO'
            END AS porte_descricao,

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

            est.data_inicio_atividade

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
      // =====================================================
      // PARÂMETROS
      // =====================================================

      const pesquisa = String(req.query.pesquisa || "").trim();

      const pagina = Math.max(parseInt(req.query.page, 10) || 1, 1);

      const limite = Math.min(
        Math.max(parseInt(req.query.limit, 10) || 50, 1),
        100,
      );

      const offset = (pagina - 1) * limite;

      // =====================================================
      // REPLACEMENTS
      // =====================================================

      const replacements = {
        limit: limite,
        offset: offset,
      };

      // =====================================================
      // WHERE DINÂMICO
      // =====================================================

      let whereSql = "";

      if (pesquisa) {
        const pesquisaNumerica = pesquisa.replace(/\D/g, "");

        /*
         * Se o usuário digitou somente números,
         * pesquisamos também pelo código CNAE.
         *
         * A descrição é pesquisada sempre.
         */

        if (/^[\d.\-/]+$/.test(pesquisa)) {
          whereSql = `
          WHERE (
            cnae.codigo LIKE :codigoPesquisa
            OR cnae.descricao ILIKE :descricaoPesquisa
          )
        `;

          replacements.codigoPesquisa = `%${pesquisaNumerica}%`;

          replacements.descricaoPesquisa = `%${pesquisa}%`;
        } else {
          whereSql = `
          WHERE
            cnae.descricao ILIKE :descricaoPesquisa
        `;

          replacements.descricaoPesquisa = `%${pesquisa}%`;
        }
      }

      // =====================================================
      // COUNT
      // =====================================================

      const countSql = `
      SELECT
        COUNT(*)::BIGINT AS total

      FROM public.cnaes cnae

      ${whereSql}
    `;

      const [countResult] = await database.sequelize.query(countSql, {
        replacements,
        type: database.Sequelize.QueryTypes.SELECT,
      });

      const totalItens = Number(countResult.total);

      // =====================================================
      // DADOS
      // =====================================================

      const dataSql = `
      SELECT
        cnae.codigo,
        cnae.descricao

      FROM public.cnaes cnae

      ${whereSql}

      ORDER BY
        cnae.codigo

      LIMIT :limit
      OFFSET :offset
    `;

      const dados = await database.sequelize.query(dataSql, {
        replacements,
        type: database.Sequelize.QueryTypes.SELECT,
      });

      // =====================================================
      // FORMATAR CNAE
      // =====================================================

      const dadosFormatados = dados.map((item) => ({
        codigo: item.codigo,

        codigo_formatado: EmpresaControllers.formatarCnae(item.codigo),

        descricao: item.descricao,
      }));

      // =====================================================
      // RESPONSE
      // =====================================================

      return res.status(200).json({
        filtros: {
          pesquisa: pesquisa || null,
        },

        paginacao: {
          pagina,
          limite,

          total_itens: totalItens,

          total_paginas: Math.ceil(totalItens / limite),
        },

        dados: dadosFormatados,
      });
    } catch (error) {
      console.error("Erro ao listar CNAEs:", error);

      return res.status(500).json({
        message: "Erro ao listar CNAEs.",
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

  static async pesquisarEmpresas(req, res) {
    try {
      // =====================================================
      // FILTROS
      // =====================================================

      const cnae = String(req.query.cnae || "").replace(/\D/g, "");
      const uf = String(req.query.uf || "CE")
        .trim()
        .toUpperCase();

      const municipio = String(req.query.municipio || "").trim();
      const porte = String(req.query.porte || "").trim();
      const regiao = String(req.query.regiao || "").trim();

      /*
       * Municípios pertencentes à região.
       *
       * O frontend enviará:
       * municipios=Fortaleza|Caucaia|Maracanau|...
       */
      const municipios = String(req.query.municipios || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);

      // =====================================================
      // PAGINAÇÃO
      // =====================================================

      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
        100,
      );

      const offset = (page - 1) * limit;

      // =====================================================
      // VALIDAÇÕES
      // =====================================================

      if (cnae && cnae.length !== 7) {
        return res.status(400).json({
          message: "O CNAE deve conter exatamente sete números.",
        });
      }

      if (!/^[A-Z]{2}$/.test(uf)) {
        return res.status(400).json({
          message: "A UF deve conter exatamente duas letras.",
        });
      }

      const portesValidos = ["", "00", "01", "03", "05"];

      if (!portesValidos.includes(porte)) {
        return res.status(400).json({
          message: "Porte da empresa inválido.",
        });
      }

      /*
       * Evita uma consulta de todas as empresas ativas do Ceará.
       */
      if (!cnae && !municipio && !regiao && !porte) {
        return res.status(400).json({
          message: "Informe pelo menos um filtro para realizar a pesquisa.",
        });
      }

      /*
       * Se região foi informada e município específico não foi,
       * precisamos receber a relação de municípios.
       */
      if (regiao && !municipio && municipios.length === 0) {
        return res.status(400).json({
          message: "Nenhum município foi informado para a região selecionada.",
        });
      }

      // =====================================================
      // COMPETÊNCIA
      // =====================================================

      const competencia = await EmpresaControllers.obterCompetencia(
        req.query.competencia,
      );

      if (!competencia) {
        return res.status(404).json({
          message: "Nenhuma competência encontrada.",
        });
      }

      // =====================================================
      // REPLACEMENTS
      // =====================================================

      const replacements = {
        uf,
        competencia,
        limit,
        offset,
      };

      // =====================================================
      // WHERE DINÂMICO
      // =====================================================

      const where = [
        "est.uf = :uf",
        "est.competencia = :competencia",
        "est.situacao_cadastral_codigo = '02'",
      ];

      // CNAE PRINCIPAL
      if (cnae) {
        where.push("est.cnae_principal_codigo = :cnae");
        replacements.cnae = cnae;
      }

      // MUNICÍPIO ESPECÍFICO
      if (municipio) {
        where.push("UPPER(TRIM(mun.nome)) = :municipio");
        replacements.municipio = municipio.trim().toUpperCase();
      }

      /*
       * REGIÃO
       *
       * Só aplicamos a lista da região quando nenhum
       * município específico foi selecionado.
       */
      if (regiao && !municipio && municipios.length > 0) {
        const parametros = [];

        municipios.forEach((nomeMunicipio, index) => {
          const chave = `municipioRegiao${index}`;

          replacements[chave] = nomeMunicipio;

          parametros.push(`LOWER(TRIM(:${chave}))`);
        });

        where.push(`LOWER(TRIM(mun.nome)) IN (${parametros.join(", ")})`);
      }

      // PORTE
      if (porte) {
        where.push("emp.porte_codigo = :porte");
        replacements.porte = porte;
      }

      const whereSql = where.join("\n AND ");

      // =====================================================
      // TOTAL
      // =====================================================

      const totalResultado = await database.sequelize.query(
        `
          SELECT
            COUNT(DISTINCT est.cnpj_completo)::BIGINT AS total

          FROM public.estabelecimentos est

          INNER JOIN public.empresas emp
            ON emp.id = est.empresa_id
            AND emp.competencia = est.competencia

          LEFT JOIN public.municipios mun
            ON mun.codigo = est.municipio_codigo

          WHERE
            ${whereSql}
        `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      // =====================================================
      // CONSULTA
      // =====================================================

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

            CASE
              WHEN est.situacao_cadastral_codigo = '01'
                THEN 'NULA'
              WHEN est.situacao_cadastral_codigo = '02'
                THEN 'ATIVA'
              WHEN est.situacao_cadastral_codigo = '03'
                THEN 'SUSPENSA'
              WHEN est.situacao_cadastral_codigo = '04'
                THEN 'INAPTA'
              WHEN est.situacao_cadastral_codigo = '08'
                THEN 'BAIXADA'
              ELSE 'NÃO INFORMADO'
            END AS situacao_cadastral_descricao,
            est.cnae_principal_codigo,
            cnae.descricao AS cnae_principal_descricao,
            emp.natureza_juridica_codigo,
            emp.porte_codigo,

            CASE
              WHEN emp.porte_codigo = '00'
                THEN 'NÃO INFORMADO'
              WHEN emp.porte_codigo = '01'
                THEN 'MICRO EMPRESA'
              WHEN emp.porte_codigo = '03'
                THEN 'EMPRESA DE PEQUENO PORTE'
              WHEN emp.porte_codigo = '05'
                THEN 'DEMAIS EMPRESAS'
              ELSE 'NÃO INFORMADO'
            END AS porte_descricao,

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
            est.data_inicio_atividade

          FROM public.estabelecimentos est

          INNER JOIN public.empresas emp
            ON emp.id = est.empresa_id
            AND emp.competencia = est.competencia

          INNER JOIN public.cnaes cnae
            ON cnae.codigo = est.cnae_principal_codigo

          LEFT JOIN public.municipios mun
            ON mun.codigo = est.municipio_codigo

          WHERE
            ${whereSql}

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

      // =====================================================
      // PAGINAÇÃO
      // =====================================================

      const totalItens = Number(totalResultado[0]?.total || 0);

      // =====================================================
      // RESPONSE
      // =====================================================

      return res.status(200).json({
        filtros: {
          cnae: cnae || null,
          cnae_formatado: cnae ? EmpresaControllers.formatarCnae(cnae) : null,
          uf,
          regiao: regiao || null,
          municipio: municipio || null,
          porte: porte || null,
          competencia,
          situacao_cadastral: "02",
          criterio_cnae: cnae ? "principal" : null,
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
      console.error("Erro ao pesquisar empresas:", error);

      return res.status(error.status || 500).json({
        message: error.message || "Erro ao pesquisar empresas.",
      });
    }
  }

  /**
   * GET /estatisticas/indicadores
   *
   * Dashboard consolidado dos indicadores empresariais.
   *
   * Query params:
   *
   * uf=CE
   * competencia=2026-08
   * regiao=Grande Fortaleza
   * municipios=Fortaleza|Caucaia|Maracanau
   * municipio=Fortaleza
   * segmento=COMERCIO
   * situacao=02
   * dataInicial=2026-01-01
   * dataFinal=2026-12-31
   * tipoData=INICIO_ATIVIDADE
   */
  static async indicadoresDashboard(req, res) {
    try {
      // =====================================================
      // COMPETÊNCIA
      // =====================================================

      const competencia = await EmpresaControllers.obterCompetencia(
        req.query.competencia,
      );

      if (!competencia) {
        return res.status(404).json({
          message: "Nenhuma competência encontrada.",
        });
      }

      // =====================================================
      // FILTROS
      // =====================================================

      const filtros = EmpresaControllers.montarFiltrosIndicadores(
        req.query,
        competencia,
      );

      const { whereSql, replacements, campoData } = filtros;

      const sqlSegmento = EmpresaControllers.sqlSegmentoCnae("est");

      // =====================================================
      // 1. RESUMO
      // =====================================================

      const sqlResumo = `
      SELECT
        COUNT(
          DISTINCT est.cnpj_basico
        )::BIGINT AS empresas,

        COUNT(
          DISTINCT est.cnpj_completo
        )::BIGINT AS estabelecimentos,

        COUNT(
          DISTINCT est.municipio_codigo
        )::BIGINT AS municipios,

        COUNT(
          DISTINCT est.cnae_principal_codigo
        )::BIGINT AS cnaes,

        COUNT(
          DISTINCT CASE
            WHEN est.identificador_matriz_filial = '1'
            THEN est.cnpj_completo
          END
        )::BIGINT AS matrizes,

        COUNT(
          DISTINCT CASE
            WHEN est.identificador_matriz_filial = '2'
            THEN est.cnpj_completo
          END
        )::BIGINT AS filiais

      FROM public.estabelecimentos est

      LEFT JOIN public.municipios mun
        ON mun.codigo = est.municipio_codigo

      WHERE ${whereSql}
    `;

      // =====================================================
      // 2. SITUAÇÕES CADASTRAIS
      // =====================================================

      /*
       * IMPORTANTE:
       *
       * Se o usuário filtrar situação=02, este gráfico
       * naturalmente mostrará somente ATIVA.
       *
       * Sem filtro de situação, mostra a distribuição completa.
       */
      const sqlSituacoes = `
      SELECT
        est.situacao_cadastral_codigo
          AS codigo,

        CASE
          WHEN est.situacao_cadastral_codigo = '01'
            THEN 'NULA'

          WHEN est.situacao_cadastral_codigo = '02'
            THEN 'ATIVA'

          WHEN est.situacao_cadastral_codigo = '03'
            THEN 'SUSPENSA'

          WHEN est.situacao_cadastral_codigo = '04'
            THEN 'INAPTA'

          WHEN est.situacao_cadastral_codigo = '08'
            THEN 'BAIXADA'

          ELSE 'NÃO INFORMADA'
        END AS descricao,

        COUNT(
          DISTINCT est.cnpj_basico
        )::BIGINT AS quantidade_empresas,

        COUNT(
          DISTINCT est.cnpj_completo
        )::BIGINT AS quantidade_estabelecimentos

      FROM public.estabelecimentos est

      LEFT JOIN public.municipios mun
        ON mun.codigo = est.municipio_codigo

      WHERE ${whereSql}

      GROUP BY
        est.situacao_cadastral_codigo

      ORDER BY
        est.situacao_cadastral_codigo
    `;

      // =====================================================
      // 3. SEGMENTOS
      // =====================================================

      const sqlSegmentos = `
      SELECT
        ${sqlSegmento} AS segmento,

        COUNT(
          DISTINCT est.cnpj_basico
        )::BIGINT AS quantidade_empresas,

        COUNT(
          DISTINCT est.cnpj_completo
        )::BIGINT AS quantidade_estabelecimentos

      FROM public.estabelecimentos est

      LEFT JOIN public.municipios mun
        ON mun.codigo = est.municipio_codigo

      WHERE ${whereSql}

        AND est.cnae_principal_codigo
            IS NOT NULL

        AND est.cnae_principal_codigo
            ~ '^[0-9]{7}$'

      GROUP BY
        ${sqlSegmento}

      ORDER BY
        quantidade_empresas DESC
    `;

      // =====================================================
      // 4. MUNICÍPIOS
      // =====================================================

      const sqlMunicipios = `
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
        ON mun.codigo = est.municipio_codigo

      WHERE ${whereSql}

      GROUP BY
        est.municipio_codigo,
        mun.nome

      ORDER BY
        quantidade_empresas DESC,
        mun.nome ASC
    `;

      // =====================================================
      // 5. TOP 10 ATIVIDADES ECONÔMICAS
      // =====================================================

      const sqlTopAtividades = `
      SELECT
        est.cnae_principal_codigo
          AS cnae_codigo,

        cnae.descricao
          AS cnae_descricao,

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

      INNER JOIN public.cnaes cnae
        ON cnae.codigo =
           est.cnae_principal_codigo

      LEFT JOIN public.municipios mun
        ON mun.codigo =
           est.municipio_codigo

      WHERE ${whereSql}

        AND est.cnae_principal_codigo
            IS NOT NULL

      GROUP BY
        est.cnae_principal_codigo,
        cnae.descricao

      ORDER BY
        quantidade_empresas DESC,
        cnae.descricao ASC

      LIMIT 10
    `;

      // =====================================================
      // 6. EVOLUÇÃO TEMPORAL
      // =====================================================

      /*
       * O campo usado depende de tipoData:
       *
       * INICIO_ATIVIDADE
       *   -> data_inicio_atividade
       *
       * SITUACAO_CADASTRAL
       *   -> data_situacao_cadastral
       */
      const sqlEvolucao = `
      SELECT
        DATE_TRUNC(
          'month',
          ${campoData}
        )::DATE AS periodo,

        COUNT(
          DISTINCT est.cnpj_basico
        )::BIGINT AS quantidade_empresas,

        COUNT(
          DISTINCT est.cnpj_completo
        )::BIGINT AS quantidade_estabelecimentos

      FROM public.estabelecimentos est

      LEFT JOIN public.municipios mun
        ON mun.codigo =
           est.municipio_codigo

      WHERE ${whereSql}

        AND ${campoData} IS NOT NULL

      GROUP BY
        DATE_TRUNC(
          'month',
          ${campoData}
        )

      ORDER BY
        periodo ASC
    `;

      // =====================================================
      // EXECUTAR EM PARALELO
      // =====================================================

      const [
        resumoResultado,
        situacoesResultado,
        segmentosResultado,
        municipiosResultado,
        topAtividadesResultado,
        evolucaoResultado,
      ] = await Promise.all([
        database.sequelize.query(sqlResumo, {
          replacements,
          type: QueryTypes.SELECT,
        }),

        database.sequelize.query(sqlSituacoes, {
          replacements,
          type: QueryTypes.SELECT,
        }),

        database.sequelize.query(sqlSegmentos, {
          replacements,
          type: QueryTypes.SELECT,
        }),

        database.sequelize.query(sqlMunicipios, {
          replacements,
          type: QueryTypes.SELECT,
        }),

        database.sequelize.query(sqlTopAtividades, {
          replacements,
          type: QueryTypes.SELECT,
        }),

        database.sequelize.query(sqlEvolucao, {
          replacements,
          type: QueryTypes.SELECT,
        }),
      ]);

      // =====================================================
      // RESUMO
      // =====================================================

      const resumoBanco = resumoResultado[0] || {};

      const resumo = {
        empresas: Number(resumoBanco.empresas || 0),
        estabelecimentos: Number(resumoBanco.estabelecimentos || 0),
        municipios: Number(resumoBanco.municipios || 0),
        cnaes: Number(resumoBanco.cnaes || 0),
        matrizes: Number(resumoBanco.matrizes || 0),
        filiais: Number(resumoBanco.filiais || 0),
      };

      // =====================================================
      // SITUAÇÕES
      // =====================================================

      const situacoesMap = new Map(
        situacoesResultado.map((item) => [item.codigo, item]),
      );

      /*
       * Quando NÃO houver filtro por situação,
       * garantimos que os cinco códigos apareçam,
       * mesmo que algum tenha quantidade zero.
       */
      const situacoesPadrao = [
        {
          codigo: "01",
          descricao: "NULA",
        },
        {
          codigo: "02",
          descricao: "ATIVA",
        },
        {
          codigo: "03",
          descricao: "SUSPENSA",
        },
        {
          codigo: "04",
          descricao: "INAPTA",
        },
        {
          codigo: "08",
          descricao: "BAIXADA",
        },
      ];

      let situacoes;

      if (filtros.situacao) {
        situacoes = situacoesResultado.map((item) => ({
          codigo: item.codigo,
          descricao: item.descricao,
          quantidade_empresas: Number(item.quantidade_empresas || 0),
          quantidade_estabelecimentos: Number(
            item.quantidade_estabelecimentos || 0,
          ),
        }));
      } else {
        situacoes = situacoesPadrao.map((situacao) => {
          const encontrado = situacoesMap.get(situacao.codigo);
          return {
            ...situacao,
            quantidade_empresas: Number(encontrado?.quantidade_empresas || 0),
            quantidade_estabelecimentos: Number(
              encontrado?.quantidade_estabelecimentos || 0,
            ),
          };
        });
      }

      // =====================================================
      // SEGMENTOS
      // =====================================================

      const segmentos = segmentosResultado.map((item) => ({
        segmento: item.segmento,
        quantidade_empresas: Number(item.quantidade_empresas || 0),
        quantidade_estabelecimentos: Number(
          item.quantidade_estabelecimentos || 0,
        ),
      }));

      // =====================================================
      // MUNICÍPIOS
      // =====================================================

      const municipios = municipiosResultado.map((item) => ({
        municipio_codigo: item.municipio_codigo,
        municipio: item.municipio,
        quantidade_empresas: Number(item.quantidade_empresas || 0),
        quantidade_estabelecimentos: Number(
          item.quantidade_estabelecimentos || 0,
        ),
        quantidade_matrizes: Number(item.quantidade_matrizes || 0),
        quantidade_filiais: Number(item.quantidade_filiais || 0),
      }));

      // =====================================================
      // TOP ATIVIDADES
      // =====================================================

      const topAtividades = topAtividadesResultado.map((item, index) => ({
        posicao: index + 1,
        cnae_codigo: item.cnae_codigo,
        cnae_formatado: EmpresaControllers.formatarCnae(item.cnae_codigo),
        cnae_descricao: item.cnae_descricao,
        quantidade_empresas: Number(item.quantidade_empresas || 0),
        quantidade_estabelecimentos: Number(
          item.quantidade_estabelecimentos || 0,
        ),
        quantidade_matrizes: Number(item.quantidade_matrizes || 0),
        quantidade_filiais: Number(item.quantidade_filiais || 0),
      }));

      // =====================================================
      // EVOLUÇÃO
      // =====================================================

      const evolucao = evolucaoResultado.map((item) => ({
        periodo: item.periodo,
        quantidade_empresas: Number(item.quantidade_empresas || 0),
        quantidade_estabelecimentos: Number(
          item.quantidade_estabelecimentos || 0,
        ),
      }));

      // =====================================================
      // RESPONSE
      // =====================================================

      return res.status(200).json({
        filtros: {
          uf: filtros.uf,
          competencia,
          regiao: filtros.regiao || null,
          municipio: filtros.municipio || null,
          segmento: filtros.segmento || null,
          situacao: filtros.situacao || null,
          data_inicial: filtros.dataInicial || null,
          data_final: filtros.dataFinal || null,
          tipo_data: filtros.tipoData,
        },

        resumo,
        situacoes,
        segmentos,
        municipios,
        top_atividades: topAtividades,
        evolucao,
      });
    } catch (error) {
      console.error("Erro ao gerar indicadores:", error);

      return res.status(error.status || 500).json({
        message: error.message || "Erro ao gerar indicadores.",
      });
    }
  }

  static async pesquisarEmpresasJucec(req, res) {
    try {
      // =====================================================
      // FILTROS
      // =====================================================

      const cnae = String(req.query.cnae || "").replace(/\D/g, "");

      const municipio = String(req.query.municipio || "").trim();

      const porte = String(req.query.porte || "")
        .trim()
        .toUpperCase();

      const regiao = String(req.query.regiao || "").trim();

      /*
       * Mantido por compatibilidade com o frontend atual.
       *
       * municipios=Fortaleza|Caucaia|Maracanau|...
       *
       * Entretanto, como a JUCEC já possui a coluna regiao,
       * a pesquisa principal por região poderá utilizar
       * diretamente je.regiao.
       */
      const municipios = String(req.query.municipios || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);

      // =====================================================
      // PAGINAÇÃO
      // =====================================================

      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

      const limit = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
        100,
      );

      const offset = (page - 1) * limit;

      // =====================================================
      // VALIDAÇÕES
      // =====================================================

      if (cnae && cnae.length !== 7) {
        return res.status(400).json({
          message: "O CNAE deve conter exatamente sete números.",
        });
      }

      /*
       * Na JUCEC o porte é textual.
       *
       * Valores observados na carga:
       * ME
       * EPP
       * NORMAL
       */
      const portesValidos = ["", "ME", "EPP", "NORMAL"];

      if (!portesValidos.includes(porte)) {
        return res.status(400).json({
          message: "Porte da empresa inválido.",
        });
      }

      /*
       * Evita consulta irrestrita de todas as ocorrências
       * ativas da JUCEC.
       */
      if (!cnae && !municipio && !regiao && !porte) {
        return res.status(400).json({
          message: "Informe pelo menos um filtro para realizar a pesquisa.",
        });
      }

      // =====================================================
      // COMPETÊNCIA JUCEC
      // =====================================================

      /*
       * IMPORTANTE:
       *
       * Não utilizar obterCompetencia() da Receita caso ela
       * consulte public.estabelecimentos.
       *
       * A competência deve ser obtida exclusivamente da
       * public.junta_empresas.
       */
      const competencia = await EmpresaControllers.obterCompetenciaJucec(
        req.query.competencia,
      );

      if (!competencia) {
        return res.status(404).json({
          message: "Nenhuma competência da JUCEC encontrada.",
        });
      }

      // =====================================================
      // REPLACEMENTS
      // =====================================================

      const replacements = {
        competencia,
        limit,
        offset,
      };

      // =====================================================
      // WHERE DINÂMICO
      // =====================================================

      const where = [
        "je.competencia = :competencia",

        /*
         * ATENÇÃO:
         * ATIVA aqui significa situação informada pela JUCEC.
         * Não é uma conversão do código 02 da Receita.
         */
        "je.status = 'ATIVA'",
      ];

      // -----------------------------------------------------
      // CNAE
      // -----------------------------------------------------

      /*
       * A JUCEC fornece uma lista de CNAEs.
       *
       * Não classificamos nenhum deles como principal.
       *
       * EXISTS evita multiplicar a ocorrência caso ela
       * possua vários CNAEs.
       */
      if (cnae) {
        where.push(`
        EXISTS (
          SELECT 1

          FROM public.junta_empresa_cnaes jec

          WHERE jec.junta_empresa_id = je.id
            AND jec.cnae_codigo = :cnae
        )
      `);

        replacements.cnae = cnae;
      }

      // -----------------------------------------------------
      // MUNICÍPIO ESPECÍFICO
      // -----------------------------------------------------

      if (municipio) {
        where.push("UPPER(TRIM(je.municipio)) = :municipio");

        replacements.municipio = municipio.toUpperCase();
      }

      // -----------------------------------------------------
      // REGIÃO
      // -----------------------------------------------------

      /*
       * Diferentemente da Receita, a JUCEC já possui
       * a região diretamente no registro.
       *
       * Portanto não precisamos inferir região por uma
       * lista de municípios.
       */
      if (regiao && !municipio) {
        where.push("UPPER(TRIM(je.regiao)) = :regiao");

        replacements.regiao = regiao.toUpperCase();
      }

      // -----------------------------------------------------
      // PORTE
      // -----------------------------------------------------

      if (porte) {
        where.push("UPPER(TRIM(je.porte)) = :porte");

        replacements.porte = porte;
      }

      const whereSql = where.join("\n AND ");

      // =====================================================
      // TOTAL
      // =====================================================

      /*
       * IMPORTANTE:
       *
       * Não usar COUNT(DISTINCT cnpj).
       *
       * A unidade desta consulta é a OCORRÊNCIA JUCEC.
       * Portanto contamos je.id.
       */
      const totalResultado = await database.sequelize.query(
        `
          SELECT
            COUNT(je.id)::BIGINT AS total

          FROM public.junta_empresas je

          WHERE
            ${whereSql}
        `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      // =====================================================
      // CONSULTA
      // =====================================================

      const empresas = await database.sequelize.query(
        `
          SELECT
            -- ---------------------------------------------
            -- IDENTIFICAÇÃO DA OCORRÊNCIA
            -- ---------------------------------------------

            je.id AS ocorrencia_id,
            je.ocorrencia_arquivo,
            je.cnpj,

            -- ---------------------------------------------
            -- EMPRESA
            -- ---------------------------------------------

            je.razao_social,
            je.nome_fantasia,

            -- ---------------------------------------------
            -- SITUAÇÃO JUCEC
            -- ---------------------------------------------

            je.status,

            je.porte,

            CASE
              WHEN je.porte = 'ME'
                THEN 'MICROEMPRESA'

              WHEN je.porte = 'EPP'
                THEN 'EMPRESA DE PEQUENO PORTE'

              WHEN je.porte = 'NORMAL'
                THEN 'NORMAL'

              ELSE 'NÃO INFORMADO'
            END AS porte_descricao,

            -- ---------------------------------------------
            -- LOCALIZAÇÃO
            -- ---------------------------------------------

            je.municipio,
            je.regiao,

            -- ---------------------------------------------
            -- ENDEREÇO
            -- ---------------------------------------------

            je.tipo_logradouro,
            je.logradouro,
            je.numero,
            je.bairro,

            -- ---------------------------------------------
            -- CONTATO
            -- ---------------------------------------------

            je.ddd_telefone,
            je.telefone,
            je.email,

            -- ---------------------------------------------
            -- SIMPLES
            -- ---------------------------------------------

            je.opcao_simples_nacional,

            -- ---------------------------------------------
            -- DATAS
            -- ---------------------------------------------

            je.data_abertura,
            je.data_encerramento,

            -- ---------------------------------------------
            -- CONTROLE
            -- ---------------------------------------------

            je.competencia,

            -- ---------------------------------------------
            -- CNAES DA OCORRÊNCIA
            -- ---------------------------------------------

            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'codigo',
                    jec.cnae_codigo,

                    'descricao',
                    c.descricao,

                    'ordem',
                    jec.ordem
                  )
                  ORDER BY jec.ordem
                )

                FROM public.junta_empresa_cnaes jec

                INNER JOIN public.cnaes c
                  ON c.codigo = jec.cnae_codigo

                WHERE
                  jec.junta_empresa_id = je.id
              ),
              '[]'::json
            ) AS cnaes

          FROM public.junta_empresas je

          WHERE
            ${whereSql}

          ORDER BY
            je.razao_social ASC,
            je.cnpj ASC,
            je.id ASC

          LIMIT :limit
          OFFSET :offset
        `,
        {
          replacements,
          type: QueryTypes.SELECT,
        },
      );

      // =====================================================
      // PAGINAÇÃO
      // =====================================================

      const totalItens = Number(totalResultado[0]?.total || 0);

      // =====================================================
      // RESPONSE
      // =====================================================

      return res.status(200).json({
        fonte: "JUCEC",

        filtros: {
          cnae: cnae || null,

          cnae_formatado: cnae ? EmpresaControllers.formatarCnae(cnae) : null,

          regiao: regiao || null,
          municipio: municipio || null,
          porte: porte || null,

          competencia,

          status: "ATIVA",

          /*
           * Diferentemente da Receita, não afirmamos
           * que o CNAE encontrado é principal.
           */
          criterio_cnae: cnae ? "qualquer_cnae_informado_pela_jucec" : null,
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
      console.error("Erro ao pesquisar empresas na JUCEC:", error);

      return res.status(error.status || 500).json({
        message: error.message || "Erro ao pesquisar empresas na JUCEC.",
      });
    }
  }

  static async obterCompetenciaJucec(competenciaInformada = null) {
    // =====================================================
    // COMPETÊNCIA INFORMADA
    // =====================================================

    if (competenciaInformada) {
      const competencia = String(competenciaInformada).trim();

      if (!/^\d{4}-\d{2}$/.test(competencia)) {
        const error = new Error(
          "Competência inválida. Utilize o formato YYYY-MM.",
        );

        error.status = 400;

        throw error;
      }

      const resultado = await database.sequelize.query(
        `
          SELECT competencia

          FROM public.junta_empresas

          WHERE competencia = :competencia

          LIMIT 1
        `,
        {
          replacements: {
            competencia,
          },
          type: QueryTypes.SELECT,
        },
      );

      if (!resultado.length) {
        return null;
      }

      return resultado[0].competencia;
    }

    // =====================================================
    // ÚLTIMA COMPETÊNCIA DISPONÍVEL
    // =====================================================

    const resultado = await database.sequelize.query(
      `
        SELECT MAX(competencia) AS competencia
        FROM public.junta_empresas
      `,
      {
        type: QueryTypes.SELECT,
      },
    );

    return resultado[0]?.competencia || null;
  }
}

module.exports = EmpresaControllers;

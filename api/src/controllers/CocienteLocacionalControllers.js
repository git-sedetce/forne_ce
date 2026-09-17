const { Op, fn, col } = require("sequelize");
const database = require("../models");

class CocienteLocacionalControllers {
  // ==========================================================
  // RESOLVER COMPETÊNCIA
  //
  // Se a competência for informada:
  //   usa a competência recebida.
  //
  // Se não for informada:
  //   busca automaticamente a maior competência existente
  //   em analytics.cociente_locacional.
  //
  // Retorno:
  //   "2026-08"
  // ==========================================================

  static async resolverCompetencia(competenciaInformada = null) {
    // --------------------------------------------------------
    // COMPETÊNCIA INFORMADA PELO FRONTEND
    // --------------------------------------------------------

    if (competenciaInformada) {
      const competencia = String(competenciaInformada).trim();

      // Valida formato YYYY-MM
      const regex = /^\d{4}-(0[1-9]|1[0-2])$/;

      if (!regex.test(competencia)) {
        const erro = new Error(
          "Competência inválida. Utilize o formato YYYY-MM.",
        );

        erro.status = 400;

        throw erro;
      }

      // Verifica se a competência realmente existe
      const existe = await database.CocienteLocacional.count({
        where: {
          competencia,
        },
      });

      if (!existe) {
        const erro = new Error(
          `Não existem dados de cociente locacional ` +
            `para a competência ${competencia}.`,
        );

        erro.status = 404;

        throw erro;
      }

      return competencia;
    }

    // --------------------------------------------------------
    // NENHUMA COMPETÊNCIA INFORMADA
    //
    // Busca a competência mais recente disponível.
    // Como o formato é YYYY-MM, MAX() funciona corretamente.
    // --------------------------------------------------------

    const resultado = await database.CocienteLocacional.findOne({
      attributes: [[fn("MAX", col("competencia")), "competencia"]],

      raw: true,
    });

    const competencia = resultado?.competencia;

    if (!competencia) {
      const erro = new Error(
        "Nenhum cálculo de cociente locacional encontrado.",
      );

      erro.status = 404;

      throw erro;
    }

    return competencia;
  }

  // ==========================================================
  // LISTAR COCIENTES
  //
  // GET /api/cociente-locacional
  //
  // Exemplos:
  //
  // /api/cociente-locacional
  //
  // /api/cociente-locacional?competencia=2026-08
  //
  // /api/cociente-locacional?municipio=Fortaleza
  //
  // /api/cociente-locacional?municipio_codigo=1389
  //
  // /api/cociente-locacional?cnae=4761003
  //
  // /api/cociente-locacional?ql_min=1
  //
  // /api/cociente-locacional?page=1&limit=20
  // ==========================================================

  static async listar(req, res) {
    try {
      const {
        competencia: competenciaQuery,
        municipio,
        municipio_codigo,
        cnae,
        ql_min,
        page = 1,
        limit = 20,
      } = req.query;

      // ------------------------------------------------------
      // RESOLVE A COMPETÊNCIA
      // ------------------------------------------------------

      const competencia =
        await CocienteLocacionalControllers.resolverCompetencia(
          competenciaQuery,
        );

      // ------------------------------------------------------
      // WHERE
      // ------------------------------------------------------

      const where = {
        competencia,
      };

      // ------------------------------------------------------
      // MUNICÍPIO POR CÓDIGO
      // ------------------------------------------------------

      if (municipio_codigo) {
        where.municipio_codigo = String(municipio_codigo).trim();
      }

      // ------------------------------------------------------
      // MUNICÍPIO POR NOME
      // ------------------------------------------------------

      if (municipio) {
        where.municipio_nome = {
          [Op.iLike]: `%${String(municipio).trim()}%`,
        };
      }

      // ------------------------------------------------------
      // CNAE
      // ------------------------------------------------------

      if (cnae) {
        where.cnae_codigo = String(cnae).replace(/\D/g, "");
      }

      // ------------------------------------------------------
      // QL MÍNIMO
      // ------------------------------------------------------

      if (ql_min !== undefined && ql_min !== null && ql_min !== "") {
        const qlMin = Number(ql_min);

        if (Number.isNaN(qlMin) || qlMin < 0) {
          return res.status(400).json({
            message: "ql_min deve ser um número maior ou igual a zero.",
          });
        }

        where.cociente_locacional = {
          [Op.gte]: qlMin,
        };
      }

      // ------------------------------------------------------
      // PAGINAÇÃO
      // ------------------------------------------------------

      const pagina = Math.max(parseInt(page, 10) || 1, 1);

      const limite = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

      const offset = (pagina - 1) * limite;

      // ------------------------------------------------------
      // CONSULTA
      // ------------------------------------------------------

      const resultado = await database.CocienteLocacional.findAndCountAll({
        where,

        attributes: [
          "id",

          "competencia",

          "municipio_codigo",
          "municipio_nome",

          "cnae_codigo",
          "cnae_descricao",

          "cociente_locacional",

          "empresas_municipio_cnae",
          "empresas_municipio",

          "empresas_estado_cnae",
          "empresas_estado",
        ],

        order: [
          ["cociente_locacional", "DESC"],

          ["municipio_nome", "ASC"],

          ["cnae_codigo", "ASC"],
        ],

        limit: limite,

        offset,
      });

      // ------------------------------------------------------
      // RESPOSTA
      // ------------------------------------------------------

      return res.status(200).json({
        competencia,

        competencia_automatica: !competenciaQuery,

        filtros: {
          municipio: municipio || null,

          municipio_codigo: municipio_codigo || null,

          cnae: cnae || null,

          ql_min: ql_min || null,
        },

        paginacao: {
          pagina,

          limite,

          total_registros: resultado.count,

          total_paginas: Math.ceil(resultado.count / limite),
        },

        dados: resultado.rows,
      });
    } catch (error) {
      console.error("Erro ao listar cociente locacional:", error);

      return res.status(error.status || 500).json({
        message: error.status
          ? error.message
          : "Erro ao consultar cociente locacional.",

        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // ==========================================================
  // CNAES POR MUNICÍPIO
  //
  // GET /api/cociente-locacional/municipio/:codigo
  //
  // Exemplos:
  //
  // /municipio/1389
  //
  // /municipio/1389?competencia=2026-08
  // ==========================================================

  static async porMunicipio(req, res) {
    try {
      const { codigo } = req.params;

      const { competencia: competenciaQuery, ql_min } = req.query;

      // ------------------------------------------------------
      // RESOLVE COMPETÊNCIA
      // ------------------------------------------------------

      const competencia =
        await CocienteLocacionalControllers.resolverCompetencia(
          competenciaQuery,
        );

      // ------------------------------------------------------
      // WHERE
      // ------------------------------------------------------

      const where = {
        competencia,

        municipio_codigo: String(codigo).trim(),
      };

      // ------------------------------------------------------
      // QL MÍNIMO OPCIONAL
      // ------------------------------------------------------

      if (ql_min !== undefined && ql_min !== "") {
        const qlMin = Number(ql_min);

        if (Number.isNaN(qlMin) || qlMin < 0) {
          return res.status(400).json({
            message: "ql_min deve ser um número maior ou igual a zero.",
          });
        }

        where.cociente_locacional = {
          [Op.gte]: qlMin,
        };
      }

      // ------------------------------------------------------
      // CONSULTA
      // ------------------------------------------------------

      const dados = await database.CocienteLocacional.findAll({
        where,

        attributes: [
          "competencia",

          "municipio_codigo",
          "municipio_nome",

          "cnae_codigo",
          "cnae_descricao",

          "cociente_locacional",

          "empresas_municipio_cnae",
          "empresas_municipio",

          "empresas_estado_cnae",
          "empresas_estado",
        ],

        order: [
          ["cociente_locacional", "DESC"],

          ["cnae_codigo", "ASC"],
        ],
      });

      // ------------------------------------------------------
      // NÃO ENCONTRADO
      // ------------------------------------------------------

      if (!dados.length) {
        return res.status(404).json({
          message:
            "Nenhum cociente encontrado " + "para o município informado.",

          municipio_codigo: codigo,

          competencia,
        });
      }

      // ------------------------------------------------------
      // RESPOSTA
      // ------------------------------------------------------

      return res.status(200).json({
        competencia,

        competencia_automatica: !competenciaQuery,

        municipio: {
          codigo: dados[0].municipio_codigo,

          nome: dados[0].municipio_nome,
        },

        total_cnaes: dados.length,

        dados,
      });
    } catch (error) {
      console.error("Erro ao consultar município:", error);

      return res.status(error.status || 500).json({
        message: error.status
          ? error.message
          : "Erro ao consultar cocientes do município.",
      });
    }
  }

  // ==========================================================
  // MUNICÍPIOS POR CNAE
  //
  // GET /api/cociente-locacional/cnae/:codigo
  //
  // Exemplos:
  //
  // /cnae/4761003
  //
  // /cnae/4761003?competencia=2026-08
  //
  // /cnae/4761003?ql_min=1
  // ==========================================================

  static async porCnae(req, res) {
    try {
      const { codigo } = req.params;

      const { competencia: competenciaQuery, ql_min } = req.query;

      // ------------------------------------------------------
      // NORMALIZA CNAE
      // ------------------------------------------------------

      const cnaeCodigo = String(codigo).replace(/\D/g, "");

      if (cnaeCodigo.length !== 7) {
        return res.status(400).json({
          message: "CNAE inválido. Informe os 7 dígitos.",
        });
      }

      // ------------------------------------------------------
      // RESOLVE COMPETÊNCIA
      // ------------------------------------------------------

      const competencia =
        await CocienteLocacionalControllers.resolverCompetencia(
          competenciaQuery,
        );

      // ------------------------------------------------------
      // WHERE
      // ------------------------------------------------------

      const where = {
        competencia,

        cnae_codigo: cnaeCodigo,
      };

      // ------------------------------------------------------
      // QL MÍNIMO
      // ------------------------------------------------------

      if (ql_min !== undefined && ql_min !== "") {
        const qlMin = Number(ql_min);

        if (Number.isNaN(qlMin) || qlMin < 0) {
          return res.status(400).json({
            message: "ql_min deve ser um número maior ou igual a zero.",
          });
        }

        where.cociente_locacional = {
          [Op.gte]: qlMin,
        };
      }

      // ------------------------------------------------------
      // CONSULTA
      // ------------------------------------------------------

      const dados = await database.CocienteLocacional.findAll({
        where,

        attributes: [
          "competencia",

          "municipio_codigo",
          "municipio_nome",

          "cnae_codigo",
          "cnae_descricao",

          "cociente_locacional",

          "empresas_municipio_cnae",
          "empresas_municipio",

          "empresas_estado_cnae",
          "empresas_estado",
        ],

        order: [
          ["cociente_locacional", "DESC"],

          ["municipio_nome", "ASC"],
        ],
      });

      // ------------------------------------------------------
      // NÃO ENCONTRADO
      // ------------------------------------------------------

      if (!dados.length) {
        return res.status(404).json({
          message: "Nenhum cociente encontrado " + "para o CNAE informado.",

          cnae_codigo: cnaeCodigo,

          competencia,
        });
      }

      // ------------------------------------------------------
      // RESPOSTA
      // ------------------------------------------------------

      return res.status(200).json({
        competencia,

        competencia_automatica: !competenciaQuery,

        cnae: {
          codigo: dados[0].cnae_codigo,

          descricao: dados[0].cnae_descricao,
        },

        total_municipios: dados.length,

        dados,
      });
    } catch (error) {
      console.error("Erro ao consultar CNAE:", error);

      return res.status(error.status || 500).json({
        message: error.status
          ? error.message
          : "Erro ao consultar cocientes do CNAE.",
      });
    }
  }

  // ==========================================================
  // LISTAR COMPETÊNCIAS DISPONÍVEIS
  //
  // GET /api/cociente-locacional/competencias
  // ==========================================================

  static async competencias(req, res) {
    try {
      const dados = await database.CocienteLocacional.findAll({
        attributes: ["competencia"],

        group: ["competencia"],

        order: [["competencia", "DESC"]],

        raw: true,
      });

      const competencias = dados.map((item) => item.competencia);

      return res.status(200).json({
        competencia_atual: competencias[0] || null,

        total: competencias.length,

        competencias,
      });
    } catch (error) {
      console.error("Erro ao listar competências:", error);

      return res.status(500).json({
        message: "Erro ao listar competências disponíveis.",
      });
    }
  }
}

module.exports = CocienteLocacionalControllers;

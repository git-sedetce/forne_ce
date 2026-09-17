const { Op } = require("sequelize");
const database = require("../models");


class CocienteLocacionalControllers {

  // ==========================================================
  // LISTAR COCIENTES
  //
  // GET /api/cociente-locacional
  //
  // Exemplos:
  //
  // ?competencia=2026-08
  // ?municipio=Fortaleza
  // ?municipio_codigo=1389
  // ?cnae=4761003
  // ?ql_min=1
  // ?page=1&limit=20
  // ==========================================================

  static async listar(req, res) {
    try {
      const {
        competencia,
        municipio,
        municipio_codigo,
        cnae,
        ql_min,
        page = 1,
        limit = 20,
      } = req.query;

      const where = {};

      // ------------------------------------------------------
      // COMPETÊNCIA
      // ------------------------------------------------------

      if (competencia) {
        where.competencia = competencia;
      }

      // ------------------------------------------------------
      // MUNICÍPIO POR CÓDIGO
      // ------------------------------------------------------

      if (municipio_codigo) {
        where.municipio_codigo = municipio_codigo;
      }

      // ------------------------------------------------------
      // MUNICÍPIO POR NOME
      // ------------------------------------------------------

      if (municipio) {
        where.municipio_nome = {
          [Op.iLike]: `%${municipio}%`,
        };
      }

      // ------------------------------------------------------
      // CNAE
      // ------------------------------------------------------

      if (cnae) {
        where.cnae_codigo = cnae;
      }

      // ------------------------------------------------------
      // QL MÍNIMO
      // ------------------------------------------------------

      if (ql_min !== undefined) {
        const qlMin = Number(ql_min);

        if (Number.isNaN(qlMin)) {
          return res.status(400).json({
            message: "ql_min deve ser numérico.",
          });
        }

        where.cociente_locacional = {
          [Op.gte]: qlMin,
        };
      }

      // ------------------------------------------------------
      // PAGINAÇÃO
      // ------------------------------------------------------

      const pagina = Math.max(
        parseInt(page, 10) || 1,
        1
      );

      const limite = Math.min(
        Math.max(
          parseInt(limit, 10) || 20,
          1
        ),
        100
      );

      const offset =
        (pagina - 1) * limite;

      // ------------------------------------------------------
      // CONSULTA
      // ------------------------------------------------------

      const resultado =
        await database.CocienteLocacional.findAndCountAll({
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
            [
              "cociente_locacional",
              "DESC",
            ],
          ],

          limit: limite,
          offset,
        });

      // ------------------------------------------------------
      // RESPOSTA
      // ------------------------------------------------------

      return res.status(200).json({
        competencia:
          competencia || null,

        filtros: {
          municipio:
            municipio || null,

          municipio_codigo:
            municipio_codigo || null,

          cnae:
            cnae || null,

          ql_min:
            ql_min || null,
        },

        paginacao: {
          pagina,
          limite,

          total_registros:
            resultado.count,

          total_paginas:
            Math.ceil(
              resultado.count / limite
            ),
        },

        dados: resultado.rows,
      });

    } catch (error) {

      console.error(
        "Erro ao listar cociente locacional:",
        error
      );

      return res.status(500).json({
        message:
          "Erro ao consultar cociente locacional.",

        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : undefined,
      });
    }
  }


  // ==========================================================
  // CNAES DE UM MUNICÍPIO
  //
  // GET /api/cociente-locacional/municipio/:codigo
  //
  // Exemplo:
  //
  // /municipio/1389?competencia=2026-08
  // ==========================================================

  static async porMunicipio(req, res) {
    try {
      const { codigo } = req.params;
      const { competencia } = req.query;

      const where = {
        municipio_codigo: codigo,
      };

      if (competencia) {
        where.competencia = competencia;
      }

      const dados =
        await database.CocienteLocacional.findAll({
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
            [
              "cociente_locacional",
              "DESC",
            ],
          ],
        });

      if (!dados.length) {
        return res.status(404).json({
          message:
            "Nenhum cociente encontrado para o município.",
        });
      }

      return res.status(200).json({
        municipio_codigo: codigo,

        municipio_nome:
          dados[0].municipio_nome,

        competencia:
          competencia ||
          dados[0].competencia,

        total: dados.length,

        dados,
      });

    } catch (error) {

      console.error(
        "Erro ao consultar município:",
        error
      );

      return res.status(500).json({
        message:
          "Erro ao consultar cocientes do município.",
      });
    }
  }


  // ==========================================================
  // MUNICÍPIOS POR CNAE
  //
  // GET /api/cociente-locacional/cnae/:codigo
  //
  // Exemplo:
  //
  // /cnae/4761003?competencia=2026-08
  // ==========================================================

  static async porCnae(req, res) {
    try {
      const { codigo } = req.params;
      const { competencia } = req.query;

      const where = {
        cnae_codigo: codigo,
      };

      if (competencia) {
        where.competencia = competencia;
      }

      const dados =
        await database.CocienteLocacional.findAll({
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
            [
              "cociente_locacional",
              "DESC",
            ],
          ],
        });

      if (!dados.length) {
        return res.status(404).json({
          message:
            "Nenhum cociente encontrado para o CNAE.",
        });
      }

      return res.status(200).json({
        cnae_codigo: codigo,

        cnae_descricao:
          dados[0].cnae_descricao,

        competencia:
          competencia ||
          dados[0].competencia,

        total_municipios:
          dados.length,

        dados,
      });

    } catch (error) {

      console.error(
        "Erro ao consultar CNAE:",
        error
      );

      return res.status(500).json({
        message:
          "Erro ao consultar cocientes do CNAE.",
      });
    }
  }
}


module.exports =
  CocienteLocacionalControllers;

const { QueryTypes } = require('sequelize');
const database = require('../models');

class EnriquecimentoController {
  static async solicitar(req, res) {
    try {
      const entrada = req.body.cnpjs;

      if (!Array.isArray(entrada) ||
          entrada.length === 0 ||
          entrada.length > 10) {
        return res.status(400).json({
          message: 'Informe de 1 a 10 CNPJs.'
        });
      }

      const cnpjs = [...new Set(
        entrada.map(cnpj =>
          String(cnpj).replace(/\D/g, '')
        )
      )];

      if (cnpjs.some(cnpj => !/^\d{14}$/.test(cnpj))) {
        return res.status(400).json({
          message: 'Existe um CNPJ inválido.'
        });
      }

      const resultados = [];

      for (const cnpj of cnpjs) {
        const [contato] = await database.sequelize.query(`
          SELECT *
          FROM public.empresas_contatos_comerciais
          WHERE cnpj = :cnpj
        `, {
          replacements: { cnpj },
          type: QueryTypes.SELECT
        });

        const cacheValido =
          contato &&
          contato.proxima_atualizacao &&
          new Date(contato.proxima_atualizacao) > new Date();

        if (cacheValido) {
          resultados.push({
            cnpj,
            status: 'CACHE_VALIDO',
            contato
          });
          continue;
        }

        await database.sequelize.query(`
          INSERT INTO public.empresas_enriquecimento_fila
            (cnpj, status, prioridade)
          VALUES (:cnpj, 'PENDENTE', 1)
          ON CONFLICT (cnpj)
          WHERE status IN ('PENDENTE', 'PROCESSANDO')
          DO NOTHING
        `, {
          replacements: { cnpj }
        });

        resultados.push({
          cnpj,
          status: 'AGENDADO',
          contato: contato || null
        });
      }

      return res.status(202).json({
        message: 'Solicitação processada.',
        dados: resultados
      });

    } catch (error) {
      console.error('Erro no enriquecimento:', error);

      return res.status(500).json({
        message: 'Erro ao solicitar enriquecimento.'
      });
    }
  }

  static async consultar(req, res) {
    try {
      const cnpj = String(req.params.cnpj || '')
        .replace(/\D/g, '');

      if (!/^\d{14}$/.test(cnpj)) {
        return res.status(400).json({
          message: 'CNPJ inválido.'
        });
      }

      const [contato] = await database.sequelize.query(`
        SELECT *
        FROM public.empresas_contatos_comerciais
        WHERE cnpj = :cnpj
      `, {
        replacements: { cnpj },
        type: QueryTypes.SELECT
      });

      const [fila] = await database.sequelize.query(`
        SELECT status, tentativas, erro
        FROM public.empresas_enriquecimento_fila
        WHERE cnpj = :cnpj
        ORDER BY id DESC
        LIMIT 1
      `, {
        replacements: { cnpj },
        type: QueryTypes.SELECT
      });

      return res.json({
        cnpj,
        contato: contato || null,
        processamento: fila || null
      });

    } catch (error) {
      console.error(error);

      return res.status(500).json({
        message: 'Erro ao consultar enriquecimento.'
      });
    }
  }
}

module.exports = EnriquecimentoController;

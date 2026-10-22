
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

  static async atualizarContato(req, res) {
    try {
      const cnpj = String(req.params.cnpj || '').replace(/\D/g, '');

      if (!/^\d{14}$/.test(cnpj)) {
        return res.status(400).json({
          message: 'CNPJ inválido.'
        });
      }

      const usuarioId = Number(res.locals.user?._id);

      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return res.status(401).json({
          message: 'Usuário autenticado inválido.'
        });
      }

      const [usuario] = await database.sequelize.query(`
        SELECT nome_representante
        FROM public.users
        WHERE id = :usuarioId
        LIMIT 1
      `, {
        replacements: { usuarioId },
        type: QueryTypes.SELECT
      });

      const fonte = String(usuario?.nome_representante || '').trim();

      if (!fonte || fonte.length > 100) {
        return res.status(400).json({
          message: 'Não foi possível identificar o nome do usuário para auditoria.'
        });
      }

      const campos = [
        'email_comercial',
        'website',
        'telefone_comercial',
        'whatsapp',
        'instagram'
      ];
      const contato = {};

      for (const campo of campos) {
        const valor = req.body?.[campo];

        if (valor !== undefined && valor !== null &&
            typeof valor !== 'string') {
          return res.status(400).json({
            message: `O campo ${campo} deve ser texto.`
          });
        }

        contato[campo] = String(valor || '').trim() || null;
      }

      if (contato.email_comercial &&
          (contato.email_comercial.length > 255 ||
           !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contato.email_comercial))) {
        return res.status(400).json({
          message: 'Informe um e-mail comercial válido.'
        });
      }

      for (const campo of ['website', 'instagram']) {
        if (contato[campo] && contato[campo].length > 2000) {
          return res.status(400).json({
            message: `O campo ${campo} excede o tamanho permitido.`
          });
        }
      }

      if (contato.website) {
        try {
          const website = new URL(contato.website);

          if (!['http:', 'https:'].includes(website.protocol)) {
            throw new Error('Protocolo inválido.');
          }
        } catch {
          return res.status(400).json({
            message: 'Informe uma URL válida para o site.'
          });
        }
      }

      if (contato.instagram) {
        try {
          const instagram = new URL(contato.instagram);

          if (!['http:', 'https:'].includes(instagram.protocol)) {
            throw new Error('Protocolo inválido.');
          }
        } catch {
          if (!/^@?[a-zA-Z0-9._]{1,30}$/.test(contato.instagram)) {
            return res.status(400).json({
              message: 'Informe um perfil ou URL válida do Instagram.'
            });
          }
        }
      }

      for (const campo of ['telefone_comercial', 'whatsapp']) {
        if (contato[campo] && contato[campo].length > 30) {
          return res.status(400).json({
            message: `O campo ${campo} deve ter até 30 caracteres.`
          });
        }
      }

      if (!campos.some(campo => contato[campo])) {
        return res.status(400).json({
          message: 'Informe pelo menos um contato comercial.'
        });
      }

      const [salvo] = await database.sequelize.query(`
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
          proxima_atualizacao,
          atualizado_em
        )
        VALUES (
          :cnpj,
          :email_comercial,
          :website,
          :telefone_comercial,
          :whatsapp,
          :instagram,
          :fonte,
          NULL,
          'VERIFICADO',
          100,
          NOW(),
          NOW() + INTERVAL '90 days',
          NOW()
        )
        ON CONFLICT (cnpj)
        DO UPDATE SET
          email_comercial = EXCLUDED.email_comercial,
          website = EXCLUDED.website,
          telefone_comercial = EXCLUDED.telefone_comercial,
          whatsapp = EXCLUDED.whatsapp,
          instagram = EXCLUDED.instagram,
          fonte = EXCLUDED.fonte,
          url_fonte = NULL,
          status_verificacao = 'VERIFICADO',
          confianca = 100,
          verificado_em = NOW(),
          proxima_atualizacao = NOW() + INTERVAL '90 days',
          atualizado_em = NOW()
        RETURNING *
      `, {
        replacements: {
          cnpj,
          ...contato,
          fonte
        },
        type: QueryTypes.SELECT
      });

      return res.status(200).json({
        message: 'Contatos comerciais atualizados.',
        contato: salvo
      });
    } catch (error) {
      console.error('Erro ao atualizar contato comercial:', error);

      return res.status(500).json({
        message: 'Erro ao atualizar os contatos comerciais.'
      });
    }
  }
}

module.exports = EnriquecimentoController;

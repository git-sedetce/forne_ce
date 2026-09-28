const { Op } = require('sequelize');
const database = require('../models');

class HistoricoProspeccaoControllers {
  static obterUsuarioId(res) {
    return Number(res.locals.user?._id);
  }

  static ehAdministrador(res) {
    return Number(res.locals.user?._profile_id) === 1;
  }

  static filtroAcessoRegistro(res) {
    if (HistoricoProspeccaoControllers.ehAdministrador(res)) {
      return {};
    }

    return {
      user_id: HistoricoProspeccaoControllers.obterUsuarioId(res),
    };
  }

  static nomeArquivoSeguro(nomeArquivo) {
    const nome = String(nomeArquivo || 'prospeccao-fornece.pdf')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 255);

    return nome.toLowerCase().endsWith('.pdf') ? nome : `${nome}.pdf`;
  }

  static async criar(req, res) {
    try {
      const dados = req.body?.dados;
      const empresas = dados?.empresas;

      if (
        !dados?.contato ||
        !Array.isArray(empresas) ||
        empresas.length === 0 ||
        empresas.length > 10
      ) {
        return res.status(400).json({
          message: 'Os dados do contato e as empresas selecionadas são obrigatórios.',
        });
      }

      const registro = await database.historico_prospeccao.create({
        user_id: HistoricoProspeccaoControllers.obterUsuarioId(res),
        dados,
        nome_arquivo: HistoricoProspeccaoControllers.nomeArquivoSeguro(
          req.body.nome_arquivo,
        ),
        status: 'PENDENTE',
      });

      return res.status(201).json({ id: Number(registro.id) });
    } catch (error) {
      console.error('Erro ao criar histórico de prospecção:', error);
      return res.status(500).json({
        message: 'Não foi possível registrar o histórico da prospecção.',
      });
    }
  }

  static async salvarArquivo(req, res) {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ message: 'Arquivo PDF inválido.' });
      }

      const registro = await database.historico_prospeccao.findOne({
        where: {
          id: req.params.id,
          user_id: HistoricoProspeccaoControllers.obterUsuarioId(res),
          status: { [Op.in]: ['PENDENTE', 'PRONTO'] },
        },
      });

      if (!registro) {
        return res.status(404).json({ message: 'Registro não encontrado.' });
      }

      if (registro.status === 'PRONTO' && HistoricoProspeccaoControllers.ehAdministrador(res)) {
        return res.status(403).json({ message: 'Somente o autor pode editar esta solicitação.' });
      }

      await registro.update({
        arquivo_pdf: req.body,
        dados: registro.dados_pendentes || registro.dados,
        dados_pendentes: null,
        nome_arquivo: registro.nome_arquivo_pendente || registro.nome_arquivo,
        nome_arquivo_pendente: null,
        status: 'PRONTO',
      });
      return res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao salvar PDF do histórico:', error);
      return res.status(500).json({ message: 'Não foi possível salvar o PDF.' });
    }
  }

  static async listar(req, res) {
    try {
      const pagina = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const limite = Math.min(
        Math.max(Number.parseInt(req.query.limit, 10) || 50, 1),
        100,
      );
      const pesquisa = String(req.query.pesquisa || '').trim();
      const where = {
        ...HistoricoProspeccaoControllers.filtroAcessoRegistro(res),
        status: 'PRONTO',
      };

      if (pesquisa) {
        where[Op.and] = database.sequelize.where(
          database.sequelize.cast(database.sequelize.col('dados'), 'text'),
          { [Op.iLike]: `%${pesquisa}%` },
        );
      }

      const [total, registros] = await Promise.all([
        database.historico_prospeccao.count({ where }),
        database.historico_prospeccao.findAll({
          attributes: ['id', 'dados', 'nome_arquivo', 'createdAt'],
          include: [
            {
              model: database.users,
              as: 'usuario',
              attributes: ['id', 'nome_representante', 'user_email'],
            },
          ],
          where,
          order: [['createdAt', 'DESC']],
          limit: limite,
          offset: (pagina - 1) * limite,
        }),
      ]);

      return res.status(200).json({
        total,
        pagina,
        limite,
        dados: registros.map((registro) => ({
          id: Number(registro.id),
          nome_arquivo: registro.nome_arquivo,
          createdAt: registro.createdAt,
          dados: registro.dados,
          usuario: registro.usuario
            ? {
                id: registro.usuario.id,
                nome: registro.usuario.nome_representante,
                email: registro.usuario.user_email,
              }
            : null,
        })),
      });
    } catch (error) {
      console.error('Erro ao listar histórico de prospecções:', error);
      return res.status(500).json({
        message: 'Não foi possível consultar o histórico de prospecções.',
      });
    }
  }

  static async atualizar(req, res) {
    try {
      if (HistoricoProspeccaoControllers.ehAdministrador(res)) {
        return res.status(403).json({ message: 'Administrador possui acesso somente para leitura.' });
      }

      const dados = req.body?.dados;
      const empresas = dados?.empresas;

      if (
        !dados?.contato ||
        !Array.isArray(empresas) ||
        empresas.length === 0 ||
        empresas.length > 10
      ) {
        return res.status(400).json({
          message: 'Os dados do contato e até 10 empresas são obrigatórios.',
        });
      }

      const registro = await database.historico_prospeccao.findOne({
        where: {
          id: req.params.id,
          user_id: HistoricoProspeccaoControllers.obterUsuarioId(res),
          status: 'PRONTO',
        },
      });

      if (!registro) {
        return res.status(404).json({ message: 'Solicitação não encontrada.' });
      }

      await registro.update({
        dados_pendentes: dados,
        nome_arquivo_pendente: HistoricoProspeccaoControllers.nomeArquivoSeguro(
          req.body.nome_arquivo || registro.nome_arquivo,
        ),
      });

      return res.sendStatus(204);
    } catch (error) {
      console.error('Erro ao atualizar histórico de prospecção:', error);
      return res.status(500).json({ message: 'Não foi possível atualizar a solicitação.' });
    }
  }

  static async baixarArquivo(req, res) {
    try {
      const registro = await database.historico_prospeccao.findOne({
        attributes: ['arquivo_pdf', 'nome_arquivo'],
        where: {
          id: req.params.id,
          ...HistoricoProspeccaoControllers.filtroAcessoRegistro(res),
          status: 'PRONTO',
        },
      });

      if (!registro?.arquivo_pdf) {
        return res.status(404).json({ message: 'Arquivo não encontrado.' });
      }

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${registro.nome_arquivo}"`,
        'Content-Length': registro.arquivo_pdf.length,
      });

      return res.send(registro.arquivo_pdf);
    } catch (error) {
      console.error('Erro ao baixar PDF do histórico:', error);
      return res.status(500).json({ message: 'Não foi possível baixar o PDF.' });
    }
  }

  static async removerPendente(req, res) {
    try {
      const removidos = await database.historico_prospeccao.destroy({
        where: {
          id: req.params.id,
          user_id: HistoricoProspeccaoControllers.obterUsuarioId(res),
          status: 'PENDENTE',
        },
      });

      return res.sendStatus(removidos ? 204 : 404);
    } catch (error) {
      console.error('Erro ao remover registro pendente:', error);
      return res.status(500).json({ message: 'Não foi possível remover o registro.' });
    }
  }
}

module.exports = HistoricoProspeccaoControllers;

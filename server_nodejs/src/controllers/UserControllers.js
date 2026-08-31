const database = require("../models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { Op } = require("sequelize");
const crypto = require("crypto");

class UserController {
  static async registerAdmin(req, res) {
    const t = await database.sequelize.transaction();

    try {
      /*====================================================
      1 - DADOS DO CADASTRO
    ====================================================*/

      const dados = { ...req.body };
      dados.aceite_termos = false;

      /*====================================================
      2 - VALIDAR SENHA
    ====================================================*/

      if (!dados.password) {
        await t.rollback();

        return res.status(400).json({
          message: "A senha é obrigatória.",
        });
      }

      /*====================================================
      3 - VALIDAR CONFIRMAÇÃO DA SENHA
    ====================================================*/

      if (dados.password !== dados.confirm_password) {
        await t.rollback();

        return res.status(400).json({
          message: "As senhas não coincidem.",
        });
      }

      /*====================================================
      4 - REMOVER CONFIRMAÇÃO DA SENHA
    ====================================================*/

      delete dados.confirm_password;

      /*====================================================
      5 - CRIPTOGRAFAR SENHA
    ====================================================*/

      const salt = await bcrypt.genSalt(10);

      dados.password = await bcrypt.hash(dados.password, salt);

      /*====================================================
      6 - GERAR PIN
    ====================================================*/

      dados.user_pin = crypto.randomInt(100000, 1000000).toString();

      /*====================================================
      7 - ATIVAR USUÁRIO
    ====================================================*/

      dados.user_active = true;

      /*====================================================
      8 - CRIAR CADASTRO
    ====================================================*/

      const novoCadastro = await database.Agente.create(dados, {
        transaction: t,
      });

      /*====================================================
      9 - COMMIT
    ====================================================*/

      await t.commit();

      /*====================================================
      10 - RESPOSTA
    ====================================================*/

      const cadastroResponse = novoCadastro.toJSON();

      delete cadastroResponse.password;

      return res.status(201).json({
        message: "Cadastro realizado com sucesso.",

        cadastro: cadastroResponse,
      });
    } catch (error) {
      await t.rollback();

      console.error("Erro ao cadastrar usuário:", error);

      return res.status(500).json({
        message: error.message || "Erro ao realizar cadastro.",
      });
    }
  }

  static async gerarPin(req, res) {
    const user = req.body;

    try {
      // Verifica se foi informado email ou CPF
      if (!user.email && !user.cpf) {
        return res.status(400).json({
          message: "Informe o e-mail ou CPF.",
        });
      }

      // Monta as condições da consulta
      const condicoes = [];

      if (user.email) {
        condicoes.push({
          email: user.email,
        });
      }

      if (user.cpf) {
        condicoes.push({
          cpf: user.cpf,
        });
      }

      // Procura o usuário por email OU CPF
      const verificaUser = await database.Cadastro.findOne({
        where: {
          [Op.or]: condicoes,
        },
      });

      if (!verificaUser) {
        return res.status(404).json({
          message: "Usuário não encontrado!",
        });
      }

      // Gera PIN de 6 dígitos
      const newPin = crypto.randomInt(100000, 1000000).toString();

      // Atualiza o PIN do usuário encontrado
      await database.Cadastro.update(
        {
          user_pin: newPin,
        },
        {
          where: {
            id: verificaUser.id,
          },
        },
      );

      // Envia o email para o email cadastrado
      const transporter = nodemailer.createTransport({
        host: "172.26.2.26",
        port: 25,
        secure: false,
        tls: {
          rejectUnauthorized: false,
        },
      });

      const mailOptions = {
        from: "cotec@sde.ce.gov.br",
        to: verificaUser.email,
        subject: "Novo PIN para nova senha",
        html: `
        <h3>Solicitação de nova senha</h3>

        <p>Seu novo PIN para redefinição de senha é:</p>

        <h2>${newPin}</h2>

        <p>
          Utilize este PIN para criar sua nova senha.
        </p>

        <p>
          <a href="https://cotonicultura.sde.ce.gov.br/resetSenha">
            Resetar Senha
          </a>
        </p>
      `,
      };

      // Envia o email
      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.error("Erro ao enviar email:", error);
        } else {
          console.log("Email enviado:", info.response);
        }
      });

      return res.status(200).json({
        message: "PIN gerado e enviado com sucesso!",
      });
    } catch (error) {
      console.error("Erro ao gerar PIN:", error);

      return res.status(500).json({
        message: error.message,
      });
    }
  }

  static async login(req, res) {
    const user = req.body;
    console.log("user", user);

    try {
      // Verifica se foi informado email ou CPF
      if (!user.email && !user.cpf) {
        return res.status(400).json({
          message: "Informe o e-mail ou CPF.",
        });
      }

      // Monta as condições de busca
      const condicoes = [];

      if (user.email) {
        condicoes.push({
          email: user.email,
        });
      }

      if (user.cpf) {
        condicoes.push({
          cpf: user.cpf,
        });
      }

      // =====================================================
      // Procura primeiro na tabela Cadastro
      // =====================================================
      let verificaUser = await database.Cadastro.findOne({
        where: {
          [Op.or]: condicoes,
        },
      });

      let tipoUsuario = "cadastro";

      // =====================================================
      // Se não encontrou no Cadastro, procura em Agente
      // =====================================================
      if (!verificaUser) {
        verificaUser = await database.Agente.findOne({
          where: {
            [Op.or]: condicoes,
          },
        });

        tipoUsuario = "agente";
      }

      console.log("USER:", verificaUser);
      console.log("TIPO USUÁRIO:", tipoUsuario);

      // Usuário não encontrado
      if (!verificaUser) {
        return res.status(404).json({
          message: "Usuário não encontrado!",
        });
      }

      // =====================================================
      // Verifica se o usuário está ativo
      // =====================================================
      if (!verificaUser.user_active) {
        return res.status(400).json({
          message: "Consulte o Administrador do sistema",
        });
      }

      // =====================================================
      // Verifica a senha
      // =====================================================
      if (!(await bcrypt.compare(user.password, verificaUser.password))) {
        return res.status(400).json({
          message: "Credenciais inválidas!",
        });
      }

      // =====================================================
      // Define o nome de acordo com a tabela
      // =====================================================
      const nomeUsuario =
        tipoUsuario === "agente"
          ? verificaUser.nome
          : verificaUser.nome_responsavel;

      // =====================================================
      // Gera o token
      // =====================================================
      const token = jwt.sign(
        {
          _id: verificaUser.id,
          _profile_id: verificaUser.profile_id,
          _user_name: nomeUsuario,
          _tipo_usuario: tipoUsuario,
        },
        process.env.ACCESS_TOKEN,
        {
          expiresIn: "8h",
        },
      );

      return res.json({
        auth: true,
        token: token,
        message: "Usuário logado com sucesso!",
      });
    } catch (error) {
      console.error("Erro ao realizar login:", error);

      return res.status(500).json({
        message: "Problemas ao realizar login!",
      });
    }
  }

  static async pegaUsers(req, res) {
    try {
      const getUser = await database.Agente.findAll({
        order: [["nome", "ASC"]],
        attributes: [
          "id",
          "nome_responsavel",
          "tipo_proponente",
          "cpf",
          "telefone",
          "email",
          "cnpj",
          "user_active",
          "user_pin",
          "nome_empreendimento",
          "cep",
          "bairro",
          "rua",
          "numero",
          "complemento",
          "linha_credito",
          "iniciativa_impacto",
          "cadastro_cadimpacto",
          "status_atual",
          "area_atuacao",
          "resumo_negocio",
          "aceite_termos",
          "createdAt",
          "updatedAt",
        ],
        include: [
          {
            association: "ass_agente_profile",
            attributes: ["id", "perfil"],
          },
          {
            association: "ass_agente_cidade",
            attributes: ["id", "nome_municipio"],
            include: [
              {
                association: "ass_municipio_regiao",
                attributes: ["id", "nome"],
              },
            ],
          },
        ],
      });

      return res.status(200).json(getUser);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Erro ao buscar usuários" });
    }
  }

  static async pegarTodosAgentes(req, res) {
    try {
      const getAgentes = await database.Agente.findAll({
        attributes: ["id", "nome", "cpf", "email", "user_active", "profile_id"],
        include: [
          {
            association: "ass_agente_cidade",
            attributes: ["id", "nome_municipio"],
            include: [
              {
                association: "ass_municipio_regiao",
                attributes: ["id", "nome"],
              },
            ],
          },
          {
            association: "ass_agente_profile",
            attributes: ["id", "perfil"],
          },
        ],
      });

      return res.status(200).json(getAgentes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Erro ao buscar agentes" });
    }
  }

  static async agenteId(req, res) {
    const { id } = req.params;
    try {
      const getAgentes = await database.Agente.findOne({
        where: { id: Number(id) },
        attributes: [
          "id",
          "nome",
          "cpf",
          "email",
          "telefone",
          "user_active",
          "profile_id",
          "cep",
          "cidade",
          "bairro",
          "rua",
          "numero",
          "complemento",
        ],
        include: [
          {
            association: "ass_agente_cidade",
            attributes: ["id", "nome_municipio"],
            include: [
              {
                association: "ass_municipio_regiao",
                attributes: ["id", "nome"],
              },
            ],
          },
          {
            association: "ass_agente_profile",
            attributes: ["id", "perfil"],
          },
        ],
      });

      return res.status(200).json(getAgentes);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Erro ao buscar agentes" });
    }
  }

  static async pegarPerfils(req, res) {
    try {
      const getProfiles = await database.Profile.findAll({
        order: [["id", "ASC"]],
        attributes: ["id", "perfil"],
      });

      return res.status(200).json(getProfiles);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Erro ao buscar perfis" });
    }
  }

  static async atualizaUser(req, res) {
    const { id } = req.params;
    const user = req.body;
    // console.log('user', user)
    try {
      await database.Agente.update(user, { where: { id: Number(id) } });
      const updateUser = await database.Cadastro.findOne({
        where: { id: Number(id) },
      });
      return res.status(200).json(updateUser);
    } catch (error) {
      return res.status(500).json(error.message);
    }
  }

  static async logout(req, res) {
    res.cookie("jwt", "", { maxAge: 0 });
    res.send({ message: "Logout Success!" });
  }

  static async resetPassword(req, res) {
    const user = req.body;
    //console.log('user', user)
    try {
      const verificaUser = await database.Agente.findOne({
        where: { email: user.email },
      });
      if (!verificaUser) {
        return res.status(404).send({ message: "Usuário não encontrado!" });
      }
      let newPassword = user.password;
      const salt = await bcrypt.genSalt(10);
      const hashedNewPassword = await bcrypt.hash(newPassword, salt);
      newPassword = hashedNewPassword;
      //console.log('newPassword', newPassword)

      if (verificaUser.user_active === false) {
        const novaSenha = await database.Agente.update(
          { password: newPassword },
          { where: { email: user.email } },
        );
      } else {
        const novaSenha = await database.Agente.update(
          { password: newPassword },
          { where: { email: user.email } },
        );
      }

      //const  result = await novaSenha.save()
      //const { password, ...data } = await result.toJSON()
      res.send({ message: "Senha alterada com sucesso!" });
    } catch (error) {
      //res.send(verificaUserEmail)
      return res.status(500).json(error.message);
    }
  }

  static async deletaUsers(req, res) {
    const { id } = req.params;

    const apaga = await database.Agente.findOne({
      where: { id: Number(id) },
      attributes: ["nome_responsavel"],
    });

    try {
      await database.Agente.destroy({ where: { id: Number(id) } });
      return res.status(200).json({
        mensagem: `O Usuario ${apaga.nome_responsavel} foi excluido com sucesso!!`,
      });
    } catch (erro) {
      return res.status(500).json(erro.message);
    }
  }

  static async pegaBairros(req, res) {
    try {
      const bairros = await database.Bairros.findAll({
        where: { cidade: req.query.cidadeId },
        order: [["nome_bairro", "ASC"]],
        attributes: ["id", "nome_bairro"],
      });

      return res.status(200).json(bairros);
    } catch (error) {
      return res.status(500).json(error.message);
    }
  }

  static async criarPolo(req, res) {
    const transaction = await database.sequelize.transaction();
    try {
      const { nome_polo, cidades = [], bairros = [] } = req.body;

      // =====================================================
      // 1. VALIDAÇÕES INICIAIS
      // =====================================================

      if (!nome_polo || !nome_polo.trim()) {
        await transaction.rollback();

        return res.status(400).json({
          erro: true,
          mensagem: "O nome do Polo é obrigatório.",
        });
      }

      if (!Array.isArray(cidades) || cidades.length === 0) {
        await transaction.rollback();

        return res.status(400).json({
          erro: true,
          mensagem: "Informe pelo menos uma cidade para o Polo.",
        });
      }

      // Remove IDs duplicados
      const cidadesIds = [...new Set(cidades.map(Number))];
      const bairrosIds = [...new Set(bairros.map(Number))];

      // =====================================================
      // 2. BUSCA AS CIDADES
      // =====================================================

      const cidadesEncontradas = await database.Cidades.findAll({
        where: {
          id: cidadesIds,
        },
        transaction,
      });

      if (cidadesEncontradas.length !== cidadesIds.length) {
        await transaction.rollback();

        return res.status(400).json({
          erro: true,
          mensagem: "Uma ou mais cidades informadas não existem.",
        });
      }

      // =====================================================
      // 3. VERIFICA SE ALGUMA CIDADE JÁ ESTÁ EM UM POLO
      // =====================================================

      const cidadeEmOutroPolo = cidadesEncontradas.find(
        (cidade) => cidade.polo_id !== null,
      );

      if (cidadeEmOutroPolo) {
        await transaction.rollback();

        return res.status(400).json({
          erro: true,
          mensagem: `A cidade ${cidadeEmOutroPolo.nome_municipio} já pertence a um Polo.`,
        });
      }

      // =====================================================
      // 4. IDENTIFICA FORTALEZA
      // =====================================================

      const fortaleza = cidadesEncontradas.find(
        (cidade) => cidade.nome_municipio.trim().toLowerCase() === "fortaleza",
      );

      // =====================================================
      // 5. SE FOR FORTALEZA, OS BAIRROS SÃO OBRIGATÓRIOS
      // =====================================================

      if (fortaleza && bairrosIds.length === 0) {
        await transaction.rollback();

        return res.status(400).json({
          erro: true,
          mensagem:
            "Ao adicionar Fortaleza, é obrigatório informar os bairros.",
        });
      }

      // =====================================================
      // 6. SE NÃO TEM FORTALEZA, NÃO PODE INFORMAR BAIRROS
      // =====================================================

      if (!fortaleza && bairrosIds.length > 0) {
        await transaction.rollback();

        return res.status(400).json({
          erro: true,
          mensagem:
            "Bairros só podem ser associados quando Fortaleza fizer parte do Polo.",
        });
      }

      // =====================================================
      // 7. VALIDA OS BAIRROS
      // =====================================================

      let bairrosEncontrados = [];

      if (fortaleza) {
        bairrosEncontrados = await database.Bairro.findAll({
          where: {
            id: bairrosIds,
          },
          transaction,
        });

        if (bairrosEncontrados.length !== bairrosIds.length) {
          await transaction.rollback();

          return res.status(400).json({
            erro: true,
            mensagem: "Um ou mais bairros informados não existem.",
          });
        }

        // =====================================================
        // 8. VERIFICA SE OS BAIRROS SÃO DE FORTALEZA
        // =====================================================

        const bairroForaDeFortaleza = bairrosEncontrados.find(
          (bairro) => Number(bairro.cidade) !== Number(fortaleza.id),
        );

        if (bairroForaDeFortaleza) {
          await transaction.rollback();
          return res.status(400).json({
            erro: true,
            mensagem: `O bairro ${bairroForaDeFortaleza.nome_bairro} não pertence a Fortaleza.`,
          });
        }

        // =====================================================
        // 9. VERIFICA SE ALGUM BAIRRO JÁ ESTÁ EM OUTRO POLO
        // =====================================================

        const bairroEmOutroPolo = bairrosEncontrados.find(
          (bairro) => bairro.polo_id !== null,
        );

        if (bairroEmOutroPolo) {
          await transaction.rollback();
          return res.status(400).json({
            erro: true,
            mensagem: `O bairro ${bairroEmOutroPolo.nome_bairro} já pertence a um Polo.`,
          });
        }
      }

      // =====================================================
      // 10. CRIA O POLO
      // =====================================================

      const novoPolo = await database.Polo.create(
        {
          nome_polo: nome_polo.trim(),
        },
        {
          transaction,
        },
      );

      // =====================================================
      // 11. ATUALIZA AS CIDADES
      // =====================================================

      await database.Cidades.update(
        {
          polo_id: novoPolo.id,
        },
        {
          where: {
            id: cidadesIds,
          },
          transaction,
        },
      );

      // =====================================================
      // 12. ATUALIZA OS BAIRROS DE FORTALEZA
      // =====================================================

      if (fortaleza && bairrosIds.length > 0) {
        await database.Bairro.update(
          {
            polo_id: novoPolo.id,
          },
          {
            where: {
              id: bairrosIds,
            },
            transaction,
          },
        );
      }

      // =====================================================
      // 13. CONFIRMA A TRANSACTION
      // =====================================================

      await transaction.commit();

      // =====================================================
      // 14. RETORNA O POLO CRIADO
      // =====================================================

      return res.status(201).json({
        erro: false,
        mensagem: "Polo criado com sucesso.",
        polo: {
          id: novoPolo.id,
          nome_polo: novoPolo.nome_polo,
          cidades: cidadesIds,
          bairros: bairrosIds,
        },
      });
    } catch (error) {
      await transaction.rollback();

      console.error("Erro ao criar Polo:", error);

      return res.status(500).json({
        erro: true,
        mensagem: "Erro ao criar Polo.",
        detalhes: error.message,
      });
    }
  }
}

module.exports = UserController;

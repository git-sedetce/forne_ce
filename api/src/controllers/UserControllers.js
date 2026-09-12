const database = require("../models");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

class UserController {
  static async cadastraUser(req, res) {
    try {
      const {
        nome_representante,
        cpf_cnpj,
        user_email,
        user_password,
        sexec_id,
      } = req.body;

      if (!user_password || !user_email) {
        return res.status(400).json({
          message: "Dados obrigatórios ausentes",
        });
      }

      const dominio = user_email.split("@")[1]?.toLowerCase();

      if (dominio !== "sde.ce.gov.br") {
        return res.status(400).json({
          message: "Email inválido para cadastro!",
        });
      }

      const emailExistente = await database.users.findOne({
        where: {
          user_email: user_email.toLowerCase(),
        },
      });

      if (emailExistente) {
        return res.status(400).json({
          message: "Email já cadastrado!",
        });
      }

      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(user_password, salt);

      const userCriado = await database.users.create({
        nome_representante,
        cpf_cnpj,
        user_email: user_email.toLowerCase(),
        user_password: senhaHash,
        sexec_id: Number(sexec_id),
        user_pin: Math.floor(1000 + Math.random() * 9000),
        profile_id: 6,
        user_active: false,
      });

      const { user_password: _, ...data } = userCriado.toJSON();

      res.status(201).json(data);

      UserController.enviarEmailsCadastro(data).catch((error) => {
        console.error("Erro ao enviar e-mail:", error);
      });
    } catch (error) {
      console.error("Erro ao cadastrar usuário:", error);

      if (!res.headersSent) {
        return res.status(500).json({
          message: error.message,
        });
      }
    }
  }

  static async enviarEmailsCadastro(user) {
    const transporter = nodemailer.createTransport({
      host: "172.26.2.26",
      port: 25,
      secure: false,
      tls: { rejectUnauthorized: false },
    });

    // Email administrativo
    await transporter.sendMail({
      from: "cotec@sde.ce.gov.br",
      to: process.env.EMAIL_ADMIN,
      subject: "Cadastro de usuário ao Sistema Fornece Ceará",
      html: `
      <h3>Cadastro realizado com sucesso</h3>
      <p>${user.nome_representante} realizou o cadastro.</p>
    `,
    });

    // Email com PIN
    await transporter.sendMail({
      from: "cotec@sde.ce.gov.br",
      to: user.user_email,
      subject: "Código PIN - Sistema Fornece Ceará",
      html: `
      <h2>Código PIN</h2>
      <h3>${user.user_pin}</h3>
      <p>
        <a href="https://www.fornece.ce.gov.br/resetSenha">
          Clique aqui para criar sua senha
        </a>
      </p>
    `,
    });
  }

  static async checarEmail(req, res) {
    const { email } = req.params;
    try {
      const verificaEmail = await database.users.findOne({
        where: { user_email: email },
        attributes: ["user_name", "user_email"],
      });
      if (verificaEmail === null) {
        return res
          .status(200)
          .json({ mensagem: `Email autorizado para cadastro` });
      } else {
        return res.status(200).json({ mensagem: `Email já cadastrado!` });
      }
    } catch (error) {
      return res.status(500).json(error.message);
    }
  }

  static async gerarPin(req, res) {
    const user = req.body;
    //console.log('user', user)
    try {
      const verificaUser = await database.users.findOne({
        where: { user_email: user.user_email },
      });
      if (!verificaUser) {
        return res.status(404).send({ message: "Usuário não encontrado!" });
      }
      let newPin = Math.floor(1000 + Math.random() * 9000);
      user.user_pin;

      const novoPin = await database.users.update(
        { user_pin: newPin },
        { where: { user_email: user.user_email } },
      );

      res.send({ message: "Pin alterado com sucesso!" });

      var transporter = nodemailer.createTransport({
        host: "172.26.2.26", //relay.etice.ce.gov.br
        port: 25,
        secure: false,
        tls: {
          rejectUnauthorized: false,
        },
      });

      var mailOptions = {
        from: "cotec@sde.ce.gov.br",
        to: user.user_email,
        subject: "Novo Pin para nova senha",
        html: `<h3>Segue o novo Pin!!</h3><p><strong>${newPin}</strong><br>Crie sua nova senha no seguinte link: <a href="https://www.fornece.ce.gov.br/resetSenha">Resetar Senha</a>`,
      };
      //   console.log("mailOptions", mailOptions);
      var emailRetorno = null;
      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.error(error);
          emailRetorno = error;
        } else {
          //   console.log("Email enviado: " + info.response);
          emailRetorno = {
            messagem: "Email enviado com sucesso!",
            info: info.response,
          };
        }
      });
    } catch (error) {
      //res.send(verificaUserEmail)
      return res.status(500).json(error.message);
    }
  }

  static async login(req, res) {
  const { user, password } = req.body;

  console.log("LOGIN:", { user });

  try {
    // =====================================================
    // Validação
    // =====================================================
    if (!user || !password) {
      return res.status(400).json({
        message: "Informe o e-mail/CPF/CNPJ e a senha.",
      });
    }

    // Remove caracteres de CPF/CNPJ caso existam
    const documento = String(user).replace(/\D/g, "");

    // Verifica se o valor informado parece ser um e-mail
    const isEmail = String(user).includes("@");

    // =====================================================
    // Busca o usuário
    // =====================================================
    let verificaUser;

    if (isEmail) {
      verificaUser = await database.users.findOne({
        where: {
          user_email: String(user).trim().toLowerCase(),
        },
      });
    } else {
      verificaUser = await database.users.findOne({
        where: {
          cpf_cnpj: documento,
        },
      });
    }

    // =====================================================
    // Usuário não encontrado
    // =====================================================
    if (!verificaUser) {
      return res.status(404).json({
        message: "Usuário não encontrado!",
      });
    }

    // =====================================================
    // Usuário inativo
    // =====================================================
    if (!verificaUser.user_active) {
      return res.status(403).json({
        message: "Consulte o Administrador do sistema.",
      });
    }

    // =====================================================
    // Verifica senha
    // =====================================================
    const senhaCorreta = await bcrypt.compare(
      password,
      verificaUser.user_password
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        message: "Credenciais inválidas!",
      });
    }

    // =====================================================
    // Gera token
    // =====================================================
    const token = jwt.sign(
      {
        _id: verificaUser.id,
        _profile_id: verificaUser.profile_id,
        _user_name: verificaUser.nome_representante,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "8h",
      }
    );

    // =====================================================
    // Retorno
    // =====================================================
    return res.status(200).json({
      auth: true,
      token,
      user: {
        id: verificaUser.id,
        nome: verificaUser.nome_representante,
        email: verificaUser.user_email,
        profile_id: verificaUser.profile_id,
        sexec_id: verificaUser.sexec_id,
      },
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
      const getUser = await database.users.findAll({
        order: [["nome_representante", "ASC"]],
        attributes: [
          "id",
          "nome_representante",
          "cpf_cnpj",
          "user_email",
          "user_active",
          "profile_id",
          "sexec_id",
        ],
        include: [
          {
            association: "ass_user_profile",
            attributes: ["id", "perfil"],
          },
          {
            association: "ass_user_sexec",
            attributes: ["id", "secretaria", "sigla"],
          },
        ],
      });

      return res.status(200).json(getUser);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Erro ao buscar usuários" });
    }
  }

  static async userId(req, res) {
    const { id } = req.params;
    try {
      const getUser = await database.users.findOne({
        where: { id: Number(id) },
        attributes: [
          "id",
          "nome_representante",
          "cpf_cnpj",
          "user_email",
          "user_active",
          "profile_id",
          "sexec_id",
        ],
        include: [
          {
            association: "ass_user_profile",
            attributes: ["id", "perfil"],
          },
          {
            association: "ass_user_sexec",
            attributes: ["id", "secretaria", "sigla"],
          },
        ],
      });

      return res.status(200).json(getUser);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: "Erro ao buscar usuário" });
    }
  }

  static async pegaSexec(req, res) {
    try {
      const getSexec = await database.secretaria_executiva.findAll({
        order: ["secretaria"],
        attributes: ["id", "secretaria", "sigla"],
      });
      return res.status(200).json(getSexec);
    } catch (error) {
      return res.status(500).json({ message: "Secretaria não encontrado" });
    }
  }

  static async pegaProfiles(req, res) {
    try {
      const getProfiles = await database.profile.findAll({
        order: ["perfil"],
        attributes: ["id", "perfil"],
      });
      return res.status(200).json(getProfiles);
    } catch (error) {
      return res.status(500).json({ message: "Perfil não encontrado" });
    }
  }

  static async atualizaUser(req, res) {
    const { id } = req.params;
    const user = req.body;
    console.log('user', user)
    try {
      await database.users.update(user, { where: { id: Number(id) } });
      const updateUser = await database.users.findOne({
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
      const verificaUser = await database.users.findOne({
        where: { user_email: user.user_email },
      });
      if (!verificaUser) {
        return res.status(404).send({ message: "Usuário não encontrado!" });
      }
      let newPassword = user.user_password;
      const salt = await bcrypt.genSalt(10);
      const hashedNewPassword = await bcrypt.hash(newPassword, salt);
      newPassword = hashedNewPassword;
      //console.log('newPassword', newPassword)

      if (verificaUser.user_active === false) {
        const novaSenha = await database.users.update(
          { user_password: newPassword },
          { where: { user_email: user.user_email } },
        );
      } else {
        const novaSenha = await database.users.update(
          { user_password: newPassword },
          { where: { user_email: user.user_email } },
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

    const apaga = await database.users.findOne({
      where: { id: Number(id) },
      attributes: ["nome_representante"],
    });

    try {
      await database.users.destroy({ where: { id: Number(id) } });
      return res.status(200).json({
        mensagem: `O Usuario ${apaga.nome_representante} foi excluido com sucesso!!`,
      });
    } catch (erro) {
      return res.status(500).json(erro.message);
    }
  }
}

module.exports = UserController;

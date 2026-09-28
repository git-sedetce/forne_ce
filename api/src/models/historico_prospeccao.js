'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class historico_prospeccao extends Model {
    static associate(models) {
      historico_prospeccao.belongsTo(models.users, {
        foreignKey: 'user_id',
        as: 'usuario',
      });
    }
  }

  historico_prospeccao.init(
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: DataTypes.INTEGER,
      dados: DataTypes.JSONB,
      dados_pendentes: DataTypes.JSONB,
      nome_arquivo: DataTypes.STRING,
      nome_arquivo_pendente: DataTypes.STRING,
      arquivo_pdf: DataTypes.BLOB,
      status: DataTypes.STRING,
    },
    {
      sequelize,
      modelName: 'historico_prospeccao',
      tableName: 'historico_prospeccoes',
    },
  );

  return historico_prospeccao;
};

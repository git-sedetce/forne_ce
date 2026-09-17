module.exports = (sequelize, DataTypes) => {
  const CocienteLocacional = sequelize.define(
    "CocienteLocacional",
    {
      id: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },

      competencia: {
        type: DataTypes.STRING(7),
        allowNull: false,
      },

      municipio_codigo: {
        type: DataTypes.STRING(4),
        allowNull: false,
      },

      municipio_nome: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },

      cnae_codigo: {
        type: DataTypes.STRING(7),
        allowNull: false,
      },

      cnae_descricao: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      cociente_locacional: {
        type: DataTypes.DECIMAL(18, 8),
        allowNull: false,
      },

      empresas_municipio_cnae: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },

      empresas_municipio: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },

      empresas_estado_cnae: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },

      empresas_estado: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },

      carga_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },

      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },

      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: "cociente_locacional",
      schema: "analytics",

      timestamps: true,

      createdAt: "created_at",
      updatedAt: "updated_at",

      freezeTableName: true,
    }
  );

  return CocienteLocacional;
};
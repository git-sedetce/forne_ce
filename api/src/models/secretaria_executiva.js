'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class secretaria_executiva extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      secretaria_executiva.hasMany(models.users, {
        foreignKey: 'sexec_id', as: 'ass_sexec_user'
      });
    }
  }
  secretaria_executiva.init({
    secretaria: DataTypes.STRING,
    sigla: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'secretaria_executiva',
  });
  return secretaria_executiva;
};
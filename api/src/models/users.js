'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class users extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      users.belongsTo(models.profile, { foreignKey: 'profile_id', as: 'ass_user_profile' })
      users.belongsTo(models.secretaria_executiva, { foreignKey: 'sexec_id', as: 'ass_user_sexec' })
      // users.hasMany(models.audit, { foreignKey: 'user_id', as: 'ass_users_audit' });
    }
  }
  users.init({
    nome: DataTypes.STRING,
    user_email: DataTypes.STRING,
    user_active: DataTypes.BOOLEAN,
    user_password: DataTypes.STRING,
    user_pin: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'users',
  });
  return users;
};
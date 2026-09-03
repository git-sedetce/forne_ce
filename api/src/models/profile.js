'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class profile extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      profile.hasMany(models.users, {
        foreignKey: 'profile_id', as: 'ass_profile_user'
      })
    }
  }
  profile.init({
    perfil: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'profile',
  });
  return profile;
};
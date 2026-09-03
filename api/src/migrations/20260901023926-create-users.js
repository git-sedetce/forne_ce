'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      nome: {
        type: Sequelize.STRING
      },
      user_email: {
        type: Sequelize.STRING
      },
      user_active: {
        type: Sequelize.BOOLEAN
      },
      user_password: {
        type: Sequelize.STRING
      },
      user_pin: {
        type: Sequelize.STRING
      },
      profile_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'profiles', key: 'id' }
      },
      sexec_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'secretaria_executivas', key: 'id' }
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
  }
};
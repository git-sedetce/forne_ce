'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('historico_prospeccoes', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      user_id: {
        allowNull: false,
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      dados: {
        allowNull: false,
        type: Sequelize.JSONB,
      },
      nome_arquivo: {
        allowNull: false,
        type: Sequelize.STRING(255),
      },
      arquivo_pdf: {
        type: Sequelize.BLOB,
      },
      status: {
        allowNull: false,
        type: Sequelize.STRING(20),
        defaultValue: 'PENDENTE',
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('historico_prospeccoes', ['user_id', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('historico_prospeccoes');
  },
};

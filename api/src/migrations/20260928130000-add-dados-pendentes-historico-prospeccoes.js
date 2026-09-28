'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('historico_prospeccoes', 'dados_pendentes', {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn('historico_prospeccoes', 'nome_arquivo_pendente', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('historico_prospeccoes', 'dados_pendentes');
    await queryInterface.removeColumn('historico_prospeccoes', 'nome_arquivo_pendente');
  },
};

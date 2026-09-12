'use strict';

const { SET_DEFERRED } = require('sequelize/lib/deferrable');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkInsert('users', [{
      nome_representante: 'Admin SDE',
      cpf_cnpj: '22.064.583/0001-57',
      user_email: 'admin@sde.ce.gov.br',
      user_active: true,
      user_password: '$2b$10$82XbZzXtawgpW7oaWXNwm.c3Cj0Il37L9xcaExuV7ez5GoXNoGsvm',
      user_pin: 1008,
      profile_id: 1,
      sexec_id: 4,
      createdAt: new Date(),
      updatedAt: new Date()
    }], {});
  },

  async down (queryInterface, Sequelize) {
     await queryInterface.bulkDelete('users', null, {});     
  }
};

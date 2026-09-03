'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.bulkInsert('secretaria_executivas', [
      {
        secretaria: 'Secretaria do Desenvolvimento Econômico',
        sigla: 'SDE',
        createdAt: new Date(),
        updatedAt: new Date()
       },
      {
      secretaria: 'Secretaria Executiva da Indústria',
      sigla: 'SEXEC-SIN',
      createdAt: new Date(),
      updatedAt: new Date()
     },
     {
      secretaria: 'Secretaria Executiva de Comércio, Serviços e Inovação',
      sigla: 'SEXEC-CSI',
      createdAt: new Date(),
      updatedAt: new Date()
     },
     {
      secretaria: 'Secretaria Executiva de Planejamento e Gestão Interna',
      sigla: 'SEXEC-PGI',
      createdAt: new Date(),
      updatedAt: new Date()
     },
     {
      secretaria: 'Secretaria Executiva do Agronegócio',
      sigla: 'SEXEC-SAN',
      createdAt: new Date(),
      updatedAt: new Date()
     },
     {
      secretaria: 'Agência de Defesa Agropecuária do Estado do Ceará',
      sigla: 'ADAGRI',
      createdAt: new Date(),
      updatedAt: new Date()
     },
     {
      secretaria: 'Agência de Desenvolvimento do Estado do Ceará',
      sigla: 'ADECE',
      createdAt: new Date(),
      updatedAt: new Date()
     },     
    ], {});
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.bulkDelete('secretaria_executivas', null, {});
  }
};

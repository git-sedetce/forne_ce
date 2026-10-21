const express = require('express')
const user = require('./userRoutes')
const empresa = require('./empresaRoutes')
const cociente = require('./cocienteLocacionalRoutes')
const enriquecimento = require('./enriquecimentoRoutes')
// const audit = require('./auditRoutes')


module.exports = app => {
    app.use(express.json(),
            express.urlencoded({ extended: false }),
            user,
            empresa,
            cociente,
            enriquecimento
            // audit,
            )
}
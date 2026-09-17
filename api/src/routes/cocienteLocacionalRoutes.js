const express = require("express");
const CocienteLocacionalControllers = require("../controllers/CocienteLocacionalControllers");

const router = express.Router();

// Consulta geral com filtros
router.get("/quociente", CocienteLocacionalControllers.listar);

// Todos os CNAEs de determinado município
router.get("/municipio/:codigo", CocienteLocacionalControllers.porMunicipio);

// Todos os municípios de determinado CNAE
router.get("/cnae/:codigo", CocienteLocacionalControllers.porCnae);

module.exports = router;

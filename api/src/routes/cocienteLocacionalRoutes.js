const express = require("express");
const CocienteLocacionalControllers = require("../controllers/CocienteLocacionalControllers");

const router = express.Router();

// ==========================================================
// CONSULTA GERAL
// ==========================================================

router.get("/quociente", CocienteLocacionalControllers.listar);

// ==========================================================
// COMPETÊNCIAS DISPONÍVEIS
// ==========================================================

router.get("/competencias", CocienteLocacionalControllers.competencias);

// ==========================================================
// CNAES DE UM MUNICÍPIO
// ==========================================================

router.get("/municipio/:codigo", CocienteLocacionalControllers.porMunicipio);

// ==========================================================
// MUNICÍPIOS DE UM CNAE
// ==========================================================

router.get("/cnae/:codigo", CocienteLocacionalControllers.porCnae);

module.exports = router;

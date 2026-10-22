
const router = require('express').Router();

const EnriquecimentoController = require('../controllers/EnriquecimentoControllers');

var auth = require("../services/AutenticaService");
var checkRole = require("../services/checkRole");
// na montagem destas rotas.

router.post('/empresas/enriquecimento/solicitar', auth.authenticatedUser, checkRole.checkRole([1,2,3,4,5]), EnriquecimentoController.solicitar);
router.get('/empresas/enriquecimento/:cnpj', auth.authenticatedUser, checkRole.checkRole([1,2,3,4,5]), EnriquecimentoController.consultar);
router.put('/empresas/enriquecimento/:cnpj/contato', auth.authenticatedUser, checkRole.checkRole([1,2,3,4,5]), EnriquecimentoController.atualizarContato);

module.exports = router;

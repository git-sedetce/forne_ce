const { Router } = require("express");
const EmpresaControllers = require("../controllers/EmpresaControllers");
var auth = require("../services/AutenticaService");
var checkRole = require("../services/checkRole");

const router = Router();

router.get("/estatisticas/ativas", EmpresaControllers.quantidadeEmpresasAtivas );
router.get("/estatisticas/por-municipio", EmpresaControllers.quantidadeEmpresasAtivasMunicipio );
router.get("/estatisticas/por-cnae", EmpresaControllers.quantidadeEmpresasPorCnae );
router.get("/cnae/:cnae", auth.authenticatedUser, checkRole.checkRole([1,2,3,4,5,6]), EmpresaControllers.listarEmpresasPorCnae );
router.get("/listarcnae/cnae", auth.authenticatedUser, checkRole.checkRole([1,2,3,4,5,6]), EmpresaControllers.listarCnaes );
router.get("/listarempresas/ativas", EmpresaControllers.listarEmpresasAtivas );
router.get("/empresas/pesquisar", EmpresaControllers.pesquisarEmpresas);

module.exports = router;

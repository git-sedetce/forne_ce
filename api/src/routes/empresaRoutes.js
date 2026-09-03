const { Router } = require("express");
const EmpresaControllers = require("../controllers/EmpresaControllers");
var auth = require("../services/AutenticaService");
var checkRole = require("../services/checkRole");

const router = Router();

router.get("/estatisticas/ativas", EmpresaControllers.quantidadeEmpresasAtivas );
router.get("/estatisticas/por-municipio", EmpresaControllers.quantidadeEmpresasAtivasMunicipio );
router.get("/estatisticas/por-cnae", EmpresaControllers.quantidadeEmpresasPorCnae );
router.get("/cnae/:cnae", EmpresaControllers.listarEmpresasPorCnae );
router.get("/listarcnae/cnae", EmpresaControllers.listarCnaes );
router.get("/listarempresas/ativas", EmpresaControllers.listarEmpresasAtivas );

module.exports = router;

const express = require("express");
const { Router } = express;
const EmpresaControllers = require("../controllers/EmpresaControllers");
const HistoricoProspeccaoControllers = require("../controllers/HistoricoProspeccaoControllers");
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
router.get("/empresas/pesquisarjucec", EmpresaControllers.pesquisarEmpresasJucec);
router.post("/historico-prospeccoes", auth.authenticatedUser, HistoricoProspeccaoControllers.criar);
router.get("/historico-prospeccoes", auth.authenticatedUser, HistoricoProspeccaoControllers.listar);
router.put("/historico-prospeccoes/:id", auth.authenticatedUser, HistoricoProspeccaoControllers.atualizar);
router.get("/historico-prospeccoes/:id/arquivo", auth.authenticatedUser, HistoricoProspeccaoControllers.baixarArquivo);
router.put(
	"/historico-prospeccoes/:id/arquivo",
	auth.authenticatedUser,
	express.raw({ type: "application/pdf", limit: "10mb" }),
	HistoricoProspeccaoControllers.salvarArquivo,
);
router.delete("/historico-prospeccoes/:id", auth.authenticatedUser, HistoricoProspeccaoControllers.removerPendente);
router.get("/estatisticas/indicadores", EmpresaControllers.indicadoresDashboard );

module.exports = router;

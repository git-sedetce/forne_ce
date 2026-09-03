const { Router } = require('express')
const UserController = require('../controllers/UserControllers')
var auth = require('../services/AutenticaService')
var checkRole = require('../services/checkRole')


const router = Router()
router.post('/register', UserController.cadastraUser)
router.post('/login', UserController.login)
router.get('/takeSexec', UserController.pegaSexec)
router.get('/checkEmail/:email', UserController.checarEmail)
router.get('/allUser', auth.authenticatedUser, checkRole.checkRole([1]), UserController.pegaUsers)
router.put('/atualizaUser/:id', auth.authenticatedUser, checkRole.checkRole([1]), UserController.atualizaUser)
router.post('/logout', UserController.logout)
router.post('/reset', UserController.resetPassword)
router.delete('/user/:id', auth.authenticatedUser, checkRole.checkRole([1]), UserController.deletaUsers)
router.post('/newPin', UserController.gerarPin)

module.exports = router
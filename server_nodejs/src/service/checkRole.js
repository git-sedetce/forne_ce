require('dotenv').config()

function checkRole(rolesPermitidos){
    return (req, res, next) => {
        const profile = res.locals.user._profile_id;
        if(!rolesPermitidos.includes(profile)){
            return res.status(403).json({message: "Acesso negado!"});
        }
        next();
    }
}

module.exports = {checkRole : checkRole}
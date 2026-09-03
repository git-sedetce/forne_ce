const jwt = require("jsonwebtoken");
require("dotenv").config();


  function authenticatedUser(req, res, next) {

    // const token = req.headers["x-access-token"];
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    if(!token)
        return res.sendStatus(401);

        jwt.verify(token, process.env.ACCESS_TOKEN, (err, userDecoded) =>{
            if(err)
                return res.sendStatus(403);
              // console.log('userDecoded', userDecoded)
            res.locals.user = userDecoded;
            next()
        })       
  }


module.exports = { authenticatedUser:authenticatedUser };

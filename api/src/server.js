const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const routes = require('./routes');
const path = require('path');
require ('dotenv').config()

const app = express()
app.use(cookieParser())
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


var corsOptions = {
  origin: [
    'http://localhost:2609',
    'http://localhost:8108',
    'https://localhost:8108', 
    'http://fornece.sde.ce.gov.br', 
    'https://fornece.sde.ce.gov.br'
  ],
  credentials: true,
  methods: ['GET', 'PUT', 'POST','PATCH', 'DELETE'],
  allowedHeaders: ["Content-Type", "Authorization"],
  };
  
app.use(cors(corsOptions));

routes(app)

const port = process.env.API_PORT || 8109

app.listen(port, () => console.log(`O servidor está On Port: ${port}`))

module.exports = app
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
    'http://localhost:3000', 
    'http://credimpacto.adece.ce.gov.br', 
    'https://credimpacto.adece.ce.gov.br'
  ],
  credentials: true,
  methods: ['GET', 'PUT', 'POST','PATCH', 'DELETE'],
  allowedHeaders: ["Content-Type", "Authorization"],
  };
  
app.use(cors(corsOptions));

routes(app)

const port = process.env.PORT

app.listen(port, () => console.log(`O servidor está On`))

module.exports = app
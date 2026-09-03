// require ('dotenv').config({
//   path: require('path').resolve(__dirname, '../../../.env'),
// });

// module.exports = {
//   "development": {
//     "username": process.env.DB_USER,
//     "password": process.env.DB_PASSWORD,
//     "database": process.env.DB_NAME,
//     "host": process.env.DB_HOST,
//     "dialect": "postgres"
//   },
//   "test": {
//     "username": "root",
//     "password": null,
//     "database": "database_test",
//     "host": "127.0.0.1",
//     "dialect": "postgres"
//   },
//   "production": {
//     "username": "root",
//     "password": null,
//     "database": "database_production",
//     "host": "127.0.0.1",
//     "dialect": "postgres"
//   }
// }


require('dotenv').config({
  path: require('path').resolve(__dirname, '../../../.env'),
});

const databaseConfig = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  dialect: 'postgres',

  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
  },

  logging: false,
};

module.exports = {
  development: databaseConfig,
  test: databaseConfig,
  production: databaseConfig,
};
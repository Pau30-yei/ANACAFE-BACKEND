require('dotenv').config();
const sql = require('mssql');

const dbConfig = {
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT) || 1433,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  options: {
    encrypt: false,
    enableArithAbort: true,
    trustServerCertificate: true
  },
  connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 30000
};

async function connectDB() {
  try {
    const pool = await sql.connect(dbConfig);
    console.log('Conectado a SQL Server');
    return pool;
  } catch (err) {
    console.error('Error de conexión:', err);
    throw err;
  }
}

module.exports = { connectDB };

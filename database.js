require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'mainline.proxy.rlwy.net',
  database: process.env.DB_DATABASE || 'railway',
  password: process.env.DB_PASS || 'sdyhQutboMsiQrtaLTKPQgYrPLVyQdZU',
  port: process.env.DB_PORT || 30002,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 2 * 60 * 60 * 1000,
  connectionTimeoutMillis: 10000,
});

// Captura errores inesperados del pool
pool.on('error', (err, client) => {
  console.error('Error inesperado en el pool de PostgreSQL', err);
});

async function connectDB(retries = 5, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      console.log('Conectado a PostgreSQL');
      return client;
    } catch (err) {
      console.error(`Error de conexión a PostgreSQL (intento ${i + 1}):`, err.message);
      if (i < retries - 1) {
        await new Promise(res => setTimeout(res, delay)); // espera antes de reintentar
      } else {
        throw err;
      }
    }
  }
}


module.exports = { connectDB, pool };
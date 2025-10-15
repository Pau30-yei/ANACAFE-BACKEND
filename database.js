require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'mainline.proxy.rlwy.net',
  database: process.env.DB_DATABASE || 'railway',
  password: process.env.DB_PASS ,
  port: process.env.DB_PORT || 30002,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function connectDB() {
  try {
    const client = await pool.connect();
    console.log('Conectado a PostgreSQL');
    return client;
  } catch (err) {
    console.error('Error de conexión a PostgreSQL:', err);
    throw err;
  }
}

module.exports = { connectDB, pool };
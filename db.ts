
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'pawnkk2007',
  database: process.env.DB_NAME || 'roadguard_db',
  waitForConnections: true,
  connectionLimit: 10,
});

export default pool;


import pool from './db';

async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('MySQL connected successfully!');
    
    const [rows] = await connection.query('SELECT DATABASE() AS db');
    console.log(rows);

    connection.release();
    await pool.end();
  } catch (error) {
    console.error('MySQL connection failed:', error);
  }
}

testConnection();

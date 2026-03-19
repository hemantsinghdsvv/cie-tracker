const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Create tables on startup
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS programs (
        id SERIAL PRIMARY KEY,
        program_name TEXT UNIQUE NOT NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS courses (
        course_code TEXT NOT NULL,
        course_name TEXT NOT NULL,
        program_name TEXT NOT NULL,
        faculty_name TEXT,
        semester TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (course_code, program_name)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        scholar_id TEXT PRIMARY KEY,
        student_name TEXT NOT NULL,
        program_name TEXT NOT NULL,
        semester TEXT NOT NULL
      )
    `);

    console.log('✅ Database tables ready (PostgreSQL)');
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  } finally {
    client.release();
  }
}

initDB();

module.exports = pool;

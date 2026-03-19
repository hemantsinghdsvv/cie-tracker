const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL not set — database queries will fail. Set it in your environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

async function initDB() {
  if (!process.env.DATABASE_URL) return;
  try {
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
      await client.query(`
        CREATE TABLE IF NOT EXISTS marks (
          id SERIAL PRIMARY KEY,
          scholar_id TEXT NOT NULL,
          course_code TEXT NOT NULL,
          program_name TEXT NOT NULL,
          semester TEXT NOT NULL,
          component TEXT NOT NULL,
          marks_obtained NUMERIC,
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (scholar_id, course_code, program_name, semester, component)
        )
      `);
      console.log('✅ Database tables ready (PostgreSQL / Neon)');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

initDB().catch(console.error);

module.exports = pool;
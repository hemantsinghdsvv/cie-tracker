const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set!');
  // Don't throw here — let routes fail gracefully with a clear error
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err.message);
});

// Create tables on startup (non-blocking)
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
      console.log('✅ Database tables ready (PostgreSQL / Neon)');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

// Run async — don't block module load
initDB().catch(console.error);

module.exports = pool;

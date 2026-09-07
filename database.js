require('dotenv').config();
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// Configure WebSocket constructor for Node.js environment
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL not set — database queries will fail. Set it in your environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
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
          session TEXT NOT NULL DEFAULT 'January – June 2026',
          PRIMARY KEY (course_code, program_name, semester, session)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS students (
          scholar_id TEXT NOT NULL,
          student_name TEXT NOT NULL,
          program_name TEXT NOT NULL,
          semester TEXT NOT NULL,
          session TEXT NOT NULL DEFAULT 'January – June 2026',
          PRIMARY KEY (scholar_id, session)
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS schedule (
          id SERIAL PRIMARY KEY,
          program_name TEXT NOT NULL,
          semester TEXT NOT NULL,
          course_name TEXT NOT NULL,
          faculty_name TEXT,
          exam_name TEXT NOT NULL,
          announcement_date TEXT,
          submission_date TEXT,
          conduction_date TEXT,
          show_marks_date TEXT,
          session TEXT NOT NULL DEFAULT 'January – June 2026',
          created_at TIMESTAMPTZ DEFAULT NOW()
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
          session TEXT NOT NULL DEFAULT 'January – June 2026',
          updated_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE (scholar_id, course_code, program_name, semester, component, session)
        )
      `);

      // Migrations for existing databases
      await client.query(`
        DO $$
        BEGIN
          -- Add session column if missing
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='courses' AND column_name='session') THEN
            ALTER TABLE courses ADD COLUMN session TEXT NOT NULL DEFAULT 'January – June 2026';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='session') THEN
            ALTER TABLE students ADD COLUMN session TEXT NOT NULL DEFAULT 'January – June 2026';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='schedule' AND column_name='session') THEN
            ALTER TABLE schedule ADD COLUMN session TEXT NOT NULL DEFAULT 'January – June 2026';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='marks' AND column_name='session') THEN
            ALTER TABLE marks ADD COLUMN session TEXT NOT NULL DEFAULT 'January – June 2026';
          END IF;

          -- Update courses primary key
          BEGIN
            ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_pkey;
            ALTER TABLE courses ADD CONSTRAINT courses_pkey PRIMARY KEY (course_code, program_name, semester, session);
          EXCEPTION WHEN others THEN NULL;
          END;

          -- Update students primary key
          BEGIN
            ALTER TABLE students DROP CONSTRAINT IF EXISTS students_pkey;
            ALTER TABLE students ADD CONSTRAINT students_pkey PRIMARY KEY (scholar_id, session);
          EXCEPTION WHEN others THEN NULL;
          END;

          -- Update marks unique constraint
          BEGIN
            ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_scholar_id_course_code_program_name_semester_component_key;
            ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_scholar_session_comp_key;
            ALTER TABLE marks ADD CONSTRAINT marks_scholar_session_comp_key UNIQUE (scholar_id, course_code, program_name, semester, component, session);
          EXCEPTION WHEN others THEN NULL;
          END;
        END $$;
      `);
      console.log('✅ Database tables ready (PostgreSQL / Neon) with session partitioning');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

initDB().catch(console.error);

module.exports = pool;
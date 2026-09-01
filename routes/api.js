const express = require('express');
const router = express.Router();
const pool = require('../database');

// Helper: run a query and return rows
async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// Get all programs (optionally filtered by session)
router.get('/programs', async (req, res) => {
  const { session } = req.query;
  try {
    let sql = 'SELECT DISTINCT program_name FROM programs';
    const params = [];
    if (session) {
      sql = `SELECT DISTINCT program_name FROM courses WHERE session = $1
             UNION
             SELECT DISTINCT program_name FROM students WHERE session = $1
             ORDER BY program_name`;
      params.push(session);
    } else {
      sql += ' ORDER BY program_name';
    }
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get distinct semesters for a program (+ session)
router.get('/semesters', async (req, res) => {
  const { program, session } = req.query;
  if (!program) return res.status(400).json({ error: 'program is required' });
  try {
    let sql = 'SELECT DISTINCT semester FROM students WHERE program_name = $1';
    const params = [program];
    if (session) {
      sql += ' AND session = $2';
      params.push(session);
    }
    sql += ' ORDER BY semester';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get courses for a program + semester (+ session)
router.get('/courses', async (req, res) => {
  const { program, semester, session } = req.query;
  if (!program || !semester) return res.status(400).json({ error: 'program and semester are required' });
  try {
    let sql = 'SELECT course_code, course_name, faculty_name, session FROM courses WHERE program_name = $1 AND semester = $2';
    const params = [program, semester];
    if (session) {
      sql += ' AND session = $3';
      params.push(session);
    }
    sql += ' ORDER BY course_name';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get students for program + semester (+ session)
router.get('/students', async (req, res) => {
  const { program, semester, session } = req.query;
  if (!program || !semester) return res.status(400).json({ error: 'program and semester are required' });
  try {
    let sql = 'SELECT scholar_id, student_name, session FROM students WHERE program_name = $1 AND semester = $2';
    const params = [program, semester];
    if (session) {
      sql += ' AND session = $3';
      params.push(session);
    }
    sql += ' ORDER BY student_name';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stats for admin panel (+ session)
router.get('/stats', async (req, res) => {
  const { session } = req.query;
  try {
    if (session) {
      const [p, c, s] = await Promise.all([
        query('SELECT COUNT(DISTINCT program_name) as count FROM courses WHERE session = $1', [session]),
        query('SELECT COUNT(*) as count FROM courses WHERE session = $1', [session]),
        query('SELECT COUNT(*) as count FROM students WHERE session = $1', [session])
      ]);
      res.json({
        programs: parseInt(p[0].count),
        courses:  parseInt(c[0].count),
        students: parseInt(s[0].count)
      });
    } else {
      const [p, c, s] = await Promise.all([
        query('SELECT COUNT(*) as count FROM programs'),
        query('SELECT COUNT(*) as count FROM courses'),
        query('SELECT COUNT(*) as count FROM students')
      ]);
      res.json({
        programs: parseInt(p[0].count),
        courses:  parseInt(c[0].count),
        students: parseInt(s[0].count)
      });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DATA MANAGEMENT ──────────────────────────────────────────────────────────

// List all courses (with optional search/pagination/session)
router.get('/all-courses', async (req, res) => {
  const { search = '', session = '', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const like = `%${search}%`;
  try {
    let whereClause = `(c.course_code ILIKE $1 OR c.course_name ILIKE $2 OR c.program_name ILIKE $3 OR c.faculty_name ILIKE $4 OR c.semester ILIKE $5)`;
    const params = [like, like, like, like, like];

    if (session) {
      params.push(session);
      whereClause += ` AND c.session = $${params.length}`;
    }

    const countSql = `SELECT COUNT(*) as count FROM courses c WHERE ${whereClause}`;
    const total = await query(countSql, params);

    params.push(parseInt(limit), offset);
    const dataSql = `SELECT c.course_code, c.course_name, c.program_name, c.faculty_name, c.semester, c.session
       FROM courses c
       WHERE ${whereClause}
       ORDER BY c.program_name, c.semester, c.course_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const rows = await query(dataSql, params);
    res.json({ rows, total: parseInt(total[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all students (with optional search/pagination/session)
router.get('/all-students', async (req, res) => {
  const { search = '', session = '', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const like = `%${search}%`;
  try {
    let whereClause = `(scholar_id ILIKE $1 OR student_name ILIKE $2 OR program_name ILIKE $3 OR semester ILIKE $4)`;
    const params = [like, like, like, like];

    if (session) {
      params.push(session);
      whereClause += ` AND session = $${params.length}`;
    }

    const countSql = `SELECT COUNT(*) as count FROM students WHERE ${whereClause}`;
    const total = await query(countSql, params);

    params.push(parseInt(limit), offset);
    const dataSql = `SELECT scholar_id, student_name, program_name, semester, session
       FROM students
       WHERE ${whereClause}
       ORDER BY program_name, semester, student_name
       LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const rows = await query(dataSql, params);
    res.json({ rows, total: parseInt(total[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clear courses (scoped to session if provided)
router.delete('/courses/clear', async (req, res) => {
  const session = req.query.session || (req.body && req.body.session);
  try {
    if (session) {
      const result = await pool.query('DELETE FROM courses WHERE session = $1', [session]);
      res.json({ success: true, message: `Deleted ${result.rowCount} courses for session "${session}".` });
    } else {
      await pool.query('DELETE FROM courses');
      await pool.query('DELETE FROM programs');
      res.json({ success: true, message: 'All courses and programs deleted across all sessions.' });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update a course
router.put('/courses/:code/:program', async (req, res) => {
  const { code, program } = req.params;
  const { course_name, program_name, faculty_name, semester, session } = req.body;
  if (!course_name || !program_name || semester === undefined)
    return res.status(400).json({ error: 'course_name, program_name, and semester are required' });
  try {
    let sql = 'UPDATE courses SET course_name=$1, program_name=$2, faculty_name=$3, semester=$4 WHERE course_code=$5 AND program_name=$6';
    const params = [course_name, program_name, faculty_name || '', semester, code, program];
    if (session) {
      sql += ' AND session=$7';
      params.push(session);
    }
    const result = await pool.query(sql, params);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Course not found' });
    await pool.query('INSERT INTO programs (program_name) VALUES ($1) ON CONFLICT DO NOTHING', [program_name]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a course
router.delete('/courses/:code/:program', async (req, res) => {
  const { code, program } = req.params;
  const session = req.query.session || (req.body && req.body.session);
  try {
    let sql = 'DELETE FROM courses WHERE course_code=$1 AND program_name=$2';
    const params = [code, program];
    if (session) {
      sql += ' AND session=$3';
      params.push(session);
    }
    const result = await pool.query(sql, params);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Course not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clear students (scoped to session if provided)
router.delete('/students/clear', async (req, res) => {
  const session = req.query.session || (req.body && req.body.session);
  try {
    if (session) {
      const result = await pool.query('DELETE FROM students WHERE session = $1', [session]);
      res.json({ success: true, message: `Deleted ${result.rowCount} students for session "${session}".` });
    } else {
      const result = await pool.query('DELETE FROM students');
      res.json({ success: true, message: `Deleted ${result.rowCount} students across all sessions.` });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update a student
router.put('/students/:id', async (req, res) => {
  const { id } = req.params;
  const { student_name, program_name, semester, session } = req.body;
  if (!student_name || !program_name || !semester)
    return res.status(400).json({ error: 'student_name, program_name, semester are required' });
  try {
    let sql = 'UPDATE students SET student_name=$1, program_name=$2, semester=$3 WHERE scholar_id=$4';
    const params = [student_name, program_name, semester, id];
    if (session) {
      sql += ' AND session=$5';
      params.push(session);
    }
    const result = await pool.query(sql, params);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a student
router.delete('/students/:id', async (req, res) => {
  const { id } = req.params;
  const session = req.query.session || (req.body && req.body.session);
  try {
    let sql = 'DELETE FROM students WHERE scholar_id=$1';
    const params = [id];
    if (session) {
      sql += ' AND session=$2';
      params.push(session);
    }
    const result = await pool.query(sql, params);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

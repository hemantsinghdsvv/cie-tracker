const express = require('express');
const router = express.Router();
const pool = require('../database');

// Helper: run a query and return rows
async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// Get all programs
router.get('/programs', async (req, res) => {
  try {
    const rows = await query('SELECT DISTINCT program_name FROM programs ORDER BY program_name');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get distinct semesters for a program
router.get('/semesters', async (req, res) => {
  const { program } = req.query;
  if (!program) return res.status(400).json({ error: 'program is required' });
  try {
    const rows = await query(
      'SELECT DISTINCT semester FROM students WHERE program_name = $1 ORDER BY semester',
      [program]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get courses for a program + semester
router.get('/courses', async (req, res) => {
  const { program, semester } = req.query;
  if (!program || !semester) return res.status(400).json({ error: 'program and semester are required' });
  try {
    const rows = await query(
      'SELECT course_code, course_name, faculty_name FROM courses WHERE program_name = $1 AND semester = $2 ORDER BY course_name',
      [program, semester]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get students for program + semester
router.get('/students', async (req, res) => {
  const { program, semester } = req.query;
  if (!program || !semester) return res.status(400).json({ error: 'program and semester are required' });
  try {
    const rows = await query(
      'SELECT scholar_id, student_name FROM students WHERE program_name = $1 AND semester = $2 ORDER BY student_name',
      [program, semester]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stats for admin panel
router.get('/stats', async (req, res) => {
  try {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DATA MANAGEMENT ──────────────────────────────────────────────────────────

// List all courses (with optional search/pagination)
router.get('/all-courses', async (req, res) => {
  const { search = '', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const like = `%${search}%`;
  try {
    const rows = await query(
      `SELECT c.course_code, c.course_name, c.program_name, c.faculty_name, c.semester
       FROM courses c
       WHERE c.course_code ILIKE $1 OR c.course_name ILIKE $2 OR c.program_name ILIKE $3 OR c.faculty_name ILIKE $4 OR c.semester ILIKE $5
       ORDER BY c.program_name, c.semester, c.course_name
       LIMIT $6 OFFSET $7`,
      [like, like, like, like, like, parseInt(limit), offset]
    );
    const total = await query(
      `SELECT COUNT(*) as count FROM courses
       WHERE course_code ILIKE $1 OR course_name ILIKE $2 OR program_name ILIKE $3 OR faculty_name ILIKE $4 OR semester ILIKE $5`,
      [like, like, like, like, like]
    );
    res.json({ rows, total: parseInt(total[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all students (with optional search/pagination)
router.get('/all-students', async (req, res) => {
  const { search = '', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const like = `%${search}%`;
  try {
    const rows = await query(
      `SELECT scholar_id, student_name, program_name, semester
       FROM students
       WHERE scholar_id ILIKE $1 OR student_name ILIKE $2 OR program_name ILIKE $3 OR semester ILIKE $4
       ORDER BY program_name, semester, student_name
       LIMIT $5 OFFSET $6`,
      [like, like, like, like, parseInt(limit), offset]
    );
    const total = await query(
      `SELECT COUNT(*) as count FROM students
       WHERE scholar_id ILIKE $1 OR student_name ILIKE $2 OR program_name ILIKE $3 OR semester ILIKE $4`,
      [like, like, like, like]
    );
    res.json({ rows, total: parseInt(total[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clear all courses (and programs)
router.delete('/courses/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM courses');
    await pool.query('DELETE FROM programs');
    res.json({ success: true, message: 'All courses and programs deleted.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update a course
router.put('/courses/:code/:program', async (req, res) => {
  const { code, program } = req.params;
  const { course_name, program_name, faculty_name, semester } = req.body;
  if (!course_name || !program_name || semester === undefined)
    return res.status(400).json({ error: 'course_name, program_name, and semester are required' });
  try {
    const result = await pool.query(
      'UPDATE courses SET course_name=$1, program_name=$2, faculty_name=$3, semester=$4 WHERE course_code=$5 AND program_name=$6',
      [course_name, program_name, faculty_name || '', semester, code, program]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Course not found' });
    await pool.query('INSERT INTO programs (program_name) VALUES ($1) ON CONFLICT DO NOTHING', [program_name]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a course
router.delete('/courses/:code/:program', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM courses WHERE course_code=$1 AND program_name=$2',
      [req.params.code, req.params.program]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Course not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clear all students
router.delete('/students/clear', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM students');
    res.json({ success: true, message: `Deleted ${result.rowCount} students.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update a student
router.put('/students/:id', async (req, res) => {
  const { id } = req.params;
  const { student_name, program_name, semester } = req.body;
  if (!student_name || !program_name || !semester)
    return res.status(400).json({ error: 'student_name, program_name, semester are required' });
  try {
    const result = await pool.query(
      'UPDATE students SET student_name=$1, program_name=$2, semester=$3 WHERE scholar_id=$4',
      [student_name, program_name, semester, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete a student
router.delete('/students/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM students WHERE scholar_id=$1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../database');

// Helper: wrap db.all in a promise
function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
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
      'SELECT DISTINCT semester FROM students WHERE program_name = ? ORDER BY semester',
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
      'SELECT course_code, course_name, faculty_name FROM courses WHERE program_name = ? AND semester = ? ORDER BY course_name',
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
      'SELECT scholar_id, student_name FROM students WHERE program_name = ? AND semester = ? ORDER BY student_name',
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
    res.json({ programs: p[0].count, courses: c[0].count, students: s[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DATA MANAGEMENT ──────────────────────────────────────────────────────────

// List all courses (with optional search/pagination)
router.get('/all-courses', async (req, res) => {
  const { search = '', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const like = `%${search}%`;
    const rows = await query(
      `SELECT c.course_code, c.course_name, c.program_name, c.faculty_name, c.semester
       FROM courses c
       WHERE c.course_code LIKE ? OR c.course_name LIKE ? OR c.program_name LIKE ? OR c.faculty_name LIKE ? OR c.semester LIKE ?
       ORDER BY c.program_name, c.semester, c.course_name
       LIMIT ? OFFSET ?`,
      [like, like, like, like, like, parseInt(limit), offset]
    );
    const total = await query(
      `SELECT COUNT(*) as count FROM courses
       WHERE course_code LIKE ? OR course_name LIKE ? OR program_name LIKE ? OR faculty_name LIKE ? OR semester LIKE ?`,
      [like, like, like, like, like]
    );
    res.json({ rows, total: total[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all students (with optional search/pagination)
router.get('/all-students', async (req, res) => {
  const { search = '', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const like = `%${search}%`;
    const rows = await query(
      `SELECT scholar_id, student_name, program_name, semester
       FROM students
       WHERE scholar_id LIKE ? OR student_name LIKE ? OR program_name LIKE ? OR semester LIKE ?
       ORDER BY program_name, semester, student_name
       LIMIT ? OFFSET ?`,
      [like, like, like, like, parseInt(limit), offset]
    );
    const total = await query(
      `SELECT COUNT(*) as count FROM students
       WHERE scholar_id LIKE ? OR student_name LIKE ? OR program_name LIKE ? OR semester LIKE ?`,
      [like, like, like, like]
    );
    res.json({ rows, total: total[0].count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Clear all courses (and programs) — must be BEFORE /:code route
router.delete('/courses/clear', (req, res) => {
  db.serialize(() => {
    db.run('DELETE FROM courses', (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.run('DELETE FROM programs', (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ success: true, message: 'All courses and programs deleted.' });
      });
    });
  });
});

// Update a course
// Now requires both code and program as identifiers
router.put('/courses/:code/:program', (req, res) => {
  const { code, program } = req.params;
  const { course_name, program_name, faculty_name, semester } = req.body;
  if (!course_name || !program_name || semester === undefined) return res.status(400).json({ error: 'course_name, program_name, and semester are required' });
  db.run(
    'UPDATE courses SET course_name=?, program_name=?, faculty_name=?, semester=? WHERE course_code=? AND program_name=?',
    [course_name, program_name, faculty_name || '', semester, code, program],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Course not found' });
      db.run('INSERT OR IGNORE INTO programs (program_name) VALUES (?)', [program_name]);
      res.json({ success: true });
    }
  );
});

// Delete a course
router.delete('/courses/:code/:program', (req, res) => {
  db.run('DELETE FROM courses WHERE course_code=? AND program_name=?', [req.params.code, req.params.program], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Course not found' });
    res.json({ success: true });
  });
});

// Clear all students — must be BEFORE /:id route
router.delete('/students/clear', (req, res) => {
  db.run('DELETE FROM students', function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: `Deleted ${this.changes} students.` });
  });
});

// Update a student
router.put('/students/:id', (req, res) => {
  const { id } = req.params;
  const { student_name, program_name, semester } = req.body;
  if (!student_name || !program_name || !semester) return res.status(400).json({ error: 'student_name, program_name, semester are required' });
  db.run(
    'UPDATE students SET student_name=?, program_name=?, semester=? WHERE scholar_id=?',
    [student_name, program_name, semester, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Student not found' });
      res.json({ success: true });
    }
  );
});

// Delete a student
router.delete('/students/:id', (req, res) => {
  db.run('DELETE FROM students WHERE scholar_id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Student not found' });
    res.json({ success: true });
  });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const pool = require('../database');

// GET /api/marks?program=&semester=&courseCode=
// Returns marks for all students in a given course
router.get('/', async (req, res) => {
  const { program, semester, courseCode } = req.query;
  if (!program || !semester || !courseCode)
    return res.status(400).json({ error: 'program, semester, courseCode are required' });
  try {
    const result = await pool.query(
      `SELECT m.scholar_id, s.student_name, m.component, m.marks_obtained, m.updated_at
       FROM marks m
       JOIN students s ON s.scholar_id = m.scholar_id
       WHERE m.program_name = $1 AND m.semester = $2 AND m.course_code = $3
       ORDER BY s.student_name, m.component`,
      [program, semester, courseCode]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/marks/save
// Body: { program, semester, courseCode, entries: [{ scholar_id, component, marks_obtained }] }
// Upserts all marks for a course in one transaction
router.post('/save', async (req, res) => {
  const { program, semester, courseCode, entries } = req.body;
  if (!program || !semester || !courseCode || !Array.isArray(entries))
    return res.status(400).json({ error: 'program, semester, courseCode, entries[] are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      const { scholar_id, component, marks_obtained } = entry;
      if (!scholar_id || !component) continue;
      await client.query(
        `INSERT INTO marks (scholar_id, course_code, program_name, semester, component, marks_obtained, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (scholar_id, course_code, program_name, semester, component)
         DO UPDATE SET marks_obtained = EXCLUDED.marks_obtained, updated_at = NOW()`,
        [scholar_id, courseCode, program, semester, component, marks_obtained ?? null]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, saved: entries.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

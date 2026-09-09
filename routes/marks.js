const express = require('express');
const router = express.Router();
const pool = require('../database');

// GET /api/marks?program=&semester=&courseCode=&session=
// Returns marks for all students in a given course
router.get('/', async (req, res) => {
  const { program, semester, courseCode, session } = req.query;
  if (!program || !semester || !courseCode)
    return res.status(400).json({ error: 'program, semester, courseCode are required' });
  try {
    const prog = (program || '').toString().trim().toUpperCase();
    const sem = (semester || '').toString().trim();
    const code = (courseCode || '').toString().trim().toUpperCase();

    const isBit7Shared = ((prog === 'BIT' || prog === 'BITR') && sem === '7') && (
      code === 'CS401CON' || code === 'CS402SQL' || code === 'CS406DMW' ||
      code.includes('NETWORK') || code.includes('QUERY') || code.includes('SQL') ||
      code.includes('MINING') || code.includes('WAREHOUS') || code.includes('DMW')
    );

    let sql;
    const params = [];

    if (isBit7Shared) {
      sql = `SELECT m.scholar_id, COALESCE(s.student_name, m.scholar_id) AS student_name, m.component, m.marks_obtained, m.updated_at
         FROM marks m
         LEFT JOIN students s ON s.scholar_id = m.scholar_id AND s.session = m.session
         WHERE m.program_name IN ('BIT', 'BITR') AND m.semester = $1 AND m.course_code = $2`;
      params.push(sem, courseCode);
    } else {
      sql = `SELECT m.scholar_id, COALESCE(s.student_name, m.scholar_id) AS student_name, m.component, m.marks_obtained, m.updated_at
         FROM marks m
         LEFT JOIN students s ON s.scholar_id = m.scholar_id AND s.session = m.session
         WHERE m.program_name = $1 AND m.semester = $2 AND m.course_code = $3`;
      params.push(program, semester, courseCode);
    }

    if (session) {
      sql += ` AND m.session = $${params.length + 1}`;
      params.push(session);
    }
    sql += ' ORDER BY s.student_name, m.component';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/marks/save
// Body: { program, semester, courseCode, entries: [{ scholar_id, component, marks_obtained }], session }
// Upserts all marks for a course in one transaction
router.post('/save', async (req, res) => {
  const { program, semester, courseCode, entries, session = 'July – December 2026' } = req.body;
  if (!program || !semester || !courseCode || !Array.isArray(entries))
    return res.status(400).json({ error: 'program, semester, courseCode, entries[] are required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of entries) {
      const { scholar_id, component, marks_obtained } = entry;
      if (!scholar_id || !component) continue;
      await client.query(
        `INSERT INTO marks (scholar_id, course_code, program_name, semester, component, marks_obtained, session, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (scholar_id, course_code, program_name, semester, component, session)
         DO UPDATE SET marks_obtained = EXCLUDED.marks_obtained, updated_at = NOW()`,
        [scholar_id, courseCode, program, semester, component, marks_obtained ?? null, session]
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

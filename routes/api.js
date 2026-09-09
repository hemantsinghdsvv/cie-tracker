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
    let sql;
    const params = [program];
    if (session) {
      sql = `SELECT DISTINCT semester FROM (
               SELECT semester FROM students WHERE UPPER(program_name) = UPPER($1) AND session = $2
               UNION
               SELECT semester FROM courses WHERE UPPER(program_name) = UPPER($1) AND session = $2
             ) s
             WHERE semester IS NOT NULL AND semester != ''`;
      params.push(session);
    } else {
      sql = `SELECT DISTINCT semester FROM (
               SELECT semester FROM students WHERE UPPER(program_name) = UPPER($1)
               UNION
               SELECT semester FROM courses WHERE UPPER(program_name) = UPPER($1)
             ) s
             WHERE semester IS NOT NULL AND semester != ''`;
    }
    const rows = await query(sql, params);
    rows.sort((a, b) => {
      const na = parseInt(a.semester), nb = parseInt(b.semester);
      return (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a.semester).localeCompare(String(b.semester));
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get courses for a program + semester (+ session)
router.get('/courses', async (req, res) => {
  const { program, semester, session } = req.query;
  if (!program || !semester) return res.status(400).json({ error: 'program and semester are required' });
  try {
    const prog = (program || '').toString().trim().toUpperCase();
    const sem = (semester || '').toString().trim();

    let sql;
    const params = [prog, sem];

    if (session) {
      sql = `SELECT course_code, course_name, faculty_name, session, semester 
             FROM courses 
             WHERE (
               UPPER(program_name) = $1 
               OR (
                 $1 = 'BITR' AND $2 = '7' AND UPPER(program_name) = 'BIT' AND semester = '7'
                 AND (course_code IN ('CS401CON', 'CS402SQL', 'CS406DMW') OR course_name ILIKE '%network%' OR course_name ILIKE '%query%' OR course_name ILIKE '%sql%' OR course_name ILIKE '%mining%' OR course_name ILIKE '%warehous%' OR course_name ILIKE '%dmw%')
               )
             )
             AND (
               semester = $2 
               OR (
                 $1 IN ('MULTI', 'SEC') 
                 AND NOT EXISTS (SELECT 1 FROM courses WHERE UPPER(program_name) = $1 AND semester = $2 AND session = $3)
               )
             )
             AND session = $3`;
      params.push(session);
    } else {
      sql = `SELECT course_code, course_name, faculty_name, session, semester 
             FROM courses 
             WHERE (
               UPPER(program_name) = $1 
               OR (
                 $1 = 'BITR' AND $2 = '7' AND UPPER(program_name) = 'BIT' AND semester = '7'
                 AND (course_code IN ('CS401CON', 'CS402SQL', 'CS406DMW') OR course_name ILIKE '%network%' OR course_name ILIKE '%query%' OR course_name ILIKE '%sql%' OR course_name ILIKE '%mining%' OR course_name ILIKE '%warehous%' OR course_name ILIKE '%dmw%')
               )
             )
             AND (
               semester = $2 
               OR (
                 $1 IN ('MULTI', 'SEC') 
                 AND NOT EXISTS (SELECT 1 FROM courses WHERE UPPER(program_name) = $1 AND semester = $2)
               )
             )`;
    }
    sql += ' ORDER BY course_name';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get students for program + semester (+ session + optional course)
router.get('/students', async (req, res) => {
  const { program, semester, session, course, courseCode } = req.query;
  if (!program || !semester) return res.status(400).json({ error: 'program and semester are required' });
  try {
    const prog = (program || '').toString().trim().toUpperCase();
    const sem = (semester || '').toString().trim();
    const cVal = (course || courseCode || '').toString().trim().toUpperCase();

    const isBit7SharedCourse = ((prog === 'BIT' || prog === 'BITR') && sem === '7') && (
      cVal === 'CS401CON' ||
      cVal === 'CS402SQL' ||
      cVal === 'CS406DMW' ||
      cVal.includes('NETWORK') ||
      cVal.includes('QUERY') ||
      cVal.includes('SQL') ||
      cVal.includes('MINING') ||
      cVal.includes('WAREHOUS') ||
      cVal.includes('DMW')
    );

    let sql;
    const params = [];

    if (isBit7SharedCourse) {
      // Semester 7 exception: BITR students also counted as BIT 7 students for Computer Networks, SQL, and Data Mining & Warehousing
      sql = `SELECT scholar_id, student_name, program_name, semester, session
             FROM students
             WHERE UPPER(program_name) IN ('BIT', 'BITR') AND semester = $1`;
      params.push(sem);
      if (session) {
        sql += ` AND session = $${params.length + 1}`;
        params.push(session);
      }
    } else {
      sql = `SELECT scholar_id, student_name, program_name, semester, session
             FROM students
             WHERE UPPER(program_name) = UPPER($1) AND semester = $2`;
      params.push(program, semester);
      if (session) {
        sql += ` AND session = $${params.length + 1}`;
        params.push(session);
      }
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
// List all courses (with optional search/pagination/session/filter/sort)
router.get('/all-courses', async (req, res) => {
  const { search = '', session = '', semester = '', course = '', sortBy = '', sortDir = 'ASC', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const like = `%${search}%`;
  try {
    const whereClauses = [];
    const params = [];

    if (search) {
      params.push(like);
      const idx = params.length;
      whereClauses.push(`(c.course_code ILIKE $${idx} OR c.course_name ILIKE $${idx} OR c.program_name ILIKE $${idx} OR c.faculty_name ILIKE $${idx} OR c.semester ILIKE $${idx})`);
    }

    if (session) {
      params.push(session);
      whereClauses.push(`c.session = $${params.length}`);
    }

    if (semester) {
      params.push(semester);
      whereClauses.push(`c.semester = $${params.length}`);
    }

    if (course) {
      params.push(course);
      whereClauses.push(`(c.course_code = $${params.length} OR c.course_name = $${params.length})`);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) as count FROM courses c ${whereStr}`;
    const total = await query(countSql, params);

    const validSort = {
      semester: 'c.semester',
      course_code: 'c.course_code',
      code: 'c.course_code',
      course_name: 'c.course_name',
      course: 'c.course_name',
      program_name: 'c.program_name',
      program: 'c.program_name',
      faculty_name: 'c.faculty_name',
      faculty: 'c.faculty_name'
    };
    const direction = (sortDir && sortDir.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
    let orderClause = 'ORDER BY c.program_name, c.semester, c.course_name';
    if (sortBy && validSort[sortBy.toLowerCase()]) {
      if (sortBy.toLowerCase() === 'semester') {
        orderClause = `ORDER BY NULLIF(regexp_replace(c.semester, '\\D', '', 'g'), '')::int ${direction} NULLS LAST, c.semester ${direction}, c.course_name ASC`;
      } else {
        const col = validSort[sortBy.toLowerCase()];
        orderClause = `ORDER BY ${col} ${direction}, c.course_name ASC`;
      }
    }

    params.push(parseInt(limit), offset);
    const dataSql = `SELECT c.course_code, c.course_name, c.program_name, c.faculty_name, c.semester, c.session
       FROM courses c
       ${whereStr}
       ${orderClause}
       LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const rows = await query(dataSql, params);
    res.json({ rows, total: parseInt(total[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all students (with optional search/pagination/session/filter/sort)
router.get('/all-students', async (req, res) => {
  const { search = '', session = '', semester = '', course = '', sortBy = '', sortDir = 'ASC', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const like = `%${search}%`;
  try {
    const whereClauses = [];
    const params = [];

    if (search) {
      params.push(like);
      const idx = params.length;
      whereClauses.push(`(s.scholar_id ILIKE $${idx} OR s.student_name ILIKE $${idx} OR s.program_name ILIKE $${idx} OR s.semester ILIKE $${idx})`);
    }

    if (session) {
      params.push(session);
      whereClauses.push(`s.session = $${params.length}`);
    }

    if (semester) {
      params.push(semester);
      whereClauses.push(`s.semester = $${params.length}`);
    }

    if (course) {
      params.push(course);
      const idx = params.length;
      whereClauses.push(`(
        EXISTS (
          SELECT 1 FROM courses c
          WHERE (c.course_code = $${idx} OR c.course_name = $${idx})
            AND c.session = s.session
            AND (
              (c.program_name = s.program_name AND c.semester = s.semester)
              OR (
                c.semester = '7' AND s.semester = '7'
                AND (
                  (c.program_name = 'BIT' AND s.program_name = 'BITR')
                  OR (c.program_name = 'BITR' AND s.program_name = 'BIT')
                )
                AND (
                  c.course_code IN ('CS401CON', 'CS402SQL', 'CS406DMW')
                  OR c.course_name ILIKE '%network%'
                  OR c.course_name ILIKE '%query%'
                  OR c.course_name ILIKE '%sql%'
                  OR c.course_name ILIKE '%mining%'
                  OR c.course_name ILIKE '%warehous%'
                  OR c.course_name ILIKE '%dmw%'
                )
              )
            )
        )
        OR EXISTS (
          SELECT 1 FROM marks m
          WHERE m.course_code = $${idx}
            AND m.session = s.session
            AND m.scholar_id = s.scholar_id
        )
      )`);
    }

    const whereStr = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const countSql = `SELECT COUNT(*) as count FROM students s ${whereStr}`;
    const total = await query(countSql, params);

    const validSort = {
      semester: 's.semester',
      student_name: 's.student_name',
      name: 's.student_name',
      scholar_id: 's.scholar_id',
      id: 's.scholar_id',
      program_name: 's.program_name',
      program: 's.program_name'
    };
    const direction = (sortDir && sortDir.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
    let orderClause = 'ORDER BY s.program_name, s.semester, s.student_name';
    if (sortBy && validSort[sortBy.toLowerCase()]) {
      if (sortBy.toLowerCase() === 'semester') {
        orderClause = `ORDER BY NULLIF(regexp_replace(s.semester, '\\D', '', 'g'), '')::int ${direction} NULLS LAST, s.semester ${direction}, s.student_name ASC`;
      } else {
        const col = validSort[sortBy.toLowerCase()];
        orderClause = `ORDER BY ${col} ${direction}, s.student_name ASC`;
      }
    }

    params.push(parseInt(limit), offset);
    const dataSql = `SELECT s.scholar_id, s.student_name, s.program_name, s.semester, s.session
       FROM students s
       ${whereStr}
       ${orderClause}
       LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const rows = await query(dataSql, params);
    res.json({ rows, total: parseInt(total[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get list of distinct courses for filter dropdown
router.get('/courses-list', async (req, res) => {
  const { session } = req.query;
  try {
    let sql = 'SELECT DISTINCT course_code, course_name, program_name, semester FROM courses';
    const params = [];
    if (session) {
      sql += ' WHERE session = $1';
      params.push(session);
    }
    sql += ' ORDER BY course_code, course_name';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get list of distinct semesters for filter dropdown
router.get('/semesters-list', async (req, res) => {
  const { session } = req.query;
  try {
    let sql;
    const params = [];
    if (session) {
      sql = `SELECT DISTINCT semester FROM courses WHERE session = $1
             UNION
             SELECT DISTINCT semester FROM students WHERE session = $1
             ORDER BY semester`;
      params.push(session);
    } else {
      sql = `SELECT DISTINCT semester FROM courses
             UNION
             SELECT DISTINCT semester FROM students
             ORDER BY semester`;
    }
    const rows = await query(sql, params);
    res.json(rows.map(r => r.semester).filter(Boolean));
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

// Add a single student
router.post('/students', async (req, res) => {
  const { scholar_id, student_name, program_name, semester, session } = req.body;
  if (!scholar_id || !student_name || !program_name || semester === undefined || semester === null || semester === '') {
    return res.status(400).json({ error: 'Scholar ID, student name, program name, and semester are required' });
  }
  const s = (session || 'July – December 2026').toString().trim();
  const id = scholar_id.toString().trim();
  const name = student_name.toString().trim();
  const program = program_name.toString().trim();
  const sem = semester.toString().trim();

  try {
    await pool.query(
      `INSERT INTO students (scholar_id, student_name, program_name, semester, session)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scholar_id, session) DO UPDATE
       SET student_name = EXCLUDED.student_name,
           program_name = EXCLUDED.program_name,
           semester = EXCLUDED.semester`,
      [id, name, program, sem, s]
    );
    await pool.query(
      'INSERT INTO programs (program_name) VALUES ($1) ON CONFLICT DO NOTHING',
      [program]
    );
    res.json({ success: true, message: `Student "${name}" (${id}) saved successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a single course
router.post('/courses', async (req, res) => {
  const { course_code, course_name, program_name, semester, faculty_name = '', session } = req.body;
  if (!course_code || !course_name || !program_name || semester === undefined || semester === null || semester === '') {
    return res.status(400).json({ error: 'Course code, course name, program name, and semester are required' });
  }
  const s = (session || 'July – December 2026').toString().trim();
  const code = course_code.toString().trim();
  const name = course_name.toString().trim();
  const program = program_name.toString().trim();
  const sem = semester.toString().trim();
  const faculty = (faculty_name || '').toString().trim();

  try {
    await pool.query(
      `INSERT INTO courses (course_code, course_name, program_name, faculty_name, semester, session)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (course_code, program_name, session) DO UPDATE
       SET course_name = EXCLUDED.course_name,
           faculty_name = EXCLUDED.faculty_name,
           semester = EXCLUDED.semester`,
      [code, name, program, faculty, sem, s]
    );
    await pool.query(
      'INSERT INTO programs (program_name) VALUES ($1) ON CONFLICT DO NOTHING',
      [program]
    );
    res.json({ success: true, message: `Course "${code}" saved successfully.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


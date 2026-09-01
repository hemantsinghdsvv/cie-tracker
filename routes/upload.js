const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../database');

// Use memory storage — Vercel has a read-only filesystem
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Upload Course Master Excel
router.post('/courses', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const session = (req.body.session || req.headers['x-session'] || 'July – December 2026').toString().trim();
  const client = await pool.connect();
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    if (!rows.length) return res.status(400).json({ success: false, message: 'Excel file is empty' });

    await client.query('BEGIN');
    let count = 0;
    for (const row of rows) {
      const program  = (row['Program']      || row['program']      || '').toString().trim();
      const code     = (row['Course Coder'] || row['Course Code']  || row['course_code'] || '').toString().trim();
      const name     = (row['Course Name']  || row['course_name']  || '').toString().trim();
      const faculty  = (row['Allocation']   || row['allocation']   || row['Faculty']     || '').toString().trim();
      const semester = (row['Semester']     || row['semester']     || '').toString().trim();
      if (!program || !code || !name || !semester) continue;

      await client.query(
        'INSERT INTO programs (program_name) VALUES ($1) ON CONFLICT DO NOTHING',
        [program]
      );
      await client.query(
        `INSERT INTO courses (course_code, course_name, program_name, faculty_name, semester, session)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (course_code, program_name, session) DO UPDATE
           SET course_name=$2, faculty_name=$4, semester=$5`,
        [code, name, program, faculty, semester, session]
      );
      count++;
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `Imported ${count} courses successfully for session: ${session}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Course upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// Upload Student Enrollment Excel
router.post('/students', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const session = (req.body.session || req.headers['x-session'] || 'July – December 2026').toString().trim();
  const client = await pool.connect();
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    if (!rows.length) return res.status(400).json({ success: false, message: 'Excel file is empty' });

    await client.query('BEGIN');
    let count = 0;
    for (const row of rows) {
      const id       = (row['Scholar ID']   || row['scholar_id'] || row['ScholarID'] || '').toString().trim();
      const name     = (row['Student Name'] || row['student_name'] || row['Name']    || '').toString().trim();
      const program  = (row['Program']      || row['program']    || '').toString().trim();
      const semester = (row['Semester']     || row['semester']   || '').toString().trim();
      if (!id || !name || !program || !semester) continue;

      await client.query(
        `INSERT INTO students (scholar_id, student_name, program_name, semester, session)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (scholar_id, session) DO UPDATE
           SET student_name=$2, program_name=$3, semester=$4`,
        [id, name, program, semester, session]
      );
      count++;
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `Imported ${count} students successfully for session: ${session}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Student upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;

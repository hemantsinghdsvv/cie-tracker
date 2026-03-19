const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const pool = require('../database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /api/schedule/upload — upload schedule Excel
// Expected columns: Program, Semester, Course Name, Exam Name,
// Announcement Date, Submission Date, Conduction Date, Show Marks Date, Faculty Name
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const client = await pool.connect();
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    if (!rows.length) return res.status(400).json({ success: false, message: 'Excel file is empty' });

    await client.query('BEGIN');
    let count = 0;

    for (const row of rows) {
      const program   = (row['Program']           || row['program']           || '').toString().trim();
      const semester  = (row['Semester']           || row['semester']          || '').toString().trim();
      const course    = (row['Course Name']        || row['course_name']       || row['Course'] || '').toString().trim();
      const examName  = (row['Exam Name']          || row['exam_name']         || '').toString().trim();
      const faculty   = (row['Faculty Name']       || row['faculty_name']      || row['Faculty'] || '').toString().trim();
      const annDate   = formatDate(row['Announcement Date'] || row['announcement_date'] || '');
      const subDate   = formatDate(row['Submission Date']   || row['submission_date']   || '');
      const condDate  = formatDate(row['Conduction Date']   || row['conduction_date']   || '');
      const showDate  = formatDate(row['Show Marks Date']   || row['show_marks_date']   || row['Show Marks to Student Date'] || '');

      if (!program || !semester || !course || !examName) continue;

      await client.query(
        `INSERT INTO schedule (program_name, semester, course_name, faculty_name, exam_name, announcement_date, submission_date, conduction_date, show_marks_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [program, semester, course, faculty, examName, annDate, subDate, condDate, showDate]
      );
      count++;
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `Imported ${count} schedule entries.` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

function formatDate(val) {
  if (!val || val.toString().trim() === '' || val.toString().trim().toUpperCase() === 'NA') return 'NA';
  if (val instanceof Date) return val.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  return val.toString().trim();
}

// DELETE /api/schedule/clear — clear all schedule data
router.delete('/clear', async (req, res) => {
  try {
    await pool.query('DELETE FROM schedule');
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/schedule?program=&semester= — fetch schedule grouped by course
router.get('/', async (req, res) => {
  const { program, semester } = req.query;
  if (!program || !semester) return res.status(400).json({ error: 'program and semester required' });
  try {
    const rows = await pool.query(
      `SELECT course_name, faculty_name, exam_name, announcement_date, submission_date, conduction_date, show_marks_date
       FROM schedule
       WHERE program_name = $1 AND semester = $2
       ORDER BY course_name, id`,
      [program, semester]
    );
    // Group by course
    const grouped = {};
    rows.rows.forEach(r => {
      if (!grouped[r.course_name]) grouped[r.course_name] = { faculty_name: r.faculty_name, exams: [] };
      grouped[r.course_name].exams.push({
        exam_name: r.exam_name,
        announcement_date: r.announcement_date,
        submission_date:   r.submission_date,
        conduction_date:   r.conduction_date,
        show_marks_date:   r.show_marks_date
      });
    });
    res.json(grouped);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

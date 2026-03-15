const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const path = require('path');
const db = require('../database');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Upload Course Master Excel
router.post('/courses', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    if (!rows.length) return res.status(400).json({ success: false, message: 'Excel file is empty' });

    let count = 0;
    const stmtProg = db.prepare('INSERT OR IGNORE INTO programs (program_name) VALUES (?)');
    const stmtCourse = db.prepare(`INSERT OR REPLACE INTO courses (course_code, course_name, program_name, faculty_name, semester) VALUES (?,?,?,?,?)`);

    db.serialize(() => {
      db.run('BEGIN');
      for (const row of rows) {
        const program = (row['Program'] || row['program'] || '').toString().trim();
        const code    = (row['Course Coder'] || row['Course Code'] || row['course_code'] || '').toString().trim();
        const name    = (row['Course Name'] || row['course_name'] || '').toString().trim();
        const faculty  = (row['Allocation'] || row['allocation'] || row['Faculty'] || '').toString().trim();
        const semester = (row['Semester'] || row['semester'] || '').toString().trim();
        
        if (!program || !code || !name || !semester) continue;
        stmtProg.run(program);
        stmtCourse.run(code, name, program, faculty, semester);
        count++;
      }
      db.run('COMMIT', (err) => {
        stmtProg.finalize();
        stmtCourse.finalize();
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: `Imported ${count} courses successfully.` });
      });
    });
  } catch (err) {
    console.error('Course upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Upload Student Enrollment Excel
router.post('/students', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    if (!rows.length) return res.status(400).json({ success: false, message: 'Excel file is empty' });

    let count = 0;
    const stmt = db.prepare(`INSERT OR REPLACE INTO students (scholar_id, student_name, program_name, semester) VALUES (?,?,?,?)`);

    db.serialize(() => {
      db.run('BEGIN');
      for (const row of rows) {
        const id       = (row['Scholar ID'] || row['scholar_id'] || row['ScholarID'] || '').toString().trim();
        const name     = (row['Student Name'] || row['student_name'] || row['Name'] || '').toString().trim();
        const program  = (row['Program'] || row['program'] || '').toString().trim();
        const semester = (row['Semester'] || row['semester'] || '').toString().trim();
        if (!id || !name || !program || !semester) continue;
        stmt.run(id, name, program, semester);
        count++;
      }
      db.run('COMMIT', (err) => {
        stmt.finalize();
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: `Imported ${count} students successfully.` });
      });
    });
  } catch (err) {
    console.error('Student upload error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'cie_tracker.db');
const db = new sqlite3.Database(dbPath);

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    program_name TEXT UNIQUE NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS courses (
    course_code TEXT NOT NULL,
    course_name TEXT NOT NULL,
    program_name TEXT NOT NULL,
    faculty_name TEXT,
    semester TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (course_code, program_name)
  )`);

  // Migration: Add semester to courses if it doesn't exist
  db.run(`ALTER TABLE courses ADD COLUMN semester TEXT NOT NULL DEFAULT ''`, function(err) {
    // Ignore error if column already exists
  });

  db.run(`CREATE TABLE IF NOT EXISTS students (
    scholar_id TEXT PRIMARY KEY,
    student_name TEXT NOT NULL,
    program_name TEXT NOT NULL,
    semester TEXT NOT NULL
  )`);
});

module.exports = db;

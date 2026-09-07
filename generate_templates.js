const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const templatesDir = path.join(__dirname, 'public', 'templates');
if (!fs.existsSync(templatesDir)) {
  fs.mkdirSync(templatesDir, { recursive: true });
}

// 1. Courses Template
const coursesData = [
  {
    'S.N.': 1,
    'Program': 'BCA',
    'Semester': '1',
    'Course Code': 'BCA101',
    'Course Name': 'Programming in C',
    'Allocation': 'Dr. Sharma'
  },
  {
    'S.N.': 2,
    'Program': 'BCA',
    'Semester': '1',
    'Course Code': 'BCA102',
    'Course Name': 'Digital Electronics',
    'Allocation': 'Prof. Verma'
  },
  {
    'S.N.': 3,
    'Program': 'MCA-DS',
    'Semester': '2',
    'Course Code': 'MCA201',
    'Course Name': 'Machine Learning',
    'Allocation': 'Dr. Gupta'
  }
];

const wbCourses = XLSX.utils.book_new();
const wsCourses = XLSX.utils.json_to_sheet(coursesData);
wsCourses['!cols'] = [
  { wch: 6 },
  { wch: 15 },
  { wch: 12 },
  { wch: 15 },
  { wch: 30 },
  { wch: 20 }
];
XLSX.utils.book_append_sheet(wbCourses, wsCourses, 'Courses');
XLSX.writeFile(wbCourses, path.join(templatesDir, 'courses_template.xlsx'));

// 2. Students Template
const studentsData = [
  {
    'Scholar ID': '23BCA001',
    'Student Name': 'Aarav Sharma',
    'Program': 'BCA',
    'Semester': '1'
  },
  {
    'Scholar ID': '23BCA002',
    'Student Name': 'Aditi Singh',
    'Program': 'BCA',
    'Semester': '1'
  },
  {
    'Scholar ID': '23MCA001',
    'Student Name': 'Rohan Patel',
    'Program': 'MCA-DS',
    'Semester': '2'
  }
];

const wbStudents = XLSX.utils.book_new();
const wsStudents = XLSX.utils.json_to_sheet(studentsData);
wsStudents['!cols'] = [
  { wch: 15 },
  { wch: 25 },
  { wch: 15 },
  { wch: 12 }
];
XLSX.utils.book_append_sheet(wbStudents, wsStudents, 'Students');
XLSX.writeFile(wbStudents, path.join(templatesDir, 'students_template.xlsx'));

// 3. Schedule Template
const scheduleData = [
  {
    'Program': 'BCA',
    'Semester': '1',
    'Course Name': 'Programming in C',
    'Faculty Name': 'Dr. Sharma',
    'Exam Name': 'CIE 1',
    'Announcement Date': '10-Feb-2026',
    'Submission Date': '18-Feb-2026',
    'Conduction Date': '20-Feb-2026',
    'Show Marks Date': '25-Feb-2026'
  },
  {
    'Program': 'BCA',
    'Semester': '1',
    'Course Name': 'Programming in C',
    'Faculty Name': 'Dr. Sharma',
    'Exam Name': 'Assignment 1',
    'Announcement Date': '12-Feb-2026',
    'Submission Date': '22-Feb-2026',
    'Conduction Date': 'NA',
    'Show Marks Date': '28-Feb-2026'
  },
  {
    'Program': 'MCA-DS',
    'Semester': '2',
    'Course Name': 'Machine Learning',
    'Faculty Name': 'Dr. Gupta',
    'Exam Name': 'Mid Term Exam',
    'Announcement Date': '01-Mar-2026',
    'Submission Date': 'NA',
    'Conduction Date': '15-Mar-2026',
    'Show Marks Date': '22-Mar-2026'
  }
];

const wbSchedule = XLSX.utils.book_new();
const wsSchedule = XLSX.utils.json_to_sheet(scheduleData);
wsSchedule['!cols'] = [
  { wch: 15 },
  { wch: 12 },
  { wch: 25 },
  { wch: 20 },
  { wch: 18 },
  { wch: 20 },
  { wch: 20 },
  { wch: 20 },
  { wch: 20 }
];
XLSX.utils.book_append_sheet(wbSchedule, wsSchedule, 'Schedule');
XLSX.writeFile(wbSchedule, path.join(templatesDir, 'schedule_template.xlsx'));

// Generate CSVs as well
const fsCsv = require('fs');
fsCsv.writeFileSync(path.join(templatesDir, 'courses_template.csv'), XLSX.utils.sheet_to_csv(wsCourses));
fsCsv.writeFileSync(path.join(templatesDir, 'students_template.csv'), XLSX.utils.sheet_to_csv(wsStudents));
fsCsv.writeFileSync(path.join(templatesDir, 'schedule_template.csv'), XLSX.utils.sheet_to_csv(wsSchedule));

console.log('✅ Generated templates successfully in public/templates');

const express = require('express');
const router = express.Router();

// username → { password, role }
// role: 'admin' = full access | 'user' = no upload/data management
const USERS = {
  // ─── ADMIN ───────────────────────────────────────────────
  'computer.science': { password: 'computer.science', role: 'admin' },

  // ─── FACULTY ─────────────────────────────────────────────
  'hemant.singh': { password: 'hemant.singh', role: 'user' },
  'soni.sharma': { password: 'soni.sharma', role: 'user' },
  'swapnil.gaidhani': { password: 'swapnil.gaidhani', role: 'user' },
  'abhay.saxena': { password: 'abhay.saxena', role: 'user' },
  'gopal.sharma': { password: 'gopal.sharma', role: 'user' },
  'eishita.gupta': { password: 'eishita.gupta', role: 'user' },
  'anuradha.sharma': { password: 'anuradha.sharma', role: 'user' },
  'geetanjali.gaidhani': { password: 'geetanjali.gaidhani', role: 'user' },
  'prashant.soni': { password: 'prashant.soni', role: 'user' },
  'azad.singh': { password: 'azad.singh', role: 'user' },
  'shashtri.nimmagadda': { password: 'shashtri.nimmagadda', role: 'user' },
  // Add more faculty below in the same format:
  // 'firstname.lastname': { password: 'firstname.lastname', role: 'user' },
};

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = USERS[username];
  if (user && user.password === password) {
    res.json({ success: true, username, role: user.role });
  } else {
    res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
});

module.exports = router;

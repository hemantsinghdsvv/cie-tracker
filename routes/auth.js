const express = require('express');
const router = express.Router();

const CREDENTIALS = {
  'computer.science': 'computer.science'
};

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (CREDENTIALS[username] && CREDENTIALS[username] === password) {
    res.json({ success: true, username });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, user) => {
      if (!user) return res.status(401).json({ error: "Invalid login" });

      req.session.user = user;
      res.json({ success: true, role: user.role });
    }
  );
});

module.exports = router;
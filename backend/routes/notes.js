const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.all('SELECT * FROM notes ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { title, body, created_by } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Note is required' });
  db.run(
    'INSERT INTO notes (title, body, created_by) VALUES (?, ?, ?)',
    [title || 'Note', body.trim(), created_by || 'Admin'],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to save note' });
      res.json({ success: true, id: this.lastID });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM notes WHERE id = ?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: 'Delete failed' });
    res.json({ success: true });
  });
});

module.exports = router;

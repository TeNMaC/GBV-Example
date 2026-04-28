const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  db.all('SELECT * FROM appointments ORDER BY date_time ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { customer_id, name, phone, email, date_time, notes } = req.body;
  if (!date_time) return res.status(400).json({ error: 'Date and time are required' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  db.run(
    `INSERT INTO appointments (customer_id, name, phone, email, date_time, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [customer_id || null, name.trim(), phone || '', email || '', date_time, notes || ''],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to save appointment' });
      res.json({ success: true, id: this.lastID });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM appointments WHERE id = ?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: 'Delete failed' });
    res.json({ success: true });
  });
});

module.exports = router;

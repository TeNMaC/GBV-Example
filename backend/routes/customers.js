const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const search = req.query.search || '';
  db.all(
    `SELECT * FROM customers
     WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? OR vault_number LIKE ?
     ORDER BY id DESC`,
    [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(rows);
    }
  );
});

router.post('/', (req, res) => {
  const { name, email, phone, vault_number, notes } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  db.run(
    'INSERT INTO customers (name, email, phone, vault_number, notes) VALUES (?, ?, ?, ?, ?)',
    [name.trim(), email || '', phone || '', vault_number || '', notes || ''],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to add customer' });
      res.json({ success: true, id: this.lastID });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM customers WHERE id = ?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: 'Delete failed' });
    res.json({ success: true });
  });
});

module.exports = router;

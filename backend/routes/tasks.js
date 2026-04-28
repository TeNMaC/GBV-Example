const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', (req, res) => {
  const status = req.query.status;
  const sql = status ? 'SELECT * FROM tasks WHERE status = ? ORDER BY id DESC' : 'SELECT * FROM tasks ORDER BY id DESC';
  const params = status ? [status] : [];
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { title, description, assigned_to, created_by } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Task title is required' });

  db.run(
    `INSERT INTO tasks (title, description, assigned_to, created_by, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [title.trim(), description || '', assigned_to || 'Unassigned', created_by || 'Admin'],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to create task' });
      res.json({ success: true, id: this.lastID });
    }
  );
});

router.put('/:id/complete', (req, res) => {
  db.run(
    `UPDATE tasks SET status = 'done', completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to complete task' });
      res.json({ success: true });
    }
  );
});

router.put('/:id/reopen', (req, res) => {
  db.run(
    `UPDATE tasks SET status = 'pending', completed_at = NULL WHERE id = ?`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to reopen task' });
      res.json({ success: true });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM tasks WHERE id = ?', [req.params.id], err => {
    if (err) return res.status(500).json({ error: 'Failed to delete task' });
    res.json({ success: true });
  });
});

module.exports = router;

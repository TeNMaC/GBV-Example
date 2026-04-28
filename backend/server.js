const http = require('http');
const fs = require('fs');
const pathMod = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const FRONTEND_DIR = pathMod.join(__dirname, '..', 'frontend');
const sessions = new Map();
const loginAttempts = new Map();
const SESSION_MS = Number(process.env.SESSION_HOURS || 8) * 60 * 60 * 1000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password || ''), salt, 120000, 64, 'sha512').toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}
function verifyPassword(input, stored) {
  if (!stored) return false;
  if (stored.startsWith('pbkdf2:')) {
    const [, salt, hash] = stored.split(':');
    const test = crypto.pbkdf2Sync(String(input || ''), salt, 120000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(test));
  }
  const legacySha = 'sha256:' + crypto.createHash('sha256').update(String(input || '')).digest('hex');
  return stored === input || stored === legacySha;
}
function makeToken() { return crypto.randomBytes(40).toString('hex'); }
function safeUser(u) { return { id:u.id, username:u.username, name:u.name || u.username, role:u.role || 'staff' }; }

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  res.end(JSON.stringify(data));
}
function sendFile(res, filepath) {
  const ext = pathMod.extname(filepath).toLowerCase();
  const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
  fs.readFile(filepath, (err, data) => {
    if (err) return send(res, 404, { error: 'File not found' });
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}
function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
  });
}
function all(sql, params = []) { return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))); }
function get(sql, params = []) { return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))); }
function run(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); })); }

function getAuthUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expires) { sessions.delete(token); return null; }
  session.expires = Date.now() + SESSION_MS;
  return session.user;
}
function requireAuth(req, res) {
  const user = getAuthUser(req);
  if (!user) send(res, 401, { error: 'Please login first' });
  return user;
}
function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') { send(res, 403, { error: 'Admin access required' }); return null; }
  return user;
}
function tooManyLoginAttempts(username) {
  const key = String(username || '').toLowerCase();
  const item = loginAttempts.get(key) || { count:0, until:0 };
  if (item.until && Date.now() < item.until) return true;
  if (item.until && Date.now() >= item.until) loginAttempts.delete(key);
  return false;
}
function markLoginFailure(username) {
  const key = String(username || '').toLowerCase();
  const item = loginAttempts.get(key) || { count:0, until:0 };
  item.count += 1;
  if (item.count >= 6) item.until = Date.now() + 10 * 60 * 1000;
  loginAttempts.set(key, item);
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 200, { ok: true });
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const parts = pathname.split('/').filter(Boolean);

  try {
    if (pathname === '/health') return send(res, 200, { ok: true, app: 'GBV Dashboard' });

    if (pathname === '/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      if (tooManyLoginAttempts(body.username)) return send(res, 429, { error: 'Too many login attempts. Try again in 10 minutes.' });
      const user = await get('SELECT id, username, password, name, role, active FROM users WHERE username = ?', [body.username]);
      if (!user || Number(user.active) !== 1 || !verifyPassword(body.password, user.password)) {
        markLoginFailure(body.username);
        return send(res, 401, { error: 'Invalid login' });
      }
      if (!String(user.password || '').startsWith('pbkdf2:')) await run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(body.password), user.id]);
      await run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
      const clean = safeUser(user);
      const token = makeToken();
      sessions.set(token, { user: clean, expires: Date.now() + SESSION_MS });
      loginAttempts.delete(String(body.username || '').toLowerCase());
      return send(res, 200, { success: true, token, user: clean });
    }
    if (pathname === '/auth/me' && req.method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      return send(res, 200, { user });
    }
    if (pathname === '/auth/logout' && req.method === 'POST') {
      const auth = req.headers.authorization || ''; const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (token) sessions.delete(token);
      return send(res, 200, { success: true });
    }
    if (pathname === '/auth/profile' && req.method === 'PUT') {
      const user = requireAuth(req, res); if (!user) return;
      const b = await readBody(req);
      if (!b.name || !b.username) return send(res, 400, { error: 'Name and username are required' });
      await run('UPDATE users SET name = ?, username = ? WHERE id = ?', [b.name.trim(), b.username.trim(), user.id]);
      const updated = await get('SELECT id, username, name, role FROM users WHERE id = ?', [user.id]);
      const cleanUpdated = safeUser(updated);
      for (const session of sessions.values()) { if (session.user.id === user.id) session.user = cleanUpdated; }
      return send(res, 200, { success: true, user: cleanUpdated });
    }
    if (pathname === '/auth/change-password' && req.method === 'PUT') {
      const user = requireAuth(req, res); if (!user) return;
      const b = await readBody(req);
      const row = await get('SELECT password FROM users WHERE id = ?', [user.id]);
      if (!verifyPassword(b.current_password, row.password)) return send(res, 400, { error: 'Current password is incorrect' });
      if (!b.new_password || String(b.new_password).length < 8) return send(res, 400, { error: 'New password must be at least 8 characters' });
      await run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(b.new_password), user.id]);
      return send(res, 200, { success: true });
    }

    const apiRoots = new Set(['auth', 'users', 'staff', 'customers', 'appointments', 'tasks', 'notes', 'boxes', 'settings', 'health']);
    if (req.method === 'GET' && (!parts[0] || !apiRoots.has(parts[0]))) {
      const cleanPath = pathname === '/' ? '/index.html' : pathname;
      const filepath = pathMod.normalize(pathMod.join(FRONTEND_DIR, cleanPath));
      if (filepath.startsWith(FRONTEND_DIR)) return sendFile(res, filepath);
    }

    if (parts[0] === 'staff' && req.method === 'GET') {
      const user = requireAuth(req, res); if (!user) return;
      const rows = await all('SELECT id, username, name, role FROM users WHERE active = 1 ORDER BY name, username');
      return send(res, 200, rows.map(safeUser));
    }

    if (parts[0] === 'users') {
      const admin = requireAdmin(req, res); if (!admin) return;
      if (req.method === 'GET') {
        const rows = await all('SELECT id, username, name, role, active, created_at, last_login FROM users ORDER BY active DESC, name, username');
        return send(res, 200, rows);
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (!b.username || !b.password) return send(res, 400, { error: 'Username and password are required' });
        if (String(b.password).length < 8) return send(res, 400, { error: 'Password must be at least 8 characters' });
        const r = await run('INSERT INTO users (username, password, name, role, active) VALUES (?, ?, ?, ?, ?)', [b.username.trim(), hashPassword(b.password), b.name || b.username.trim(), b.role || 'staff', b.active === 0 ? 0 : 1]);
        return send(res, 200, { success: true, id: r.lastID });
      }
      if (req.method === 'PUT' && parts[1]) {
        const b = await readBody(req);
        await run('UPDATE users SET name = ?, username = ?, role = ?, active = ? WHERE id = ?', [b.name || '', b.username || '', b.role || 'staff', b.active === 0 ? 0 : 1, parts[1]]);
        if (b.password) await run('UPDATE users SET password = ? WHERE id = ?', [hashPassword(b.password), parts[1]]);
        return send(res, 200, { success: true });
      }
    }

    const user = requireAuth(req, res); if (!user) return;

    if (parts[0] === 'settings') {
      if (req.method === 'GET') {
        const rows = await all('SELECT key, value FROM app_settings ORDER BY key');
        return send(res, 200, Object.fromEntries(rows.map(r => [r.key, r.value])));
      }
      if (req.method === 'PUT') {
        const admin = requireAdmin(req, res); if (!admin) return;
        const b = await readBody(req);
        for (const [k,v] of Object.entries(b)) await run('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v ?? '')]);
        return send(res, 200, { success: true });
      }
    }

    if (parts[0] === 'customers') {
      if (req.method === 'GET') {
        const s = url.searchParams.get('search') || '';
        const rows = await all(`SELECT * FROM customers WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? OR vault_number LIKE ? OR status LIKE ? ORDER BY name ASC`, [`%${s}%`, `%${s}%`, `%${s}%`, `%${s}%`, `%${s}%`]);
        return send(res, 200, rows);
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (!b.name || !b.name.trim()) return send(res, 400, { error: 'Name is required' });
        const r = await run('INSERT INTO customers (name, email, phone, vault_number, notes, address, emergency_contact, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [b.name.trim(), b.email || '', b.phone || '', b.vault_number || '', b.notes || '', b.address || '', b.emergency_contact || '', b.status || 'Active']);
        return send(res, 200, { success: true, id: r.lastID });
      }
      if (req.method === 'PUT' && parts[1]) {
        const b = await readBody(req);
        await run('UPDATE customers SET name=?, email=?, phone=?, vault_number=?, notes=?, address=?, emergency_contact=?, status=? WHERE id=?', [b.name || '', b.email || '', b.phone || '', b.vault_number || '', b.notes || '', b.address || '', b.emergency_contact || '', b.status || 'Active', parts[1]]);
        return send(res, 200, { success: true });
      }
      if (req.method === 'DELETE' && parts[1]) {
        await run('DELETE FROM customers WHERE id = ?', [parts[1]]);
        return send(res, 200, { success: true });
      }
    }

    if (parts[0] === 'boxes') {
      if (req.method === 'GET') {
        const s = url.searchParams.get('search') || '';
        const rows = await all(`SELECT * FROM boxes WHERE box_number LIKE ? OR size LIKE ? OR availability LIKE ? OR customer_name LIKE ? ORDER BY size, box_number`, [`%${s}%`, `%${s}%`, `%${s}%`, `%${s}%`]);
        return send(res, 200, rows);
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (!b.box_number || !b.size) return send(res, 400, { error: 'Box number and size are required' });
        const r = await run('INSERT INTO boxes (box_number, size, availability, customer_name, notes, updated_by) VALUES (?, ?, ?, ?, ?, ?)', [String(b.box_number).trim(), b.size, b.availability || 'Available', b.customer_name || '', b.notes || '', user.name]);
        return send(res, 200, { success: true, id: r.lastID });
      }
      if (req.method === 'PUT' && parts[1]) {
        const b = await readBody(req);
        await run('UPDATE boxes SET box_number=?, size=?, availability=?, customer_name=?, notes=?, updated_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?', [b.box_number || '', b.size || 'Small A', b.availability || 'Available', b.customer_name || '', b.notes || '', user.name, parts[1]]);
        return send(res, 200, { success: true });
      }
      if (req.method === 'DELETE' && parts[1]) {
        await run('DELETE FROM boxes WHERE id=?', [parts[1]]);
        return send(res, 200, { success: true });
      }
    }

    if (parts[0] === 'appointments') {
      if (req.method === 'GET') {
        const rows = await all('SELECT * FROM appointments ORDER BY date_time ASC');
        return send(res, 200, rows);
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (!b.date_time) return send(res, 400, { error: 'Date and time are required' });
        if (!b.name || !b.name.trim()) return send(res, 400, { error: 'Name is required' });
        const r = await run(`INSERT INTO appointments (customer_id, name, phone, email, box_number, date_time, purpose, status, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [b.customer_id || null, b.name.trim(), b.phone || '', b.email || '', b.box_number || '', b.date_time, b.purpose || 'Visit', b.status || 'Booked', b.notes || '', user.name]);
        return send(res, 200, { success: true, id: r.lastID });
      }
      if (req.method === 'PUT' && parts[1] && parts[2] === 'status') {
        const b = await readBody(req);
        const status = b.status || 'Booked';
        const extra = status === 'Arrived' ? ', arrived_at = CURRENT_TIMESTAMP' : status === 'Completed' ? ', completed_at = CURRENT_TIMESTAMP' : '';
        await run(`UPDATE appointments SET status = ? ${extra} WHERE id = ?`, [status, parts[1]]);
        return send(res, 200, { success: true });
      }
      if (req.method === 'DELETE' && parts[1]) {
        await run('DELETE FROM appointments WHERE id = ?', [parts[1]]);
        return send(res, 200, { success: true });
      }
    }

    if (parts[0] === 'tasks') {
      if (req.method === 'GET') {
        const rows = await all('SELECT * FROM tasks ORDER BY CASE status WHEN "Completed" THEN 2 ELSE 1 END, due_date IS NULL, due_date ASC, id DESC');
        return send(res, 200, rows);
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (!b.title || !b.title.trim()) return send(res, 400, { error: 'Task title is required' });
        const r = await run(`INSERT INTO tasks (title, description, assigned_to, created_by, priority, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)`, [b.title.trim(), b.description || '', b.assigned_to || 'Unassigned', user.name || b.created_by || 'Admin', b.priority || 'Medium', b.due_date || '', b.status || 'Pending']);
        return send(res, 200, { success: true, id: r.lastID });
      }
      if (req.method === 'PUT' && parts[1] && parts[2] === 'status') {
        const b = await readBody(req);
        const status = b.status || 'Pending';
        if (status === 'Completed') await run(`UPDATE tasks SET status = ?, completed_by = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`, [status, user.name, parts[1]]);
        else await run(`UPDATE tasks SET status = ?, completed_by = NULL, completed_at = NULL WHERE id = ?`, [status, parts[1]]);
        return send(res, 200, { success: true });
      }
      if (req.method === 'DELETE' && parts[1]) {
        await run('DELETE FROM tasks WHERE id = ?', [parts[1]]);
        return send(res, 200, { success: true });
      }
    }

    if (parts[0] === 'notes') {
      if (req.method === 'GET') {
        const rows = await all('SELECT * FROM notes ORDER BY id DESC');
        return send(res, 200, rows);
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        if (!b.body || !b.body.trim()) return send(res, 400, { error: 'Note is required' });
        const r = await run('INSERT INTO notes (title, body, created_by) VALUES (?, ?, ?)', [b.title || 'Daily Note', b.body.trim(), user.name]);
        return send(res, 200, { success: true, id: r.lastID });
      }
      if (req.method === 'DELETE' && parts[1]) {
        await run('DELETE FROM notes WHERE id = ?', [parts[1]]);
        return send(res, 200, { success: true });
      }
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    if (String(err.message).includes('UNIQUE')) return send(res, 409, { error: 'That record already exists' });
    send(res, 500, { error: err.message || 'Server error' });
  }
}

if (!global.__GBV_SERVER_STARTED__) {
  http.createServer(handler).listen(PORT, HOST, () => console.log(`GBV Dashboard running on http://${HOST}:${PORT}`));
  global.__GBV_SERVER_STARTED__ = true;
}

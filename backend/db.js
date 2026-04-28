const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

function addColumn(table, column, definition) {
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, err => {
    if (err && !String(err.message).includes('duplicate column name')) {
      console.error(`Migration error on ${table}.${column}:`, err.message);
    }
  });
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    vault_number TEXT,
    notes TEXT,
    address TEXT,
    emergency_contact TEXT,
    status TEXT DEFAULT 'Active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  addColumn('customers', 'phone', 'TEXT');
  addColumn('customers', 'notes', 'TEXT');
  addColumn('customers', 'address', 'TEXT');
  addColumn('customers', 'emergency_contact', 'TEXT');
  addColumn('customers', 'status', "TEXT DEFAULT 'Active'");
  addColumn('customers', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    name TEXT,
    role TEXT DEFAULT 'staff',
    active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    last_login TEXT
  )`);
  addColumn('users', 'name', 'TEXT');
  addColumn('users', 'active', 'INTEGER DEFAULT 1');
  addColumn('users', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
  addColumn('users', 'last_login', 'TEXT');

  db.run(`CREATE TABLE IF NOT EXISTS boxes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    box_number TEXT UNIQUE NOT NULL,
    size TEXT NOT NULL,
    availability TEXT DEFAULT 'Available',
    customer_name TEXT,
    notes TEXT,
    updated_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  addColumn('boxes', 'availability', "TEXT DEFAULT 'Available'");
  addColumn('boxes', 'customer_name', 'TEXT');
  addColumn('boxes', 'notes', 'TEXT');
  addColumn('boxes', 'updated_by', 'TEXT');
  addColumn('boxes', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
  addColumn('boxes', 'updated_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to TEXT,
    created_by TEXT,
    priority TEXT DEFAULT 'Medium',
    due_date TEXT,
    status TEXT DEFAULT 'Pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    completed_by TEXT,
    completed_at TEXT
  )`);
  addColumn('tasks', 'description', 'TEXT');
  addColumn('tasks', 'assigned_to', 'TEXT');
  addColumn('tasks', 'created_by', 'TEXT');
  addColumn('tasks', 'priority', "TEXT DEFAULT 'Medium'");
  addColumn('tasks', 'due_date', 'TEXT');
  addColumn('tasks', 'status', "TEXT DEFAULT 'Pending'");
  addColumn('tasks', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');
  addColumn('tasks', 'completed_by', 'TEXT');
  addColumn('tasks', 'completed_at', 'TEXT');

  db.run(`CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    box_number TEXT,
    date_time TEXT NOT NULL,
    purpose TEXT,
    status TEXT DEFAULT 'Booked',
    notes TEXT,
    arrived_at TEXT,
    completed_at TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  addColumn('appointments', 'purpose', 'TEXT');
  addColumn('appointments', 'status', "TEXT DEFAULT 'Booked'");
  addColumn('appointments', 'box_number', 'TEXT');
  addColumn('appointments', 'arrived_at', 'TEXT');
  addColumn('appointments', 'completed_at', 'TEXT');
  addColumn('appointments', 'created_by', 'TEXT');
  addColumn('appointments', 'created_at', 'TEXT DEFAULT CURRENT_TIMESTAMP');

  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  db.run(`INSERT OR IGNORE INTO users (id, username, password, name, role, active)
          VALUES (1, 'admin', 'admin123', 'Admin', 'admin', 1)`);

  db.run(`INSERT OR IGNORE INTO app_settings (key, value) VALUES
    ('company_name', 'Global Bullion Vault'),
    ('branch_name', 'Ashford Centre'),
    ('support_email', 'info@globalbullionvault.co.uk'),
    ('support_phone', '01233-340623'),
    ('session_timeout_minutes', '480'),
    ('remote_access_note', 'Use HTTPS and individual staff accounts when hosted remotely.')`);

  const seedBoxes = [
    ['SMA-0001','Small A','Available'], ['SMA-0002','Small A','In Use'], ['SMB-0001','Small B','Available'],
    ['MED-0001','Medium A','In Use'], ['MED-0002','Medium B','Available'], ['LGA-0001','Large A','In Use'], ['LGB-0001','Large B','Available']
  ];
  const stmt = db.prepare(`INSERT OR IGNORE INTO boxes (box_number, size, availability) VALUES (?, ?, ?)`);
  seedBoxes.forEach(row => stmt.run(row));
  stmt.finalize();

  db.run(`UPDATE tasks SET status = 'Completed' WHERE LOWER(status) IN ('done','complete','completed')`);
  db.run(`UPDATE tasks SET status = 'Pending' WHERE status IS NULL OR LOWER(status) = 'pending'`);
  db.run(`UPDATE appointments SET status = 'Booked' WHERE status IS NULL OR status = ''`);
});

module.exports = db;

const { app, BrowserWindow, Notification } = require('electron');
const path = require('path');

// Start the local backend automatically when the desktop app opens.
require('./backend/server');

let shownReminders = new Set();

function createWindow() {
  const win = new BrowserWindow({
    width: 1250,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  win.loadFile(path.join(__dirname, 'frontend', 'index.html'));

  win.on('ready-to-show', () => win.show());
}

app.whenReady().then(() => {
  createWindow();
  startReminderSystem();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function startReminderSystem() {
  setInterval(async () => {
    try {
      const res = await fetch('http://localhost:3000/appointments');
      const data = await res.json();
      const now = new Date();

      data.forEach(a => {
        const apptTime = new Date(a.date_time);
        const diffHours = (apptTime - now) / (1000 * 60 * 60);

        if (diffHours > 0 && diffHours <= 24 && !shownReminders.has(a.id)) {
          shownReminders.add(a.id);
          new Notification({
            title: 'Appointment Reminder',
            body: `${a.name || 'Appointment'} - ${apptTime.toLocaleString()}`
          }).show();
        }
      });
    } catch (err) {
      console.log('Reminder system waiting for backend:', err.message);
    }
  }, 60000);
}

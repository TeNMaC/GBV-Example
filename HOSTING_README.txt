GBV Dashboard v3 - Remote Multi-User Office Version

Run locally as desktop app:
1. npm install
2. npm start

Run as hosted web app:
1. Upload this whole folder to a Node.js hosting platform.
2. Run: npm install
3. Start command: npm run web
4. Make sure HTTPS/SSL is switched on in the hosting control panel.
5. Open the platform domain/subdomain in a browser.

Default first login:
Username: admin
Password: admin123

IMPORTANT BEFORE REMOTE USE:
- Go to Settings and change the admin password immediately.
- Create one separate user account for each staff member. Do not share the admin account.
- Keep Users (Admin) restricted to admin only.
- Use HTTPS/SSL because the system handles staff logins and customer data.
- Keep regular database backups.
- SQLite is included for simple hosting and light team use. For heavier long-term use, move to PostgreSQL or MySQL.

New in this version:
- More professional Customers and Appointments UI.
- Manual Boxes module: add box number, size, holder and availability.
- Box availability can be changed between Available, In Use, Reserved and Unavailable.
- Settings module: change own username, change password, business settings, remote hosting checklist.
- Admin-only user management is hidden from staff and protected in the backend.
- Staff list endpoint allows task assignment without exposing user management to non-admin users.
- Passwords are now stored with PBKDF2 hashing instead of plain text/legacy SHA.
- Login rate limiting added for repeated failed attempts.
- Session expiry added for hosted use.

Recommended next upgrades for production:
- PostgreSQL database.
- Automated daily backups.
- Domain and SSL certificate.
- Private staff-only access rule or VPN if your hosting provider supports it.
- Audit log for edits/deletes.

# SkillConnect

Complete community workshop registration and administration application built with HTML, CSS, JavaScript, PHP and MySQL.

## Features

- Public workshop listing, search and category filters
- Participant registration with duplicate and capacity protection
- Session-based administrator authentication
- Workshop CRUD and participant roster
- Attendance management and duplicate-safe attendance records
- QR attendance backed by server-side token and registration validation
- Certificate issuance and printable/PDF certificate view
- Star rating feedback
- Registration and attendance dashboard metrics
- CSV report export compatible with Excel
- Responsive green and white interface

## Run locally with npm

The host environment can run the complete demo through Node and SQLite:

```bash
cd /path/to/club
npm install
npm start
```

Open `http://localhost:8080`.

The npm runtime creates `database/skillconnect.sqlite` automatically and seeds four workshops. Stop it with `Ctrl+C`.

## Run locally with XAMPP

1. Install XAMPP and start Apache and MySQL.
2. Copy this project folder into `htdocs`, for example:
   `/Applications/XAMPP/xamppfiles/htdocs/club`.
3. Open phpMyAdmin at `http://localhost/phpmyadmin`.
4. Import `database/skillconnect.sql`.
5. Open `http://localhost/club/`.

## Database credentials

The default PDO settings are:

- Host: `127.0.0.1`
- Database: `skillconnect`
- User: `root`
- Password: empty

For another environment, set `DB_HOST`, `DB_NAME`, `DB_USER` and `DB_PASS` variables before starting Apache, or update `includes/config.php`.

## First admin login

The application automatically creates the first administrator in the database:

- Email: `admin@skillconnect.org`
- Password: `admin123`

Change this password after the demonstration. Passwords are stored using PHP `password_hash()` and verified with `password_verify()`.

## Main URLs

- Home: `index.php`
- Workshops: `index.php?page=workshops`
- Registration: `index.php?page=register`
- Admin: `index.php?page=admin`
- Attendance: `index.php?page=attendance`
- Feedback: `index.php?page=feedback`
- Reports: `index.php?page=reports`

## QR attendance

Open the Attendance page as an administrator and select a workshop session. The generated QR encodes a server-validated 64-character token. A participant enters the email used during registration. The server verifies the participant's workshop registration and uses an attendance unique key to prevent duplicate records.

## Certificates

Open Dashboard → Issue certificates. Certificate eligibility requires at least one recorded “present” attendance for the selected participant and workshop. The certificate code can be opened in `index.php?page=certificate&code=CODE`. Use the browser print dialog and “Save as PDF” for PDF download.

## Security

This project uses PDO prepared statements, CSRF tokens, output escaping, password hashing, session authentication, server-side form validation, capacity locking/transactions, and duplicate constraints. Run it over HTTPS in production and keep XAMPP and PHP updated.

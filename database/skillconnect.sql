CREATE DATABASE IF NOT EXISTS skillconnect CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE skillconnect;

CREATE TABLE IF NOT EXISTS admins (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS participants (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 full_name VARCHAR(120) NOT NULL,
 age TINYINT UNSIGNED NOT NULL,
 gender ENUM('Female','Male','Other','Prefer not to say') NOT NULL,
 phone VARCHAR(30) NOT NULL,
 email VARCHAR(190) NOT NULL,
 address VARCHAR(255) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_participant_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workshops (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(150) NOT NULL,
 category VARCHAR(80) NOT NULL,
 description TEXT NOT NULL,
 duration VARCHAR(80) NOT NULL,
 workshop_date DATE NOT NULL,
 start_time TIME NOT NULL,
 capacity INT UNSIGNED NOT NULL,
 location VARCHAR(150) NOT NULL,
 image VARCHAR(255) DEFAULT NULL,
 status ENUM('open','full','cancelled','completed') DEFAULT 'open',
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS workshop_sessions (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 workshop_id INT UNSIGNED NOT NULL,
 session_date DATE NOT NULL,
 start_time TIME NOT NULL,
 qr_token CHAR(64) NOT NULL UNIQUE,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_workshop_session (workshop_id,session_date),
 FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registrations (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 participant_id INT UNSIGNED NOT NULL,
 workshop_id INT UNSIGNED NOT NULL,
 registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_registration (participant_id,workshop_id),
 FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
 FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attendance (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 registration_id INT UNSIGNED NOT NULL,
 session_id INT UNSIGNED NOT NULL,
 status ENUM('present','absent') NOT NULL,
 marked_by INT UNSIGNED NULL,
 marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_attendance (registration_id,session_id),
 FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE,
 FOREIGN KEY (session_id) REFERENCES workshop_sessions(id) ON DELETE CASCADE,
 FOREIGN KEY (marked_by) REFERENCES admins(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS certificates (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 participant_id INT UNSIGNED NOT NULL,
 workshop_id INT UNSIGNED NOT NULL,
 certificate_code VARCHAR(80) NOT NULL UNIQUE,
 issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_certificate (participant_id,workshop_id),
 FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
 FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS feedback (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 participant_id INT UNSIGNED NOT NULL,
 workshop_id INT UNSIGNED NOT NULL,
 rating TINYINT UNSIGNED NOT NULL,
 comments TEXT,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_feedback (participant_id,workshop_id),
 FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE,
 FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE,
 CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

INSERT INTO workshops (name,category,description,duration,workshop_date,start_time,capacity,location,status) VALUES
('Tailoring & Garment Making','Vocational & Trade','Learn measuring, pattern cutting and basic machine sewing.','6 Weeks','2026-12-12','09:00:00',20,'Metro Makers Lab','open'),
('Computer Basics & Digital Skills','Digital Literacy','Build confidence with computers, email, spreadsheets and online safety.','4 Weeks','2026-12-15','10:00:00',24,'City Library Tech Wing','open'),
('First Aid Training','Healthcare & Safety','Practice essential emergency response, CPR and injury care skills.','2 Days','2026-12-18','09:30:00',18,'Community Health Centre','open'),
('Communication Skills','Soft Skills','Improve public speaking, listening and workplace communication.','3 Weeks','2026-12-20','14:00:00',30,'Civic Learning Hall','open');

INSERT IGNORE INTO workshop_sessions (workshop_id,session_date,start_time,qr_token)
SELECT id,workshop_date,start_time,SHA2(CONCAT(id, '-', workshop_date, '-', RAND()),256) FROM workshops;

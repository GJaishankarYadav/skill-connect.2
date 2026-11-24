-- SkillConnect PostgreSQL Schema & Starter Data for Supabase
-- Run this script in Supabase Dashboard -> SQL Editor -> New Query.
-- It is idempotent and safe to re-run without overwriting existing data.

BEGIN;

CREATE TABLE IF NOT EXISTS "public"."users" (
  "id" serial PRIMARY KEY NOT NULL,
  "uid" text NOT NULL,
  "email" text NOT NULL,
  "role" text DEFAULT 'participant' NOT NULL,
  "full_name" text,
  "age" integer,
  "gender" text,
  "phone" text,
  "address" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "users_uid_unique" UNIQUE("uid")
);

CREATE TABLE IF NOT EXISTS "public"."admin_allowlist" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "invited_by_email" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admin_allowlist_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "public"."admin_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_uid" text NOT NULL,
  "email" text NOT NULL,
  "full_name" text,
  "reason" text DEFAULT '' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "reviewed_by_email" text,
  "reviewed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "admin_requests_email_unique" UNIQUE("email")
);

CREATE TABLE IF NOT EXISTS "public"."workshops" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "duration" text NOT NULL,
  "workshop_date" text NOT NULL,
  "start_time" text NOT NULL,
  "capacity" integer NOT NULL,
  "location" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "workshop_id" integer NOT NULL,
  "session_date" text NOT NULL,
  "start_time" text NOT NULL,
  "qr_token" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sessions_qr_token_unique" UNIQUE("qr_token")
);

CREATE TABLE IF NOT EXISTS "public"."registrations" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_uid" text NOT NULL,
  "workshop_id" integer NOT NULL,
  "status" text DEFAULT 'confirmed' NOT NULL,
  "checkin_token" text,
  "registered_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "registrations_checkin_token_unique" UNIQUE("checkin_token")
);

CREATE TABLE IF NOT EXISTS "public"."waitlist" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_uid" text NOT NULL,
  "workshop_id" integer NOT NULL,
  "full_name" text NOT NULL,
  "age" integer NOT NULL,
  "gender" text NOT NULL,
  "phone" text NOT NULL,
  "email" text NOT NULL,
  "address" text NOT NULL,
  "status" text DEFAULT 'waiting' NOT NULL,
  "notified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_uid" text NOT NULL,
  "workshop_id" integer,
  "type" text DEFAULT 'waitlist_seat' NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "is_read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."attendance" (
  "id" serial PRIMARY KEY NOT NULL,
  "registration_id" integer NOT NULL,
  "session_id" integer NOT NULL,
  "status" text NOT NULL,
  "marked_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."feedback" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_uid" text NOT NULL,
  "workshop_id" integer NOT NULL,
  "rating" integer NOT NULL,
  "comments" text DEFAULT '' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."certificates" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_uid" text NOT NULL,
  "workshop_id" integer NOT NULL,
  "certificate_code" text NOT NULL,
  "issued_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "certificates_certificate_code_unique" UNIQUE("certificate_code")
);

CREATE TABLE IF NOT EXISTS "public"."courses" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "icon_key" text DEFAULT 'book' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "courses_slug_unique" UNIQUE("slug")
);

CREATE TABLE IF NOT EXISTS "public"."institutions" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "logo_url" text DEFAULT '' NOT NULL,
  "image_url" text DEFAULT '' NOT NULL,
  "phone" text DEFAULT '' NOT NULL,
  "website" text DEFAULT '' NOT NULL,
  "training_mode" text DEFAULT 'Offline' NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "is_verified" boolean DEFAULT false NOT NULL,
  "place_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."institution_locations" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL,
  "address" text NOT NULL,
  "city" text NOT NULL,
  "area" text DEFAULT '' NOT NULL,
  "latitude" double precision,
  "longitude" double precision,
  "google_maps_url" text DEFAULT '' NOT NULL,
  "is_primary" boolean DEFAULT true NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."institution_courses" (
  "id" serial PRIMARY KEY NOT NULL,
  "institution_id" integer NOT NULL,
  "course_id" integer NOT NULL,
  "duration" text DEFAULT '' NOT NULL,
  "training_mode" text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_requests_user_uid_users_uid_fk') THEN
    ALTER TABLE "public"."admin_requests"
      ADD CONSTRAINT "admin_requests_user_uid_users_uid_fk"
      FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_registration_id_registrations_id_fk') THEN
    ALTER TABLE "public"."attendance"
      ADD CONSTRAINT "attendance_registration_id_registrations_id_fk"
      FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_session_id_sessions_id_fk') THEN
    ALTER TABLE "public"."attendance"
      ADD CONSTRAINT "attendance_session_id_sessions_id_fk"
      FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certificates_user_uid_users_uid_fk') THEN
    ALTER TABLE "public"."certificates"
      ADD CONSTRAINT "certificates_user_uid_users_uid_fk"
      FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certificates_workshop_id_workshops_id_fk') THEN
    ALTER TABLE "public"."certificates"
      ADD CONSTRAINT "certificates_workshop_id_workshops_id_fk"
      FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_user_uid_users_uid_fk') THEN
    ALTER TABLE "public"."feedback"
      ADD CONSTRAINT "feedback_user_uid_users_uid_fk"
      FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_workshop_id_workshops_id_fk') THEN
    ALTER TABLE "public"."feedback"
      ADD CONSTRAINT "feedback_workshop_id_workshops_id_fk"
      FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_courses_institution_id_institutions_id_fk') THEN
    ALTER TABLE "public"."institution_courses"
      ADD CONSTRAINT "institution_courses_institution_id_institutions_id_fk"
      FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_courses_course_id_courses_id_fk') THEN
    ALTER TABLE "public"."institution_courses"
      ADD CONSTRAINT "institution_courses_course_id_courses_id_fk"
      FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institution_locations_institution_id_institutions_id_fk') THEN
    ALTER TABLE "public"."institution_locations"
      ADD CONSTRAINT "institution_locations_institution_id_institutions_id_fk"
      FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_user_uid_users_uid_fk') THEN
    ALTER TABLE "public"."notifications"
      ADD CONSTRAINT "notifications_user_uid_users_uid_fk"
      FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_workshop_id_workshops_id_fk') THEN
    ALTER TABLE "public"."notifications"
      ADD CONSTRAINT "notifications_workshop_id_workshops_id_fk"
      FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_user_uid_users_uid_fk') THEN
    ALTER TABLE "public"."registrations"
      ADD CONSTRAINT "registrations_user_uid_users_uid_fk"
      FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registrations_workshop_id_workshops_id_fk') THEN
    ALTER TABLE "public"."registrations"
      ADD CONSTRAINT "registrations_workshop_id_workshops_id_fk"
      FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_workshop_id_workshops_id_fk') THEN
    ALTER TABLE "public"."sessions"
      ADD CONSTRAINT "sessions_workshop_id_workshops_id_fk"
      FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_user_uid_users_uid_fk') THEN
    ALTER TABLE "public"."waitlist"
      ADD CONSTRAINT "waitlist_user_uid_users_uid_fk"
      FOREIGN KEY ("user_uid") REFERENCES "public"."users"("uid") ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_workshop_id_workshops_id_fk') THEN
    ALTER TABLE "public"."waitlist"
      ADD CONSTRAINT "waitlist_workshop_id_workshops_id_fk"
      FOREIGN KEY ("workshop_id") REFERENCES "public"."workshops"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_reg_session_idx" ON "public"."attendance" USING btree ("registration_id", "session_id");
CREATE UNIQUE INDEX IF NOT EXISTS "certificates_user_workshop_idx" ON "public"."certificates" USING btree ("user_uid", "workshop_id");
CREATE UNIQUE INDEX IF NOT EXISTS "feedback_user_workshop_idx" ON "public"."feedback" USING btree ("user_uid", "workshop_id");
CREATE UNIQUE INDEX IF NOT EXISTS "institution_courses_inst_course_idx" ON "public"."institution_courses" USING btree ("institution_id", "course_id");
CREATE UNIQUE INDEX IF NOT EXISTS "registrations_user_workshop_idx" ON "public"."registrations" USING btree ("user_uid", "workshop_id");
CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_user_workshop_idx" ON "public"."waitlist" USING btree ("user_uid", "workshop_id");

-- Seed the 10 Digital Skills Courses
INSERT INTO "public"."courses" ("slug", "name", "icon_key", "description", "display_order")
VALUES
  ('python-programming', 'Python Programming', 'python', 'Core syntax, data structures, scripting, automation, and problem solving with Python.', 1),
  ('java-programming', 'Java Programming', 'java', 'Object-oriented programming, collections, exception handling, and backend fundamentals in Java.', 2),
  ('c-programming', 'C Programming', 'c', 'Structured programming, pointers, memory management, arrays, and foundational algorithms.', 3),
  ('cpp-programming', 'C++ Programming', 'cpp', 'Object-oriented C++, STL containers, templates, and competitive/system programming.', 4),
  ('web-development', 'Web Development (HTML, CSS, JavaScript)', 'web', 'Responsive layouts, modern styling, DOM scripting, and interactive frontend web apps.', 5),
  ('computer-basics', 'Computer Basics', 'basics', 'Operating systems, file management, typing, internet navigation, email, and digital safety.', 6),
  ('microsoft-office', 'Microsoft Office (Word, Excel, PowerPoint)', 'office', 'Document formatting, spreadsheet formulas and pivot tables, and professional presentations.', 7),
  ('data-analytics', 'Data Analytics', 'analytics', 'Data cleaning, SQL querying, spreadsheet modeling, dashboarding, and visual insights.', 8),
  ('digital-marketing', 'Digital Marketing', 'marketing', 'SEO fundamentals, social media campaigns, content strategy, and online analytics.', 9),
  ('hardware-networking', 'Computer Hardware and Networking', 'hardware', 'PC assembly, troubleshooting, OS installation, LAN configuration, and network security.', 10)
ON CONFLICT ("slug") DO NOTHING;

-- Seed Starter Workshops & Sessions only if the workshops table is currently empty
DO $$
DECLARE
  w_count integer;
  w_id integer;
BEGIN
  SELECT COUNT(*) INTO w_count FROM "public"."workshops";
  IF w_count = 0 THEN
    INSERT INTO "public"."workshops" ("name", "category", "description", "duration", "workshop_date", "start_time", "capacity", "location", "status")
    VALUES ('Tailoring & Garment Making', 'Vocational & Trade', 'Learn measuring, pattern cutting and basic machine sewing.', '6 Weeks', '2026-12-12', '09:00', 20, 'Metro Makers Lab', 'open')
    RETURNING "id" INTO w_id;
    INSERT INTO "public"."sessions" ("workshop_id", "session_date", "start_time", "qr_token")
    VALUES (w_id, '2026-12-12', '09:00', md5(random()::text || clock_timestamp()::text || '1'));

    INSERT INTO "public"."workshops" ("name", "category", "description", "duration", "workshop_date", "start_time", "capacity", "location", "status")
    VALUES ('Computer Basics & Digital Skills', 'Digital Literacy', 'Build confidence with computers, email, spreadsheets and online safety.', '4 Weeks', '2026-12-15', '10:00', 24, 'City Library Tech Wing', 'open')
    RETURNING "id" INTO w_id;
    INSERT INTO "public"."sessions" ("workshop_id", "session_date", "start_time", "qr_token")
    VALUES (w_id, '2026-12-15', '10:00', md5(random()::text || clock_timestamp()::text || '2'));

    INSERT INTO "public"."workshops" ("name", "category", "description", "duration", "workshop_date", "start_time", "capacity", "location", "status")
    VALUES ('First Aid Training', 'Healthcare & Safety', 'Practice essential emergency response, CPR and injury care skills.', '2 Days', '2026-12-18', '09:30', 18, 'Community Health Centre', 'open')
    RETURNING "id" INTO w_id;
    INSERT INTO "public"."sessions" ("workshop_id", "session_date", "start_time", "qr_token")
    VALUES (w_id, '2026-12-18', '09:30', md5(random()::text || clock_timestamp()::text || '3'));

    INSERT INTO "public"."workshops" ("name", "category", "description", "duration", "workshop_date", "start_time", "capacity", "location", "status")
    VALUES ('Communication Skills', 'Soft Skills', 'Improve public speaking, listening and workplace communication.', '3 Weeks', '2026-12-20', '14:00', 30, 'Civic Learning Hall', 'open')
    RETURNING "id" INTO w_id;
    INSERT INTO "public"."sessions" ("workshop_id", "session_date", "start_time", "qr_token")
    VALUES (w_id, '2026-12-20', '14:00', md5(random()::text || clock_timestamp()::text || '4'));
  END IF;
END
$$;

COMMIT;

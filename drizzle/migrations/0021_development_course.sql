ALTER TABLE course_training_settings DROP CONSTRAINT course_training_settings_mode_check;
ALTER TABLE course_training_settings ADD CONSTRAINT course_training_settings_mode_check CHECK (mode IN ('legacy', 'btob', 'development'));
ALTER TABLE course_training_days ADD COLUMN reference_url text;
ALTER TABLE course_training_days ADD COLUMN supplement_url text;
--> statement-breakpoint
CREATE TABLE development_projects (
  course_id text NOT NULL, student_id text NOT NULL,
  name text NOT NULL CHECK (length(name) <= 120), problem text NOT NULL CHECK (length(problem) <= 1000),
  editor_url text, preview_url text,
  revision integer NOT NULL CHECK (revision > 0), updated_at timestamptz NOT NULL, updated_by text NOT NULL,
  PRIMARY KEY (course_id, student_id),
  FOREIGN KEY (student_id, course_id) REFERENCES student_courses(student_id, course_id) ON DELETE CASCADE
);
CREATE TABLE development_sessions (
  course_id text NOT NULL, student_id text NOT NULL, day_no integer NOT NULL CHECK (day_no BETWEEN 1 AND 10),
  mode text CHECK (mode IN ('reading', 'developing')),
  difficulty text NOT NULL CHECK (length(difficulty) <= 1000), next_step text NOT NULL CHECK (length(next_step) <= 1000),
  help text NOT NULL CHECK (help IN ('none', 'requested', 'resolved')),
  revision integer NOT NULL CHECK (revision > 0), updated_at timestamptz NOT NULL, updated_by text NOT NULL,
  PRIMARY KEY (course_id, student_id, day_no),
  FOREIGN KEY (student_id, course_id) REFERENCES student_courses(student_id, course_id) ON DELETE CASCADE
);
CREATE TABLE development_attendance (
  course_id text NOT NULL, student_id text NOT NULL, day_no integer NOT NULL CHECK (day_no BETWEEN 1 AND 10),
  status text NOT NULL CHECK (status IN ('present', 'absent', 'late', 'left_early', 'unset')),
  revision integer NOT NULL CHECK (revision > 0), updated_at timestamptz NOT NULL, updated_by text NOT NULL,
  PRIMARY KEY (course_id, student_id, day_no),
  FOREIGN KEY (student_id, course_id) REFERENCES student_courses(student_id, course_id) ON DELETE CASCADE
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON development_projects, development_sessions, development_attendance TO aischool_app;

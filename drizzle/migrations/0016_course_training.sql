CREATE TABLE course_training_settings (
  course_id text PRIMARY KEY CHECK (length(btrim(course_id)) > 0),
  mode text NOT NULL CHECK (mode IN ('legacy', 'btob')),
  current_day integer CHECK (current_day BETWEEN 1 AND 10),
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL,
  updated_by text NOT NULL
);
--> statement-breakpoint
CREATE TABLE course_training_days (
  course_id text NOT NULL REFERENCES course_training_settings(course_id),
  day_no integer NOT NULL CHECK (day_no BETWEEN 1 AND 10),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 120),
  material_url text,
  canvas_quiz_url text,
  PRIMARY KEY (course_id, day_no)
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON course_training_settings TO aischool_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON course_training_days TO aischool_app;

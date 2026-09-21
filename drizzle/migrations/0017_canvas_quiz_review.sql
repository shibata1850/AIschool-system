CREATE TABLE canvas_quiz_review_candidates (
  course_id text NOT NULL,
  source_key text NOT NULL CHECK (source_key ~ '^[a-f0-9]{64}$'),
  revision text NOT NULL CHECK (revision ~ '^[a-f0-9]{64}$'),
  student_id text NOT NULL,
  source_instance text NOT NULL,
  canvas_course_id integer NOT NULL CHECK (canvas_course_id > 0),
  snapshot jsonb NOT NULL,
  imported_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > imported_at),
  PRIMARY KEY (course_id, source_key, revision),
  FOREIGN KEY (student_id, course_id) REFERENCES student_courses(student_id, course_id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX canvas_quiz_review_expiry ON canvas_quiz_review_candidates(expires_at);
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON canvas_quiz_review_candidates TO aischool_app;

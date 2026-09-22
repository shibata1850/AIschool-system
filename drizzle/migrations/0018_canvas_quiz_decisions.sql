CREATE TABLE canvas_quiz_review_decisions (
  course_id text NOT NULL,
  student_id text NOT NULL,
  source_instance text NOT NULL,
  quiz_id integer NOT NULL CHECK (quiz_id > 0),
  source_key text NOT NULL,
  revision text NOT NULL,
  token uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('adopted','withdrawn')),
  decided_at timestamptz NOT NULL,
  decided_by text NOT NULL,
  PRIMARY KEY (course_id,student_id,source_instance,quiz_id),
  FOREIGN KEY (course_id,source_key,revision)
    REFERENCES canvas_quiz_review_candidates(course_id,source_key,revision) ON DELETE CASCADE
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON canvas_quiz_review_decisions TO aischool_app;

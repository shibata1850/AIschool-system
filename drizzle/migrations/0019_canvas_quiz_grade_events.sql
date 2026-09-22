CREATE TABLE canvas_quiz_grade_events (
  sequence serial PRIMARY KEY,
  token uuid NOT NULL UNIQUE,
  course_id text NOT NULL,
  student_id text NOT NULL,
  source_instance text NOT NULL,
  quiz_id integer NOT NULL CHECK (quiz_id > 0),
  snapshot jsonb NOT NULL,
  source_key text NOT NULL,
  revision text NOT NULL,
  confirmed_at timestamptz NOT NULL,
  confirmed_by text NOT NULL,
  FOREIGN KEY (student_id,course_id) REFERENCES student_courses(student_id,course_id) ON DELETE CASCADE,
  CHECK ((snapshot->>'courseId' = course_id AND snapshot->>'studentId' = student_id
    AND snapshot->>'sourceInstance' = source_instance AND (snapshot->>'quizId')::integer = quiz_id) IS TRUE),
  CHECK ((snapshot->>'stage' = 'F' AND snapshot->>'state' IN ('adopted','withdrawn')) IS TRUE)
);
--> statement-breakpoint
CREATE INDEX canvas_quiz_grade_latest ON canvas_quiz_grade_events(course_id,student_id,source_instance,quiz_id,sequence DESC);
--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON canvas_quiz_grade_events TO aischool_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE canvas_quiz_grade_events_sequence_seq TO aischool_app;

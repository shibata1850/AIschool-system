ALTER TABLE submissions ADD COLUMN course_id text;
--> statement-breakpoint
ALTER TABLE chat_logs ADD COLUMN course_id text;
--> statement-breakpoint
ALTER TABLE teacher_messages ADD COLUMN course_id text;
--> statement-breakpoint
CREATE INDEX submissions_course_student_idx ON submissions (course_id, student_id);
--> statement-breakpoint
CREATE INDEX chat_logs_course_student_idx ON chat_logs (course_id, student_id);
--> statement-breakpoint
CREATE INDEX teacher_messages_course_student_idx ON teacher_messages (course_id, student_id);
--> statement-breakpoint
CREATE TABLE course_lesson_records (
  course_id text NOT NULL,
  student_id text NOT NULL,
  lesson_id text NOT NULL,
  week_start text NOT NULL,
  attended boolean NOT NULL,
  submitted boolean NOT NULL,
  score integer,
  data_missing boolean NOT NULL DEFAULT false,
  PRIMARY KEY (course_id, student_id, week_start)
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON course_lesson_records TO aischool_app;

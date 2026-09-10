CREATE TABLE "student_courses" (
  "student_id" text NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
  "course_id" text NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("student_id", "course_id")
);
GRANT SELECT, INSERT, UPDATE, DELETE ON "student_courses" TO aischool_app;

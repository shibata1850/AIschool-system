ALTER TABLE course_training_days ADD COLUMN quiz_required boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE course_training_days ADD CONSTRAINT training_quiz_required_url
  CHECK (quiz_required OR canvas_quiz_url IS NULL);

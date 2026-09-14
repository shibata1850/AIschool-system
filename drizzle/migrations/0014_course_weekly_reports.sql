-- Preserve legacy snapshots; their course ownership is not inferred.
CREATE TABLE course_weekly_reports (
  course_id text NOT NULL CHECK (length(btrim(course_id)) > 0),
  week_start text NOT NULL,
  generation_id text NOT NULL CHECK (length(btrim(generation_id)) > 0),
  generated_at timestamptz NOT NULL,
  notification_claimed_at timestamptz,
  payload jsonb NOT NULL,
  notified_at timestamptz,
  notify_skipped_reason text,
  PRIMARY KEY (course_id, week_start)
);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON course_weekly_reports TO aischool_app;

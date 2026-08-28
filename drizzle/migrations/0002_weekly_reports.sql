CREATE TABLE "weekly_reports" (
	"week_start" text PRIMARY KEY NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"payload" jsonb NOT NULL,
	"notified_at" timestamp with time zone,
	"notify_skipped_reason" text
);

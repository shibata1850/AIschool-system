CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"char_limit" integer NOT NULL,
	"deadline" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor_role" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "device_assignments" (
	"seat_no" integer PRIMARY KEY NOT NULL,
	"nuc_id" text NOT NULL,
	"monitor_id" text NOT NULL,
	"student_id" text NOT NULL,
	"using_backup" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_records" (
	"student_id" text NOT NULL,
	"lesson_id" text NOT NULL,
	"week_start" text NOT NULL,
	"attended" boolean NOT NULL,
	"submitted" boolean NOT NULL,
	"score" integer,
	"data_missing" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lesson_records_student_id_week_start_pk" PRIMARY KEY("student_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"student_id" text NOT NULL,
	"status" text NOT NULL,
	"version" integer NOT NULL,
	"prompt_text" text NOT NULL,
	"ai_output_text" text NOT NULL,
	"reflection_text" text NOT NULL,
	"is_late" boolean NOT NULL,
	"ai_grade" jsonb,
	"teacher_score" integer,
	"has_deviation" boolean NOT NULL,
	"teacher_comment" text,
	"submitted_at" text,
	"versions" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE no action ON UPDATE no action;
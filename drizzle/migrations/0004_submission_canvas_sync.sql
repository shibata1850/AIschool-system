ALTER TABLE "submissions" ADD COLUMN "canvas_user_id" integer;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "canvas_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "canvas_sync_error" text;
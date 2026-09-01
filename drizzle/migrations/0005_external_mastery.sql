-- E7-c: eラーニングシステムから受け取る自宅学習の到達度。
-- 教室の到達度とは別テーブルに保持し、合成しない（docs/eラーニング連携.md 3.2.2）。
CREATE TABLE IF NOT EXISTS "external_mastery" (
  "student_id" text NOT NULL,
  "unit_id" text NOT NULL,
  "source" text NOT NULL,
  -- NULL は「測定中」。0点ではない（先方要件定義書 E4 例外1）
  "score" integer,
  "reasons" jsonb,
  "measured_at" timestamp with time zone NOT NULL,
  "received_at" timestamp with time zone NOT NULL,
  CONSTRAINT "external_mastery_pk" PRIMARY KEY ("student_id", "unit_id", "source")
);

-- 実行時アプリロールへの権限（最小権限。0001_grant_app_role.sql と同じ方針）。
-- 受信のたびに上書きするため UPDATE が要る。DELETE は退会者データ削除で使う。
GRANT SELECT, INSERT, UPDATE, DELETE ON "external_mastery" TO aischool_app;

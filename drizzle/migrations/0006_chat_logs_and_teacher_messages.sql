-- AI講師との会話ログ（F2）と、講師から受講生への一言（S6の介入導線）。
-- どちらも受講生に紐づく個人データのため、退会者データ削除（F5②）の対象になる。

-- 会話ログ: **マスキング済みの本文だけ**を保存する（原文は保存しない）。
-- 目的は「会話が見られること」（2026-08-24 柴田さま要望）と、
-- 第1期の質問を教材・講師手順書へ還元すること（2026-09-02 隘路さまと合意）。
CREATE TABLE IF NOT EXISTS "chat_logs" (
  "id" serial PRIMARY KEY,
  "student_id" text NOT NULL,
  "asked_at" timestamp with time zone NOT NULL,
  "masked_question" text NOT NULL,
  -- フィルタでブロックした場合は NULL（回答自体が存在しない）
  "reply" text,
  "blocked" boolean NOT NULL,
  "pii_detected" boolean NOT NULL,
  -- F2①（応答5秒以内）の実測値。ログ出力と同じ値を残す
  "elapsed_ms" integer,
  "model" text
);

-- 受講生ごとの取り出し（S3の履歴表示・講師の閲覧）と、退会者削除で引く
CREATE INDEX IF NOT EXISTS "chat_logs_student_asked_idx"
  ON "chat_logs" ("student_id", "asked_at" DESC);

-- 講師から受講生への一言。一方向（返信は口頭。同じ教室にいるため）
CREATE TABLE IF NOT EXISTS "teacher_messages" (
  "id" serial PRIMARY KEY,
  "student_id" text NOT NULL,
  "sent_at" timestamp with time zone NOT NULL,
  -- LTI起動時のみ送信者IDが入る（デモ運用では NULL）
  "sent_by" text,
  "body" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "teacher_messages_student_sent_idx"
  ON "teacher_messages" ("student_id", "sent_at" DESC);

-- 実行時アプリロールへの権限（最小権限。0001_grant_app_role.sql と同じ方針）。
-- UPDATE は与えない（どちらも追記のみで、あとから書き換える用途がない）。
-- DELETE は退会者データ削除（purgeStudentData）で使う。
GRANT SELECT, INSERT, DELETE ON "chat_logs" TO aischool_app;
GRANT SELECT, INSERT, DELETE ON "teacher_messages" TO aischool_app;
GRANT USAGE, SELECT ON SEQUENCE "chat_logs_id_seq" TO aischool_app;
GRANT USAGE, SELECT ON SEQUENCE "teacher_messages_id_seq" TO aischool_app;

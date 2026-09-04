-- 受講生名簿。LTI起動のたびに記録・更新する。
--
-- Canvas REST APIの名簿を使わない理由: RESTが返す数値IDと、受講生の画面が使う
-- LTIの sub は別値であり、RESTを起点にすると講師画面と受講生画面が別人を指す
-- （2026-09-02、講師の「一言送る」が実LTI受講生に届かない形で顕在化した）。
CREATE TABLE IF NOT EXISTS "students" (
  -- LTIの sub。他テーブルの student_id はすべてこれを指す
  "id" text PRIMARY KEY,
  "display_name" text NOT NULL,
  -- 成績書き戻し用（開発者キーのカスタムフィールド未設定なら NULL）
  "canvas_user_id" integer,
  "first_seen_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone NOT NULL
);

-- 起動のたびに upsert するため UPDATE が要る。DELETE は退会者データ削除で使う
GRANT SELECT, INSERT, UPDATE, DELETE ON "students" TO aischool_app;

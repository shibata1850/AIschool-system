-- AI講師の稼働状態（2026-09-04・受け入れ基準 F2②「推論停止時の静的教材自動切替と講師通知」）。
--
-- 1行だけの表（id=1）。推論の連続失敗回数と、停止中かどうかを持つ。
-- 停止の開始・復旧は監査ログ（entity=ai_outage）に残すため、ここには履歴を持たない。
--
-- なぜDBに置くか: コンテナ再起動で状態が消えても実害はない（次の失敗で再び止まる）が、
-- 「講師へ通知済みか」は再起動で消えると二重通知になる。行1つで済むので表にした。
CREATE TABLE IF NOT EXISTS "ai_health" (
  "id" integer PRIMARY KEY,
  -- 連続失敗回数。成功で0に戻る。閾値（3）で停止中に切り替わる
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  -- 停止中の開始時刻。NULL なら稼働中
  "outage_started_at" timestamp with time zone,
  -- 停止中に推論を再試行した最終時刻（一定間隔で1件だけ試す — 全員を10秒待たせない）
  "last_attempt_at" timestamp with time zone,
  -- 講師へCanvasメッセージで通知した時刻／通知できなかった理由
  "notified_at" timestamp with time zone,
  "notify_skipped_reason" text
);

INSERT INTO "ai_health" ("id") VALUES (1) ON CONFLICT DO NOTHING;

-- 実行時アプリは状態の更新のみ。行の増減はさせない（DELETE 不可）
GRANT SELECT, INSERT, UPDATE ON "ai_health" TO aischool_app;

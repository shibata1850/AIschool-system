-- Custom SQL migration file, put your code below! --

-- 実行時アプリ用ロール（aischool_app）への最小権限付与。
-- 現行コードが実際に行う操作だけを許可する（最小権限。CLAUDE.md 9章）:
--   - assignments: 参照のみ（作成・更新はシード/管理者経路のみ）
--   - submissions : 参照・更新・削除（削除は退会者データ削除 purgeStudentData 用）。
--                   新規作成は行わない（提出行は必ずシードで先に存在する）
--   - lesson_records: 参照・作成・更新・削除（出席の初回記録は新規行のINSERT）
--   - device_assignments: 参照・更新のみ（予備機切替のみ。行の増減なし）
--   - audit_log: 参照・作成のみ。UPDATE/DELETEは明示的に与えない
--                （追記専用の強制 — SEC-2。ロールが未作成の環境ではこの
--                 マイグレーションは失敗する。provisioningの手順不備を検知するため
--                 意図的に握りつぶさない）
GRANT SELECT ON assignments TO aischool_app;
GRANT SELECT, UPDATE, DELETE ON submissions TO aischool_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON lesson_records TO aischool_app;
GRANT SELECT, UPDATE ON device_assignments TO aischool_app;
GRANT SELECT, INSERT ON audit_log TO aischool_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO aischool_app;
REVOKE UPDATE, DELETE ON audit_log FROM aischool_app;

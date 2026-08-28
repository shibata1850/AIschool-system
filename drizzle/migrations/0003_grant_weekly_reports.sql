-- Custom SQL migration file, put your code below! --

-- 週次レポートのスナップショットに対する実行時アプリロールの権限（0001と同じ最小権限方針）。
-- 生成バッチは同じ週の行を置き換える（upsert）ため INSERT/UPDATE が要る。
-- DELETE は与えない（過去のレポートをアプリ経路から消せないようにする）。
GRANT SELECT, INSERT, UPDATE ON weekly_reports TO aischool_app;
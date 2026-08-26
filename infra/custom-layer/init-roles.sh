#!/bin/sh
# postgres公式イメージの初回起動時に自動実行される（docker-entrypoint-initdb.d）。
# 権限を絞った実行時ロール（aischool_app）を作る。テーブル自体の作成・権限付与は
# drizzle/migrations（scripts/migrate.ts）で行う（このスクリプトの責務外）。
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE ROLE aischool_app WITH LOGIN PASSWORD '$DB_APP_PASSWORD';
  GRANT CONNECT ON DATABASE $POSTGRES_DB TO aischool_app;
  GRANT USAGE ON SCHEMA public TO aischool_app;
EOSQL

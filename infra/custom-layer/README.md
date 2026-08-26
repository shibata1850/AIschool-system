# カスタム層 + PostgreSQL 構築資材

- 位置づけ: カスタム層（本リポジトリ）本体と、その専用DB（PostgreSQL）をさくらの
  クラウド上に構築するための資材一式。Canvas本体・Canvas用DBとは完全に別スタック
  （`infra/canvas/`）で、同居させない（docs/ホスティング方針.md・CLAUDE.md絶対ルール1）
- データ永続化への移行の背景: docs/未決事項.md #2（ホスティング先）に記載の
  移行トリガー「データ永続化が必要になった時」に該当（2026-08-26対応）

## 構成

| ファイル | 用途 |
|---|---|
| `docker-compose.yml` | `app`（本リポジトリのDockerfileをビルド）＋ `db`（PostgreSQL）の2サービス構成 |
| `init-roles.sh` | DB初回起動時に、実行時アプリ用の権限を絞ったロール（`aischool_app`）を作成する |

## ロール設計（最小権限。CLAUDE.md 9章）

| ロール | 用途 | 権限 |
|---|---|---|
| `aischool_admin`（`POSTGRES_USER`） | マイグレーション適用・E2E/開発用リセット | テーブル所有者（フル権限） |
| `aischool_app` | アプリの通常実行時接続 | 各テーブルへの必要最小限のCRUDのみ。`audit_log`はSELECT/INSERTのみ（UPDATE/DELETE不可 — 追記専用の強制。テスト計画書SEC-2） |

権限の詳細・根拠は `drizzle/migrations/0001_grant_app_role.sql` のコメントを参照。

## 使い方（さくらのクラウドのサーバー確保後）

1. サーバー（Canvas用とは別、またはCanvasと同一サーバーでも可。同一サーバーでも
   DBコンテナ・ネットワークはCanvas側と分離する）にリポジトリをクローン
2. `.env`（本番用の値。CANVAS_BASE_URL・ANTHROPIC_API_KEY等）と、
   `DB_ADMIN_PASSWORD` / `DB_APP_PASSWORD`（十分に長いランダム値。パスワード管理台帳へ）
   をサーバー上に用意する
3. 起動:
   ```
   cd infra/custom-layer
   DB_ADMIN_PASSWORD=*** DB_APP_PASSWORD=*** docker compose up -d db
   ```
   （`db` を先に起動し、`init-roles.sh` によるロール作成を待つ）
4. マイグレーション適用（初回・スキーマ変更のたび）:
   ```
   DATABASE_ADMIN_URL="postgres://aischool_admin:***@localhost:5432/aischool" \
     npx tsx scripts/migrate.ts
   ```
   （`db` サービスをホストへ一時的にポート公開するか、コンテナ内から実行する）
5. 初回データ投入（架空デモ値。DEMO_RICH_SEED=1 でリッチデモ、未設定で最小シード）:
   `POST /api/dev/reset` を叩く（本番では `ALLOW_DEV_RESET=1` を明示しない限り404 —
   実受講生データ投入後はこのエンドポイントを使わない。CLAUDE.md 2章）
6. アプリ起動:
   ```
   DB_ADMIN_PASSWORD=*** DB_APP_PASSWORD=*** docker compose up -d app
   ```

## やってはいけないこと

- `aischool_app`（アプリ実行時接続）に`audit_log`のUPDATE/DELETE権限を与えること
  （追記専用性の強制が壊れる — SEC-2）
- `DATABASE_ADMIN_URL`（管理ロール接続）をアプリの通常経路（API route・画面）から
  使うこと。マイグレーションと `/api/dev/reset` のみに限定する
- 実受講生の個人データが入った状態で `/api/dev/reset` を呼ぶこと（全削除される）

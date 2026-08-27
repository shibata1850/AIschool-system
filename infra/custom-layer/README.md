# カスタム層 + PostgreSQL 構築資材

- 位置づけ: カスタム層（本リポジトリ）本体と、その専用DB（PostgreSQL）をさくらの
  クラウド上に構築するための資材一式。Canvas本体・Canvas用DBとは完全に別スタック
  （`infra/canvas/`）で、同居させない（docs/ホスティング方針.md・CLAUDE.md絶対ルール1）
- データ永続化への移行の背景: docs/未決事項.md #2（ホスティング先）に記載の
  移行トリガー「データ永続化が必要になった時」に該当（2026-08-26対応）

## 構成

| ファイル | 用途 |
|---|---|
| `bootstrap.sh` | **一括構築スクリプト**。パスワード生成→DB起動→スキーマ適用→（任意）初期投入→アプリ起動。冪等 |
| `docker-compose.yml` | `app`（本リポジトリのDockerfileをビルド）＋ `db`（PostgreSQL）の2サービス構成 |
| `init-roles.sh` | DB初回起動時に、実行時アプリ用の権限を絞ったロール（`aischool_app`）を作成する |

## ロール設計（最小権限。CLAUDE.md 9章）

| ロール | 用途 | 権限 |
|---|---|---|
| `aischool_admin`（`POSTGRES_USER`） | マイグレーション適用・E2E/開発用リセット | テーブル所有者（フル権限） |
| `aischool_app` | アプリの通常実行時接続 | 各テーブルへの必要最小限のCRUDのみ。`audit_log`はSELECT/INSERTのみ（UPDATE/DELETE不可 — 追記専用の強制。テスト計画書SEC-2） |

権限の詳細・根拠は `drizzle/migrations/0001_grant_app_role.sql` のコメントを参照。

## 使い方（さくらのクラウドのサーバー確保後）

サーバー（Canvas用とは別、またはCanvasと同一サーバーでも可。同一サーバーでも
DBコンテナ・ネットワークはCanvas側と分離する）にリポジトリをクローンしたうえで、
**次の2行だけ**で構築できる:

```
cd ~/AIschool-system/infra/custom-layer
bash bootstrap.sh --seed
```

`bootstrap.sh` が行うこと（何度実行しても安全）:

1. Docker / docker compose v2 の存在確認
2. `infra/custom-layer/.env` にDBパスワード2種を自動生成（既にあれば再利用）。
   **生成後にパスワード管理台帳へ転記すること**（gitignore済み・チャット貼付禁止）
3. `docker compose up -d db` → `pg_isready` で接続可能になるまで待機
4. `docker compose run --rm --no-deps app npm run db:migrate` でスキーマ適用
   （アプリ用ロールへの権限付与＝`0001_grant_app_role.sql` もここで適用される）
5. `--seed` 指定時のみ、架空デモデータを投入（**破壊的**。下記参照）
6. `docker compose up -d --build app` でアプリ起動

初回以外（スキーマ変更時など）は `--seed` を付けずに実行する。

### 初期データ投入について

`scripts/seed.ts` は対象DBを**全削除してから**架空データを入れ直す破壊的操作で、
`--force` を明示しない限り実行されない。`DEMO_RICH_SEED=1` でリッチデモ
（授業中の教室16席）、未設定で最小シードになる。

```
docker compose run --rm --no-deps app npx tsx scripts/seed.ts --force
```

**実受講生データの投入後は実行しないこと**（CLAUDE.md 絶対ルール6）。

なお開発・E2E用の `POST /api/dev/reset` は本番では使わない
（`ALLOW_DEV_RESET` を設定しなければ404のまま。本番の初期投入は上記スクリプトで行う）。

## やってはいけないこと

- `aischool_app`（アプリ実行時接続）に`audit_log`のUPDATE/DELETE権限を与えること
  （追記専用性の強制が壊れる — SEC-2）
- `DATABASE_ADMIN_URL`（管理ロール接続）をアプリの通常経路（API route・画面）から
  使うこと。マイグレーションと `/api/dev/reset` のみに限定する
- 実受講生の個人データが入った状態で `/api/dev/reset` を呼ぶこと（全削除される）

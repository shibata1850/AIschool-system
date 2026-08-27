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

## 公開範囲（リバースプロキシ前提）

アプリのポートは **`127.0.0.1` にのみ** 公開する（`docker-compose.yml`）。
インターネットへの公開はリバースプロキシ（Caddy=TLS終端／nginx=Basic認証。
`infra/reverse-proxy/`）経由のみとする — docs/実装状況.md「アクセス制御の現状」。

既存のCaddy/nginxが別ポート（例: 3001）を向いている場合は、ホスト側ポートを合わせる:

```
APP_HOST_PORT=3001 bash bootstrap.sh
```

`docker compose ps` の PORTS 列が `127.0.0.1:xxxx->3000/tcp` になっていることを
必ず確認する。`0.0.0.0:xxxx->3000/tcp` はプロキシを迂回した直接公開なので不可。

## DBのlocaleについて

`postgres:16-alpine` は既定で C ロケール（初期化時に警告が出る）。現在のクエリで
文字列順の `ORDER BY` を使うのは `week_start`（ISO日付＝ASCII）だけで、
他は整数列のため**実害はない**。将来、氏名・課題名など日本語文字列で並べ替える
機能を追加する場合は、`ORDER BY ... COLLATE` の指定か、DB再作成時の
`POSTGRES_INITDB_ARGS: "--locale=ja_JP.UTF-8"` 付与を検討する
（ロケール変更は initdb のやり直し＝データ全削除を伴うため、投入前に決めること）。

## やってはいけないこと

- アプリのポートを `0.0.0.0` で公開すること（リバースプロキシを迂回する。上記参照）
- `aischool_app`（アプリ実行時接続）に`audit_log`のUPDATE/DELETE権限を与えること
  （追記専用性の強制が壊れる — SEC-2）
- `DATABASE_ADMIN_URL`（管理ロール接続）をアプリの通常経路（API route・画面）から
  使うこと。マイグレーションと初期投入スクリプトのみに限定する
- 実受講生の個人データが入った状態で `scripts/seed.ts --force` / `/api/dev/reset`
  を実行すること（全削除される）

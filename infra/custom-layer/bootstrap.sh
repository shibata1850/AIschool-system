#!/usr/bin/env bash
# カスタム層のDB（PostgreSQL）構築をまとめて実行する。
#
# 用途: さくらのクラウドのサーバー上で実行し、
#       パスワード生成 → DBコンテナ起動 → スキーマ適用 → （任意）初期データ投入
#       → アプリ起動 まで一度に行う。何度実行しても安全（冪等）。
#
# 使い方（リポジトリを取得済みのサーバーにSSHログイン後）:
#   cd ~/AIschool-system/infra/custom-layer
#   bash bootstrap.sh              # DB構築＋スキーマ適用＋アプリ起動
#   bash bootstrap.sh --seed       # 上記に加えて架空デモデータを投入（初回のみ推奨）
#
# --seed は破壊的（対象DBの既存データを全削除）。実受講生データの投入後は使わないこと
# （CLAUDE.md 絶対ルール6）。

set -euo pipefail

cd "$(dirname "$0")"

ENV_FILE=".env"
DO_SEED=0
for arg in "$@"; do
  case "$arg" in
    --seed) DO_SEED=1 ;;
    *) echo "不明なオプション: $arg（使えるのは --seed のみ）" >&2; exit 1 ;;
  esac
done

echo "=== [1/5] 前提の確認 ==="
if ! command -v docker >/dev/null 2>&1; then
  echo "Dockerが見つかりません。先に infra/canvas/bootstrap.sh を実行してください" >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose（v2）が見つかりません" >&2
  exit 1
fi
echo "[OK] $(docker --version)"

if [ ! -f "../../.env" ]; then
  echo "[注意] リポジトリ直下に .env がありません。"
  echo "       DBの構築は進みますが、アプリはCanvas接続・LTI設定なしで起動します。"
  echo "       .env.example を参考に後から用意してください。"
fi

echo ""
echo "=== [2/5] DBパスワードの用意 ==="
if [ -f "${ENV_FILE}" ]; then
  echo "[SKIP] ${ENV_FILE} は作成済みです（既存の値をそのまま使います）"
else
  # URLに埋め込むため記号を含まない英数字のみで生成する
  gen_pw() { openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32; }
  umask 077
  cat > "${ENV_FILE}" <<EOF
# カスタム層DBの資格情報（自動生成 — コミット禁止。パスワード管理台帳へ転記すること）
DB_ADMIN_PASSWORD=$(gen_pw)
DB_APP_PASSWORD=$(gen_pw)
EOF
  echo "[OK] ${ENV_FILE} を生成しました（パーミッション600）"
  echo "     → 中身をパスワード管理台帳へ転記してください:"
  echo "       cat $(pwd)/${ENV_FILE}"
fi

echo ""
echo "=== [3/5] DBコンテナの起動 ==="
docker compose up -d db
echo "DBの起動を待っています…"
for _ in $(seq 1 40); do
  if docker compose exec -T db pg_isready -U aischool_admin -d aischool >/dev/null 2>&1; then
    echo "[OK] DBが接続を受け付けました"
    break
  fi
  sleep 3
done
if ! docker compose exec -T db pg_isready -U aischool_admin -d aischool >/dev/null 2>&1; then
  echo "DBが起動しませんでした。ログを確認してください: docker compose logs db" >&2
  exit 1
fi

echo ""
echo "=== [4/5] スキーマ適用（マイグレーション） ==="
# アプリ用ロールへの権限付与もマイグレーションに含まれる（0001_grant_app_role.sql）
docker compose run --rm --no-deps app node dist-scripts/migrate.mjs

if [ "${DO_SEED}" = "1" ]; then
  echo ""
  echo "=== [4.5/5] 初期データ投入（架空デモデータ・破壊的） ==="
  docker compose run --rm --no-deps app node dist-scripts/seed.mjs --force
fi

echo ""
echo "=== [5/5] アプリの起動 ==="
docker compose up -d --build app

cat <<'EOS'

============================================================
 カスタム層DBの構築が完了しました
============================================================

確認:
  docker compose ps                 # db / app が Up になっているか
  curl -I http://localhost:3000/    # アプリが応答するか
  docker compose logs -f app        # 起動ログ

次にやること:
  1. infra/custom-layer/.env のパスワードをパスワード管理台帳へ転記
     （このファイルはgitignore済み。チャットに貼らないこと）
  2. 初期データを入れていない場合は `bash bootstrap.sh --seed`
  3. 日次バックアップの設定（手動対応リスト B7）:
       docker compose exec -T db pg_dump -U aischool_admin aischool | gzip > backup-$(date +%F).sql.gz
     を cron に登録し、7日分を保持する

注意:
  - 実受講生データの投入後に `--seed` を実行しないこと（全削除されます）
  - 本番デプロイでは ALLOW_DEV_RESET / DEV_COOKIE_ROLES を設定しないこと
EOS

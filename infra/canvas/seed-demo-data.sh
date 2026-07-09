#!/usr/bin/env bash
# Canvasステージングに「架空の」デモデータを投入するスクリプト
#
# 目的:   カスタム層の連携動作を確認するための最小データ
#         （コース1・架空生徒5名・サンプル課題1）をCanvas REST APIで作成する
# 前提:   Canvasが起動済みで、管理者のアクセストークンが .env にあること
# 実行:   bash seed-demo-data.sh
#         （本リポジトリ直下の .env を読む。CANVAS_BASE_URL / CANVAS_API_TOKEN 必須）
#
# 絶対ルール（CLAUDE.md 2章）:
#   - 投入するのは架空データのみ。実受講生の氏名・連絡先を入れない
#   - トークンは画面・ログに出さない

set -euo pipefail

# ---- .env の読み込み（リポジトリ直下） --------------------------------------
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/../.." && pwd)/.env}"
if [ ! -f "${ENV_FILE}" ]; then
  echo "[NG] .env が見つかりません: ${ENV_FILE}"
  echo "     CANVAS_BASE_URL と CANVAS_API_TOKEN を設定してください"
  exit 1
fi
# CANVAS_ 変数だけ読み込む（他の変数やコメントは無視）
CANVAS_BASE_URL="$(grep -E '^CANVAS_BASE_URL=' "${ENV_FILE}" | head -1 | cut -d= -f2-)"
CANVAS_API_TOKEN="$(grep -E '^CANVAS_API_TOKEN=' "${ENV_FILE}" | head -1 | cut -d= -f2-)"
BASE="${CANVAS_BASE_URL%/}"

if [ -z "${BASE}" ] || [ -z "${CANVAS_API_TOKEN}" ]; then
  echo "[NG] CANVAS_BASE_URL / CANVAS_API_TOKEN が .env に設定されていません"
  exit 1
fi

# ---- API呼び出しヘルパー（トークンは表示しない） ----------------------------
# api METHOD PATH [data...]  → 応答本文をstdoutへ、HTTPコードを最終行に出さず戻り値で判定
api() {
  local method="$1"; shift
  local path="$1"; shift
  local args=(-s -X "${method}" -H "Authorization: Bearer ${CANVAS_API_TOKEN}")
  local d
  for d in "$@"; do args+=(--data-urlencode "${d}"); done
  curl "${args[@]}" "${BASE}${path}"
}

json_get() { # json_get '<json>' '<key>'  （素朴な抽出。idやnameの取り出し用）
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$2',''))" <<<"$1"
}

echo "=== Canvasデモデータ投入（架空データのみ） ==="
echo "接続先: ${BASE}"

# ---- 0. 接続確認 ------------------------------------------------------------
SELF="$(api GET /api/v1/users/self)"
SELF_NAME="$(json_get "${SELF}" name || true)"
if [ -z "${SELF_NAME}" ]; then
  echo "[NG] 接続確認に失敗しました（トークン/URLを確認してください）"
  exit 1
fi
echo "[OK] 接続確認: 管理者として認証されました"

# ---- 1. アカウントID取得（既定アカウント） ----------------------------------
ACCOUNTS="$(api GET /api/v1/accounts)"
ACCOUNT_ID="$(python3 -c "import json,sys; a=json.load(sys.stdin); print(a[0]['id'] if a else '')" <<<"${ACCOUNTS}")"
if [ -z "${ACCOUNT_ID}" ]; then
  echo "[NG] アカウントIDを取得できませんでした（管理者権限を確認）"
  exit 1
fi
echo "[OK] アカウントID: ${ACCOUNT_ID}"

# ---- 2. コース作成 ----------------------------------------------------------
COURSE="$(api POST "/api/v1/accounts/${ACCOUNT_ID}/courses" \
  "course[name]=プロンプト演習デモ（架空）" \
  "course[course_code]=DEMO-PROMPT" \
  "offer=true")"
COURSE_ID="$(json_get "${COURSE}" id)"
if [ -z "${COURSE_ID}" ]; then
  echo "[NG] コース作成に失敗しました。応答の先頭: $(head -c 200 <<<"${COURSE}")"
  exit 1
fi
echo "[OK] コース作成: id=${COURSE_ID}（プロンプト演習デモ（架空））"

# ---- 3. 架空生徒5名を作成して登録 -------------------------------------------
# 氏名は表示名のみ・メールは example.com（実在しないドメイン）
for i in 01 02 03 04 05; do
  EMAIL="demo-student-${i}@example.com"
  U="$(api POST "/api/v1/accounts/${ACCOUNT_ID}/users" \
    "user[name]=デモ生徒${i}" \
    "user[skip_registration]=true" \
    "pseudonym[unique_id]=${EMAIL}" \
    "pseudonym[send_confirmation]=false" \
    "communication_channel[skip_confirmation]=true")"
  UID_="$(json_get "${U}" id)"
  if [ -z "${UID_}" ]; then
    # 既に存在する場合などは警告のみで継続
    echo "[WARN] デモ生徒${i} の作成をスキップ（既存の可能性）: $(head -c 120 <<<"${U}")"
    continue
  fi
  api POST "/api/v1/courses/${COURSE_ID}/enrollments" \
    "enrollment[user_id]=${UID_}" \
    "enrollment[type]=StudentEnrollment" \
    "enrollment[enrollment_state]=active" >/dev/null
  echo "[OK] デモ生徒${i}: id=${UID_} を登録"
done

# ---- 4. サンプル課題を作成（オンラインテキスト提出・公開） -------------------
ASSIGN="$(api POST "/api/v1/courses/${COURSE_ID}/assignments" \
  "assignment[name]=お店の紹介文をAIに書かせよう（架空・デモ）" \
  "assignment[submission_types][]=online_text_entry" \
  "assignment[points_possible]=100" \
  "assignment[published]=true")"
ASSIGN_ID="$(json_get "${ASSIGN}" id)"
if [ -z "${ASSIGN_ID}" ]; then
  echo "[NG] 課題作成に失敗しました。応答の先頭: $(head -c 200 <<<"${ASSIGN}")"
  exit 1
fi
echo "[OK] 課題作成: id=${ASSIGN_ID}"

cat <<EOS

=== 投入完了（すべて架空データ） ===
  コースID:   ${COURSE_ID}
  課題ID:     ${ASSIGN_ID}
  生徒:       デモ生徒01〜05（example.com）

カスタム層からの確認:
  - コース一覧 / 名簿 / 提出 が ${BASE} から取得できるようになりました
  - 接続確認: curl -H "Authorization: Bearer <token>" ${BASE}/api/v1/courses
  ※ トークンはコマンド履歴に残さないよう注意（.env の値を使う）
EOS

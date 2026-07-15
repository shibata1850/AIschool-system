#!/usr/bin/env bash
# Canvasに「使われているコース」らしいテストデータを追加する（冪等・再実行可）。
#
# 前提: seed-demo-data.sh で作った「プロンプト演習デモ（架空）」コースと受講生が既にある。
# やること: 既存コースを探し、課題を3つ用意（無ければ作成）し、受講生に成績を入れる。
#           これでCanvasの「課題」「評定（成績表）」とカスタム層の集計画面が埋まる。
# 実行: bash seed-canvas-rich.sh
# 注意: すべて架空データ（CLAUDE.md 2章）。トークンは表示しない。

set -euo pipefail

ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/../.." && pwd)/.env}"
[ -f "${ENV_FILE}" ] || { echo "[NG] .env が見つかりません: ${ENV_FILE}"; exit 1; }
BASE="$(grep -E '^CANVAS_BASE_URL=' "${ENV_FILE}" | head -1 | cut -d= -f2-)"; BASE="${BASE%/}"
TOKEN="$(grep -E '^CANVAS_API_TOKEN=' "${ENV_FILE}" | head -1 | cut -d= -f2-)"
[ -n "${BASE}" ] && [ -n "${TOKEN}" ] || { echo "[NG] CANVAS_BASE_URL/CANVAS_API_TOKEN 未設定"; exit 1; }

api() { # api METHOD PATH [--data-urlencode k=v ...]
  local method="$1"; shift; local path="$1"; shift
  curl -s -X "${method}" -H "Authorization: Bearer ${TOKEN}" "$@" "${BASE}${path}"
}
pyget() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1',''))"; }

echo "=== Canvasリッチデータ投入（冪等・架空データ） ==="

# --- コース特定（名前で検索。無ければ中断） ---
ACCOUNT_ID="$(api GET /api/v1/accounts | python3 -c "import json,sys;a=json.load(sys.stdin);print(a[0]['id'] if a else '')")"
COURSE_ID="$(api GET "/api/v1/accounts/${ACCOUNT_ID}/courses?search_term=プロンプト演習デモ" \
  | python3 -c "import json,sys
c=json.load(sys.stdin)
print(c[0]['id'] if isinstance(c,list) and c else '')")"
if [ -z "${COURSE_ID}" ]; then
  echo "[NG] 『プロンプト演習デモ（架空）』コースが見つかりません。先に seed-demo-data.sh を実行してください"
  exit 1
fi
echo "[OK] コース: id=${COURSE_ID}"

# --- 受講生一覧（user_id を配列に） ---
mapfile -t STUDENT_IDS < <(api GET "/api/v1/courses/${COURSE_ID}/users?enrollment_type[]=student&per_page=100" \
  | python3 -c "import json,sys
for u in json.load(sys.stdin): print(u['id'])")
echo "[OK] 受講生 ${#STUDENT_IDS[@]} 名"
[ "${#STUDENT_IDS[@]}" -gt 0 ] || { echo "[NG] 受講生がいません。seed-demo-data.sh を先に実行"; exit 1; }

# --- 課題を find-or-create（3件） ---
declare -a WANT_NAMES=(
  "プロンプト演習①：お店の紹介文"
  "プロンプト演習②：じこしょうかい"
  "ふりかえり：うまくいったプロンプト"
)
EXISTING="$(api GET "/api/v1/courses/${COURSE_ID}/assignments?per_page=100")"
declare -a ASSIGN_IDS=()
for name in "${WANT_NAMES[@]}"; do
  aid="$(python3 -c "import json,sys
name=sys.argv[1]
for a in json.load(sys.stdin):
    if a.get('name')==name: print(a['id']); break" "${name}" <<<"${EXISTING}")"
  if [ -z "${aid}" ]; then
    aid="$(api POST "/api/v1/courses/${COURSE_ID}/assignments" \
      --data-urlencode "assignment[name]=${name}" \
      --data-urlencode "assignment[submission_types][]=online_text_entry" \
      --data-urlencode "assignment[points_possible]=100" \
      --data-urlencode "assignment[published]=true" | pyget id)"
    echo "[OK] 課題作成: ${name}（id=${aid}）"
  else
    echo "[SKIP] 課題は既存: ${name}（id=${aid}）"
  fi
  ASSIGN_IDS+=("${aid}")
done

# --- 成績マトリクス（受講生×課題。-1 は未採点＝空欄のまま） ---
# 行=受講生の並び、列=課題①②③。5人想定（多い/少ない分は自動で切り詰め）
declare -a MATRIX=(
  "88 80 -1"
  "72 78 70"
  "95 90 92"
  "60 66 -1"
  "-1 74 80"
)
echo "--- 成績を反映 ---"
i=0
for uid in "${STUDENT_IDS[@]}"; do
  row="${MATRIX[$(( i % ${#MATRIX[@]} ))]}"
  j=0
  for score in ${row}; do
    aid="${ASSIGN_IDS[$j]:-}"
    if [ -n "${aid}" ] && [ "${score}" != "-1" ]; then
      api PUT "/api/v1/courses/${COURSE_ID}/assignments/${aid}/submissions/${uid}" \
        --data-urlencode "submission[posted_grade]=${score}" >/dev/null
    fi
    j=$(( j + 1 ))
  done
  i=$(( i + 1 ))
done
echo "[OK] 成績反映 完了"

cat <<EOS

=== 完了（すべて架空データ） ===
Canvasで確認:
  - コース『プロンプト演習デモ（架空）』→ 課題（3件）／評定（成績表が埋まる）
カスタム層で確認:
  - /teacher/summary（Canvas集計）・/teacher/class（名簿）・/teacher/grade（採点入力）
EOS

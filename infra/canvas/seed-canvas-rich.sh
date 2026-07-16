#!/usr/bin/env bash
# Canvas本体を「実際に使われているクラス」らしく見せるテストデータを投入する（冪等・再実行可）。
#
# 前提: seed-demo-data.sh で『プロンプト演習デモ（架空）』コースが作成済み
#       （無ければ本スクリプトが探して見つからなければ中断）。
# やること（すべて架空データ・CLAUDE.md 2章）:
#   - 受講生を16名まで用意（デモ生徒01〜16。find-or-create＋登録）
#   - 課題3件（締切・説明つき。find-or-create）
#   - お知らせ1件・ディスカッション1件・シラバス本文
#   - 成績表（受講生×課題のマトリクス。一部は未採点で空欄）
# 実行: bash seed-canvas-rich.sh
# 注意: トークンは表示しない。何度実行しても重複が増えにくいよう配慮。

set -euo pipefail

ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/../.." && pwd)/.env}"
[ -f "${ENV_FILE}" ] || { echo "[NG] .env が見つかりません: ${ENV_FILE}"; exit 1; }
BASE="$(grep -E '^CANVAS_BASE_URL=' "${ENV_FILE}" | head -1 | cut -d= -f2-)"; BASE="${BASE%/}"
TOKEN="$(grep -E '^CANVAS_API_TOKEN=' "${ENV_FILE}" | head -1 | cut -d= -f2-)"
[ -n "${BASE}" ] && [ -n "${TOKEN}" ] || { echo "[NG] CANVAS_BASE_URL/CANVAS_API_TOKEN 未設定"; exit 1; }

api() { local m="$1"; shift; local p="$1"; shift; curl -s -X "$m" -H "Authorization: Bearer ${TOKEN}" "$@" "${BASE}${p}"; }
pyget() { python3 -c "import json,sys
try:
  d=json.load(sys.stdin); print(d.get('$1',''))
except Exception: print('')"; }

echo "=== Canvasリッチデータ投入（冪等・架空データ） ==="
echo "接続先: ${BASE}"

# --- アカウント・コース特定 ---
ACCOUNT_ID="$(api GET /api/v1/accounts | python3 -c "import json,sys
try:
  a=json.load(sys.stdin); print(a[0]['id'] if a else '')
except Exception: print('')")"
[ -n "${ACCOUNT_ID}" ] || { echo "[NG] アカウント取得失敗（接続先/トークンを確認）"; exit 1; }

COURSE_ID="$(api GET "/api/v1/accounts/${ACCOUNT_ID}/courses?search_term=プロンプト演習デモ" | python3 -c "import json,sys
try:
  c=json.load(sys.stdin); print(c[0]['id'] if isinstance(c,list) and c else '')
except Exception: print('')")"
[ -n "${COURSE_ID}" ] || { echo "[NG] 『プロンプト演習デモ（架空）』が見つかりません。先に seed-demo-data.sh を実行"; exit 1; }
echo "[OK] コース: id=${COURSE_ID}"

# --- 既存の登録済み受講生（重複登録を避けるための集合） ---
declare -A ENROLLED=()
while IFS= read -r uid; do [ -n "$uid" ] && ENROLLED["$uid"]=1; done < <(
  api GET "/api/v1/courses/${COURSE_ID}/users?enrollment_type[]=student&per_page=100" \
    | python3 -c "import json,sys
try:
  [print(u['id']) for u in json.load(sys.stdin)]
except Exception: pass")

# --- 受講生を16名まで用意（find-or-create＋登録） ---
declare -a STUDENT_IDS=()
for n in $(seq 1 16); do
  nn="$(printf '%02d' "$n")"
  email="demo-student-${nn}@example.com"
  uid="$(api GET "/api/v1/accounts/${ACCOUNT_ID}/users?search_term=${email}" | python3 -c "import json,sys
try:
  u=json.load(sys.stdin); print(u[0]['id'] if isinstance(u,list) and u else '')
except Exception: print('')")"
  if [ -z "$uid" ]; then
    uid="$(api POST "/api/v1/accounts/${ACCOUNT_ID}/users" \
      --data-urlencode "user[name]=デモ生徒${nn}" \
      --data-urlencode "user[skip_registration]=true" \
      --data-urlencode "pseudonym[unique_id]=${email}" \
      --data-urlencode "pseudonym[send_confirmation]=false" \
      --data-urlencode "communication_channel[skip_confirmation]=true" | pyget id)"
  fi
  if [ -n "$uid" ]; then
    if [ -z "${ENROLLED[$uid]:-}" ]; then
      api POST "/api/v1/courses/${COURSE_ID}/enrollments" \
        --data-urlencode "enrollment[user_id]=${uid}" \
        --data-urlencode "enrollment[type]=StudentEnrollment" \
        --data-urlencode "enrollment[enrollment_state]=active" >/dev/null
      ENROLLED["$uid"]=1
    fi
    STUDENT_IDS+=("$uid")
  else
    echo "[WARN] デモ生徒${nn} を用意できませんでした（スキップ）"
  fi
done
echo "[OK] 受講生 ${#STUDENT_IDS[@]} 名を用意"

# --- 課題を find-or-create（締切・説明つき・3件） ---
EXISTING="$(api GET "/api/v1/courses/${COURSE_ID}/assignments?per_page=100")"
declare -a A_NAMES=("プロンプト演習①：お店の紹介文" "プロンプト演習②：じこしょうかい" "ふりかえり：うまくいったプロンプト")
declare -a A_DUE=("2026-10-19T14:59:00Z" "2026-10-26T14:59:00Z" "2026-11-02T14:59:00Z")
declare -a A_DESC=(
  "パン屋の店長として、新商品メロンパンを紹介する文章をAIに書かせるプロンプトを書こう。「だれに」「どんな長さ」「どんな雰囲気」を指定できると高得点。"
  "自分のすきなこと・とくいなことをAIに伝えて、みじかい自己紹介文を作ってもらうプロンプトを書こう。"
  "今日つくったプロンプトで、いちばんうまくいったものと、その理由をふりかえろう。"
)
declare -a ASSIGN_IDS=()
for i in 0 1 2; do
  name="${A_NAMES[$i]}"
  aid="$(python3 -c "import json,sys
name=sys.argv[1]
try:
  ids=[a['id'] for a in json.load(sys.stdin) if a.get('name')==name]
  print(ids[0] if ids else '')
except Exception:
  print('')" "${name}" <<<"${EXISTING}")"
  if [ -z "$aid" ]; then
    aid="$(api POST "/api/v1/courses/${COURSE_ID}/assignments" \
      --data-urlencode "assignment[name]=${name}" \
      --data-urlencode "assignment[description]=${A_DESC[$i]}" \
      --data-urlencode "assignment[submission_types][]=online_text_entry" \
      --data-urlencode "assignment[points_possible]=100" \
      --data-urlencode "assignment[due_at]=${A_DUE[$i]}" \
      --data-urlencode "assignment[published]=true" | pyget id)"
    echo "[OK] 課題作成: ${name}（id=${aid}）"
  else
    echo "[SKIP] 課題は既存: ${name}（id=${aid}）"
  fi
  ASSIGN_IDS+=("$aid")
done

# --- お知らせ・ディスカッション（既存タイトルがあれば作らない） ---
TOPICS="$(api GET "/api/v1/courses/${COURSE_ID}/discussion_topics?per_page=100")"
have_topic() { python3 -c "import json,sys
t=sys.argv[1]
try:
  print('yes' if any(x.get('title')==t for x in json.load(sys.stdin)) else '')
except Exception: print('')" "$1" <<<"${TOPICS}"; }

if [ -z "$(have_topic 'ようこそ！プロンプト演習の授業がはじまります')" ]; then
  api POST "/api/v1/courses/${COURSE_ID}/discussion_topics" \
    --data-urlencode "title=ようこそ！プロンプト演習の授業がはじまります" \
    --data-urlencode "message=今週から「AIに文章を書かせる」練習をします。ゴーグルをつけて、いっしょにやってみましょう。" \
    --data-urlencode "is_announcement=true" --data-urlencode "published=true" >/dev/null
  echo "[OK] お知らせを作成"
fi
if [ -z "$(have_topic 'うまくいったプロンプトを共有しよう')" ]; then
  api POST "/api/v1/courses/${COURSE_ID}/discussion_topics" \
    --data-urlencode "title=うまくいったプロンプトを共有しよう" \
    --data-urlencode "message=じょうずに書けたプロンプトがあったら、ここに書いてみんなに教えてね。" \
    --data-urlencode "published=true" >/dev/null
  echo "[OK] ディスカッションを作成"
fi

# --- シラバス本文 ---
api PUT "/api/v1/courses/${COURSE_ID}" \
  --data-urlencode "course[syllabus_body]=<h2>プロンプト演習デモ（架空）</h2><p>AIに上手に指示（プロンプト）を出す練習をします。毎回、課題のプロンプトを書いて提出し、AIの一次採点と先生のコメントで見直します。</p><ul><li>目標: だれに・どんな長さ・どんな雰囲気を指定できるようになる</li><li>持ち物: ゴーグル（GOOVIS / Quest 3）</li></ul>" >/dev/null
echo "[OK] シラバスを設定"

# --- 成績マトリクス（16人×3課題。式で分散、一部は未採点で空欄） ---
echo "--- 成績を反映 ---"
graded=0
idx=0
for uid in "${STUDENT_IDS[@]}"; do
  s=$(( idx + 1 ))
  for j in 0 1 2; do
    aid="${ASSIGN_IDS[$j]:-}"
    [ -n "$aid" ] || continue
    # (s+j) が5の倍数のマスは未採点（空欄）にして「まだ」感を出す
    if [ $(( (s + j) % 5 )) -eq 0 ]; then continue; fi
    score=$(( ( (s * 7 + j * 13) % 41 ) + 55 ))  # 55〜95
    api PUT "/api/v1/courses/${COURSE_ID}/assignments/${aid}/submissions/${uid}" \
      --data-urlencode "submission[posted_grade]=${score}" >/dev/null
    graded=$(( graded + 1 ))
  done
  idx=$(( idx + 1 ))
done
echo "[OK] 成績反映 ${graded} 件"

cat <<EOS

=== 完了（すべて架空データ） ===
Canvasで確認（${BASE}）:
  - コース『プロンプト演習デモ（架空）』
    ・お知らせ / ディスカッション / シラバス
    ・課題（3件・締切つき）
    ・メンバー（受講生16名）
    ・評定（成績表が埋まる）
カスタム層で確認:
  - せんせい用メニュー →「クラス名簿」「成績サマリ」「成績入力」（Canvas実データ）
EOS

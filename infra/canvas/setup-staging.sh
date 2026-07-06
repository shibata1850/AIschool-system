#!/usr/bin/env bash
# Canvas LMS（OSS版）ステージング構築スクリプト
#
# 実行場所: さくらのクラウドのサーバー（Ubuntu 24.04 LTS想定）
# 前提:     docs/Canvasステージング構築手順.md を先に読むこと
# 方針:     Canvas本体のソースは本リポジトリに置かず、公式リポジトリを
#           バージョン固定でクローンする（CLAUDE.md 絶対ルール1: 本体無改変）
#
# 使い方:   bash setup-staging.sh
#           バージョン更新時は下の CANVAS_REF を変えてコミットする

set -euo pipefail

# ---- 固定するCanvasのバージョン（安定リリースブランチ） --------------------
# 一覧の確認: git ls-remote --heads https://github.com/instructure/canvas-lms.git
# 2026-07-06 時点の最新安定: stable/2026-05-20（docs/Canvas調査メモ.md）
CANVAS_REF="${CANVAS_REF:-stable/2026-05-20}"
CANVAS_REPO="https://github.com/instructure/canvas-lms.git"
CANVAS_DIR="${CANVAS_DIR:-$HOME/canvas-lms}"

echo "=== Canvas LMS ステージング構築 ==="
echo "  バージョン: ${CANVAS_REF}"
echo "  展開先:     ${CANVAS_DIR}"
echo ""

# ---- 1. 前提コマンドの確認 --------------------------------------------------
missing=0
for cmd in git docker; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[NG] ${cmd} が見つかりません"
    missing=1
  else
    echo "[OK] ${cmd}: $(command -v "$cmd")"
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  echo "[NG] docker compose（プラグイン）が見つかりません"
  missing=1
else
  echo "[OK] docker compose: $(docker compose version --short 2>/dev/null || echo あり)"
fi

if [ "$missing" -ne 0 ]; then
  cat <<'EOS'

不足しているものがあります。Ubuntuでは次で導入できます:
  sudo apt-get update
  sudo apt-get install -y git
  # Docker は公式手順（https://docs.docker.com/engine/install/ubuntu/）で導入
導入後にこのスクリプトを再実行してください。
EOS
  exit 1
fi

# ---- 2. 公式リポジトリをバージョン固定で浅くクローン ------------------------
if [ -d "${CANVAS_DIR}/.git" ]; then
  echo ""
  echo "[SKIP] ${CANVAS_DIR} は既にクローン済みです。バージョンを合わせます"
  git -C "${CANVAS_DIR}" fetch --depth 1 origin "${CANVAS_REF}"
  git -C "${CANVAS_DIR}" checkout FETCH_HEAD
else
  echo ""
  echo "公式リポジトリをクローンします（数分かかります）..."
  git clone --depth 1 --branch "${CANVAS_REF}" "${CANVAS_REPO}" "${CANVAS_DIR}"
fi
echo "[OK] クローン完了: $(git -C "${CANVAS_DIR}" rev-parse --short HEAD)（${CANVAS_REF}）"

# ---- 3. 以降はCanvas同梱のセットアップに委ねる ------------------------------
cat <<EOS

=== 次の手順（Canvas同梱ドキュメントに従う） ===

1. セットアップドキュメントを読む:
     ${CANVAS_DIR}/doc/docker/developing_with_docker.md

2. 同梱のセットアップスクリプトを実行する（対話式・時間がかかります）:
     cd ${CANVAS_DIR}
     ./script/docker_dev_setup.sh

3. 初回セットアップで管理者アカウントを作成したら、資格情報を
   パスワード管理台帳へ記録する（リポジトリへのコミット禁止）

4. 本リポジトリ側の接続設定へ進む:
     docs/Canvasステージング構築手順.md 3章
     （トークン発行 → CANVAS_BASE_URL / CANVAS_API_TOKEN 設定 → 接続確認）

注意:
- Canvasのソース（${CANVAS_DIR}）は編集しない（本体無改変 — CLAUDE.md 2章）
- 実受講生の個人情報をステージングに投入しない（架空値のみ）
- 作業は授業時間帯を避ける（メンテナンス窓: 日曜5:00-7:00）
EOS

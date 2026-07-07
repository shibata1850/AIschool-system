#!/usr/bin/env bash
# さくらのクラウド新規サーバーの一括初期セットアップ
#
# 用途: Ubuntu 24.04 の新品サーバーで1回だけ実行し、
#       システム更新 → Docker導入 → 本リポジトリ取得 → Canvas取得 まで自動で行う
# 使い方（サーバーにSSHログイン後、この2行だけ）:
#   curl -fsSL https://raw.githubusercontent.com/shibata1850/AIschool-system/claude/requirements-definition-suuul0/infra/canvas/bootstrap.sh -o bootstrap.sh
#   bash bootstrap.sh
#
# 完了後の手順（Canvas本体の対話式セットアップ）は最後に画面表示される

set -euo pipefail

REPO_URL="https://github.com/shibata1850/AIschool-system.git"
REPO_BRANCH="claude/requirements-definition-suuul0"
REPO_DIR="$HOME/AIschool-system"

# apt の対話プロンプト（紫色の画面）を出さない
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo "=== [1/4] システム更新（数分かかります） ==="
sudo -E apt-get update -q
sudo -E apt-get upgrade -y -q
sudo -E apt-get install -y -q git curl tmux

echo ""
echo "=== [2/4] Docker導入 ==="
if command -v docker >/dev/null 2>&1; then
  echo "[SKIP] Docker は導入済みです: $(docker --version)"
else
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

echo ""
echo "=== [3/4] 本リポジトリ（構築資材）の取得 ==="
if [ -d "${REPO_DIR}/.git" ]; then
  echo "[SKIP] 取得済み。最新化します"
  git -C "${REPO_DIR}" pull --ff-only origin "${REPO_BRANCH}"
else
  git clone --branch "${REPO_BRANCH}" "${REPO_URL}" "${REPO_DIR}"
fi

echo ""
echo "=== [4/4] Canvas LMS（公式・バージョン固定）の取得 ==="
bash "${REPO_DIR}/infra/canvas/setup-staging.sh"

cat <<'EOS'

============================================================
 一括セットアップ完了。残りはCanvas本体の対話式セットアップです
============================================================

1. いったんログアウトして入り直す（docker権限の反映に必要）:
     exit
     → もう一度 ssh でログイン

2. tmux（切断保護）の中でCanvasセットアップを実行（1〜2時間・対話式）:
     tmux
     cd ~/canvas-lms
     ./script/docker_dev_setup.sh

   ※ SSHが切れたら、再ログイン後に tmux attach で作業画面に戻れます
   ※ 管理者アカウントの資格情報はパスワード管理台帳へ（チャット・コミット禁止）
EOS

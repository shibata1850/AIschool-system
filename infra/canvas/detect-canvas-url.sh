#!/usr/bin/env bash
# CanvasのAPIに実際につながるURLを自動で見つけ、.env の CANVAS_BASE_URL を更新する。
# HTTPS化やポート移動で接続先が変わったときの復旧用。サーバー上で実行する。
# 実行: bash detect-canvas-url.sh

set -euo pipefail

ENV_FILE="${ENV_FILE:-$(cd "$(dirname "$0")/../.." && pwd)/.env}"
[ -f "${ENV_FILE}" ] || { echo "[NG] .env が見つかりません: ${ENV_FILE}"; exit 1; }
TOKEN="$(grep -E '^CANVAS_API_TOKEN=' "${ENV_FILE}" | head -1 | cut -d= -f2-)"
[ -n "${TOKEN}" ] || { echo "[NG] CANVAS_API_TOKEN が .env にありません"; exit 1; }

# 試す候補（よくある内部ポート＋公開HTTPS）。順に /api/v1/users/self を叩いて200を探す
CANDIDATES=(
  "http://localhost:8080"
  "http://127.0.0.1:8080"
  "http://localhost:80"
  "http://localhost:3080"
  "https://canvas.133-125-225-64.sslip.io"
)

echo "=== Canvas接続先を自動判定 ==="
GOOD=""
for url in "${CANDIDATES[@]}"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -H "Authorization: Bearer ${TOKEN}" "${url}/api/v1/users/self" || echo 000)"
  echo "  ${url} -> HTTP ${code}"
  if [ "${code}" = "200" ] && [ -z "${GOOD}" ]; then GOOD="${url}"; fi
done

if [ -z "${GOOD}" ]; then
  echo ""
  echo "[NG] つながるURLが見つかりませんでした。"
  echo "     'docker ps' でCanvasコンテナの PORTS を確認し、そのポートを CANDIDATES に足すか、"
  echo "     手動で .env の CANVAS_BASE_URL を設定してください。"
  echo "     参考: docker ps --format '{{.Names}}  {{.Ports}}'"
  exit 1
fi

echo ""
echo "[OK] つながるURL: ${GOOD}"
# .env の該当行を更新（デリミタは # ：URLに#は含まれない）
if grep -qE '^CANVAS_BASE_URL=' "${ENV_FILE}"; then
  sed -i "s#^CANVAS_BASE_URL=.*#CANVAS_BASE_URL=${GOOD}#" "${ENV_FILE}"
else
  echo "CANVAS_BASE_URL=${GOOD}" >> "${ENV_FILE}"
fi
echo "[OK] .env を更新しました:"
grep -E '^CANVAS_BASE_URL=' "${ENV_FILE}"

cat <<'EOS'

=== 次にやること ===
1) Canvasにリッチデータ投入:
     bash infra/canvas/seed-canvas-rich.sh
2) カスタム層を再起動（DEMO_RICH_SEED付き）:
     docker rm -f aischool-custom 2>/dev/null
     docker run -d --name aischool-custom --restart unless-stopped --network host --env-file .env \
       -e DEMO_RICH_SEED=1 \
       aischool-custom:latest npm start -- -H 127.0.0.1 -p 3001
EOS

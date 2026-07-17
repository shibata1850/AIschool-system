#!/usr/bin/env bash
# CanvasのLTIキー作成用の設定JSONを生成する。
#
# 背景: jupyterhub-ltiauthenticator が返す /hub/lti13/config には公開鍵(JWK)が
#       含まれず、JWKSエンドポイントも持たない。一方 Canvas はLTIキーに
#       「public jwk または public jwk url」を必須にするため、URL入力方式では
#       「developer key must have public jwk or public jwk url」で弾かれる。
# 対策: JupyterHub は Canvas へ署名を返さない（ログイン専用）ので、ダミーの
#       公開鍵を1つ埋めれば検証を通せる（この鍵は実際には使われない）。
#
# 使い方（サーバー上で実行）:
#   bash infra/jupyter/make-canvas-config.sh
#   → 出力されたJSONを、Canvasの開発者キー作成で
#     メソッド「JSONを貼り付け」に貼る。リダイレクトURIは別途入力する:
#     https://jupyter.133-125-225-64.sslip.io/hub/lti13/oauth_callback
#
# 公開URLはIPが変わったら引数で渡す: bash make-canvas-config.sh https://jupyter.<new>.sslip.io

set -euo pipefail

HUB_BASE="${1:-https://jupyter.133-125-225-64.sslip.io}"
CONFIG_URL="${HUB_BASE%/}/hub/lti13/config"

# ダミー公開鍵（RSA-2048・公開鍵なので秘匿不要）。JupyterHubはCanvasへ署名しないため未使用。
read -r -d '' PLACEHOLDER_JWK <<'JWK' || true
{
  "kty": "RSA",
  "e": "AQAB",
  "n": "sWF211jhT7hR1ZxRjfHxSOwyiQJUrLty5fW6tgIVma8VuZ85-976XvNjQHPLFOMNXg0Wki-D5qZHQdtq92JkckwkUZBJFa0usFbTtjx7KTuiW4FvSZbwDiXl1yZbHwa9m0gFOGfXhDBNvdb-XRZr9ea65vojJpsa4qE5TfLngR5cORBjsu0ScVBDdUC0hFloVAwcZckl21qD6fO5OfdH4Knf5UHykz22dLM2f_6KJgY680FrW3Yb-YWpJ-LOExYMFd0CkWhcHmeJ8uNTd_6KfPI4rNIOMazh7B3r_y63k2exJ8otDhVcJWkBUPhLY5CfPbLo20VZdruL05EHUCyT8w",
  "alg": "RS256",
  "use": "sig",
  "kid": "jupyterhub-placeholder-1"
}
JWK

echo "設定JSONを取得: ${CONFIG_URL}" >&2

curl -fsS "${CONFIG_URL}" \
  | JWK="${PLACEHOLDER_JWK}" python3 -c \
      "import sys,json,os; d=json.load(sys.stdin); d['public_jwk']=json.loads(os.environ['JWK']); print(json.dumps(d, ensure_ascii=False, indent=2))"

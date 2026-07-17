# JupyterHub（Hub本体）イメージ。
# 標準のJupyterHubに以下を追加する:
#  - dockerspawner            : 受講生ごとに独立コンテナを起動（環境分離）
#  - jupyterhub-ltiauthenticator : Canvas と LTI 1.3 でSSO（再ログイン不要）
# バージョンはメジャー固定（再現性のため）。上げる場合は動作確認のうえ変更する。
FROM quay.io/jupyterhub/jupyterhub:5

RUN python3 -m pip install --no-cache-dir \
      "dockerspawner>=13,<14" \
      "jupyterhub-ltiauthenticator>=1.6,<2"

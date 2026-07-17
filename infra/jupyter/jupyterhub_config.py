"""JupyterHub 設定（S4 演習環境）。

Canvas と LTI 1.3 でSSOし、受講生ごとに独立したノートブックコンテナを起動する。
同じCanvasを指すため、issuer/authorize/jwks/token はカスタム層 .env の値を流用する。
値は docker-compose.yml が環境変数として注入する（infra/jupyter/.env）。
"""

import os

c = get_config()  # noqa: F821  (JupyterHub が実行時に注入)

# =========================================================================
# ネットワーク公開
# 公開はCaddy(TLS)経由のみ。Hub/Proxy は 8000 で待ち受ける。
# =========================================================================
c.JupyterHub.bind_url = "http://:8000"

# =========================================================================
# スポナー: 受講生ごとに独立コンテナ（環境分離）— DockerSpawner
# =========================================================================
c.JupyterHub.spawner_class = "dockerspawner.DockerSpawner"
c.DockerSpawner.image = os.environ.get(
    "SINGLEUSER_IMAGE", "quay.io/jupyter/base-notebook:latest"
)
# Hub と受講生コンテナを同じ docker ネットワークに載せ、container名で解決させる
c.DockerSpawner.network_name = "jupyterhub-net"
c.JupyterHub.hub_connect_ip = "jupyterhub"  # 受講生コンテナから Hub へ戻る先（container名）
c.JupyterHub.hub_ip = "0.0.0.0"
# 終了したら受講生コンテナは破棄（資源節約）。作業は名前付きvolumeで永続化する。
c.DockerSpawner.remove = True
c.DockerSpawner.mem_limit = os.environ.get("SINGLEUSER_MEM_LIMIT", "512M")
c.DockerSpawner.notebook_dir = "/home/jovyan/work"
c.DockerSpawner.volumes = {"jupyterhub-user-{username}": "/home/jovyan/work"}

# =========================================================================
# 認証: Canvas と LTI 1.3（再ログイン不要のSSO）
#  - issuer/authorize/jwks/token はカスタム層と同じCanvasの値を流用
#  - client_id は JupyterHub専用の開発者キーの値（カスタム層とは別キー）
# =========================================================================
c.JupyterHub.authenticator_class = "ltiauthenticator.lti13.auth.LTI13Authenticator"
c.LTI13Authenticator.issuer = os.environ["LTI_ISSUER"]
c.LTI13Authenticator.client_id = [os.environ["JUPYTER_LTI_CLIENT_ID"]]
c.LTI13Authenticator.authorize_url = os.environ["LTI_AUTH_URL"]
c.LTI13Authenticator.jwks_endpoint = os.environ["LTI_JWKS_URL"]
# token_url はこのバージョンの LTI13Authenticator では未使用（AGS成績連携用・スコープ外）。
# 設定するとwarningになるため置かない。将来Jupyter側からAGSを使う場合に再検討する。
# 受講生の識別子: Canvasの安定ID（sub）をユーザー名にする。氏名・メールは使わない
# （個人情報を最小化 — CLAUDE.md 9章）。
c.LTI13Authenticator.username_key = "sub"

# LTIで認証されたユーザーは自動的に許可する（JupyterHub 5 は既定で全拒否のため明示）
c.Authenticator.allow_all = True

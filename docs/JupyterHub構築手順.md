# JupyterHub 構築手順（S4 演習環境）

- 目的: 受講生がCanvasから再ログインなしで自分のノートブック環境に入れるようにする（S4）
- 位置づけ: カスタム層側の画面・導線（`app/jupyter`）は実装済み。JupyterHub本体の構築は
  サーバー作業（Cowork）。当面はさくらにCPU版、9月に校内GPUサーバー（RTX 6000 Ada）へ移す
- 手動対応リスト: docs/手動対応リスト.md B1/B2

## 1. JupyterHub をDockerでさくらのサーバーにDVD構築（当面CPU）

1. さくらのサーバーで JupyterHub を起動（`jupyterhub/jupyterhub` イメージ、または
   The Littlest JupyterHub / Zero to JupyterHub）。受講生16名同時を見込む
2. スポナーは DockerSpawner 等で受講生ごとに独立コンテナ（環境分離）
3. Caddyでサブドメインを割り当ててHTTPS化（例 `jupyter.133-125-225-64.sslip.io`）

## 2. Canvas との LTI 1.3 連携（再ログイン不要）

JupyterHub を **Canvasの別のLTIツール**として登録する（カスタム層とは別の開発者キー）。

1. JupyterHub に `jupyterhub-ltiauthenticator`（LTI 1.3）を設定
   - Canvasの認可エンドポイント・JWKS・issuer・client_id・deployment_id を設定
2. Canvasで JupyterHub用のLTI開発者キーを作成（手順は docs/LTI連携手順.md と同様）
   - OIDC開始・リダイレクト・JWKS は JupyterHub 側のURL
   - 配置（Placement）: コースナビゲーション「Jupyter演習」
3. これで受講生はCanvas → JupyterHub がSSO（再ログインなし）

補足: カスタム層の S4 画面（`/jupyter`）は「演習をはじめる」リンクを表示するだけの導線。
リンク先をJupyterHubの起動URLにしてもよいし、Canvasのコースナビに JupyterHub を直接
置いてもよい（運用しやすい方）。

## 3. カスタム層の環境変数

```
# JupyterHubの起動URL（受講生の環境に入る入口）
JUPYTERHUB_URL=https://jupyter.133-125-225-64.sslip.io/hub/
# GPUサーバー停止時に案内する静的教材のURL（任意・F2例外3）
JUPYTER_FALLBACK_URL=
```

## 4. 9月（GPUサーバー搬入後）

- JupyterHub を校内GPUサーバー（HP Z4 G5 + RTX 6000 Ada）へ移設
- GPUを使う演習（画像・LLM等）のカーネル・ライブラリを用意
- 16名同時起動の負荷確認（要件: 演習系は16クライアント同時）
- GPUサーバー停止時のフォールバック（静的教材モード）の動作確認

## 5. 未対応・残課題

- 受講生ごとの起動進捗表示・カーネル再起動UIは、JupyterHub本体の機能で提供される
  （カスタム層は導線のみ）。必要ならカスタム層側に状態表示を追加する
- 認証conn: JupyterHubのLTIとカスタム層のLTIは別キー。将来、単一の入口に統合するかは運用判断

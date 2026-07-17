# JupyterHub 構築手順（S4 演習環境）

- 目的: 受講生がCanvasから再ログインなしで自分のノートブック環境に入れるようにする（S4）
- 位置づけ: カスタム層側の画面・導線（`app/jupyter`）は実装済み。JupyterHub本体の構築は
  サーバー作業（Cowork）。当面はさくらにCPU版で相乗り、9月に校内GPUサーバー（RTX 6000 Ada）へ移す
- 手動対応リスト: docs/手動対応リスト.md B1/B2

> **実行用の具体的な手順・設定ファイル一式は `infra/jupyter/` にまとめてある。**
> Cowork向けのステップ・バイ・ステップは `infra/jupyter/README.md` を参照。
> 本ドキュメントは背景と全体像の説明。

## 1. JupyterHub をDockerでさくらのサーバーに構築（デモは既存サーバーに相乗り）

構築ファイル: `infra/jupyter/`（Dockerfile・docker-compose.yml・jupyterhub_config.py・.env.example）

1. `docker compose up -d --build`（`infra/jupyter/`）でHubを起動
2. スポナーは DockerSpawner で受講生ごとに独立コンテナ（環境分離）
3. Caddyで `jupyter.133-125-225-64.sslip.io` → `127.0.0.1:8000`（`infra/reverse-proxy/Caddyfile` に追記済み）

※ デモ機は1コア1GBのため同時起動は1〜数名に絞る（メモリ）。演習時のみ一時スペックアップ推奨。

## 2. Canvas との LTI 1.3 連携（再ログイン不要）

JupyterHub を **Canvasの別のLTIツール**として登録する（カスタム層とは別の開発者キー）。
JupyterHub は **Configuration URL 方式**に対応しているので登録が簡単:

1. Canvasの開発者キー（LTI）作成で「URLを入力」を選び、
   `https://jupyter.133-125-225-64.sslip.io/hub/lti13/config` を貼る
2. リダイレクトURI: `https://jupyter.133-125-225-64.sslip.io/hub/lti13/oauth_callback`
3. 発行された client_id を `infra/jupyter/.env` の `JUPYTER_LTI_CLIENT_ID` に設定
4. コースに「By Client ID」で追加 → コースナビ「Jupyter演習」
5. これで受講生はCanvas → JupyterHub がSSO（再ログインなし）

issuer/authorize/jwks/token は**同じCanvas**を指すため、カスタム層 `.env` の
`LTI_ISSUER/LTI_AUTH_URL/LTI_JWKS_URL/LTI_TOKEN_URL` と同じ値を流用する。

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

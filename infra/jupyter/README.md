# JupyterHub 構築手順（S4 演習環境・デモ用）

Canvas と**同じさくらのサーバーに相乗り**でJupyterHubを立て、受講生がCanvasから
**再ログインなし（SSO）**で自分のノートブック環境に入れるようにする。

- 16名同時・本番は9月の校内GPUサーバーへ移設する前提（このデモは疎通確認と数名まで）
- サーバー作業は Cowork/多田さんがSSHで実行。CanvasでのLTIキー作成だけ柴田さまの作業
- 手動対応リスト: `docs/手動対応リスト.md` B1/B2

前提: IP `133.125.225.64` / Canvas は `canvas.133-125-225-64.sslip.io`（127.0.0.1:8080）/
Caddy が 80・443 を終端済み（`infra/reverse-proxy/Caddyfile`）。

---

## ⚠️ 事前確認: メモリ

デモ機は **1コア1GB** で、Canvas（Rails+PostgreSQL+Redis）が既に大半を使っている。
受講生コンテナ（`base-notebook`）は1つで数百MB使うため、**同時起動は1〜数名に絞る**こと。
安定してデモしたい場合は、演習の時間だけさくらのコントロールパネルでサーバーを
**一時的にスペックアップ**（例: 2コア4GB）し、終わったら戻すと安く済む。

---

## 手順1: サーバーにファイルを配置してHubを起動（Cowork）

```cmd
REM リポジトリを更新（infra/jupyter 一式が入る）
cd C:\path\to\AIschool-system
git pull

REM サーバー側（SSH）で infra/jupyter に移動し .env を用意
cp infra/jupyter/.env.example infra/jupyter/.env
REM ↓ .env を編集。LTI_ISSUER/LTI_AUTH_URL/LTI_JWKS_URL/LTI_TOKEN_URL は
REM   カスタム層の .env と「同じ値」をコピー。JUPYTER_LTI_CLIENT_ID は手順2で入れる
```

`JUPYTER_LTI_CLIENT_ID` は手順2でCanvasキーを作ってから入れる。先にHubだけ起動して
Configuration URL を出してもよい（client_id 未設定だと認証は失敗するが、`/hub/lti13/config`
は表示できる）。

```cmd
REM Hubをビルドして起動
cd infra/jupyter
docker compose up -d --build

REM ログ確認（LTI設定の読み込みエラーがないか）
docker compose logs -f jupyterhub
```

Caddy に Jupyter のルートを反映（`infra/reverse-proxy/Caddyfile` に追記済み）:

```cmd
REM Caddy を使っている場合（構成に合わせて）
docker compose -f infra/reverse-proxy/docker-compose.yml restart caddy
REM もしくは caddy reload
```

これで `https://jupyter.133-125-225-64.sslip.io/hub/lti13/config` が開ければ疎通OK
（JSONが返る）。この**Configuration URL**を手順2でCanvasに貼る。

---

## 手順2: CanvasでJupyterHub用のLTIキーを作成（柴田さま）

カスタム層とは**別の開発者キー**を作る。URL貼り付け方式なので簡単。

1. Canvas 管理 → **開発者キー（Developer Keys）** → 「+ 開発者キー」→ **LTIキー**
2. 「メソッド（Method）」で **URL を入力（Enter URL）** を選ぶ
3. **Configuration URL** に次を貼る:
   `https://jupyter.133-125-225-64.sslip.io/hub/lti13/config`
4. **リダイレクトURI（Redirect URIs）** に次を入れる:
   `https://jupyter.133-125-225-64.sslip.io/hub/lti13/oauth_callback`
5. キー名は「Jupyter演習」など。保存して**状態をON**にする
6. 一覧に出る **client_id（詳細欄の数字）** を控える → サーバーの
   `infra/jupyter/.env` の `JUPYTER_LTI_CLIENT_ID` に入れる
7. **Deployment ID** はコースにツールを追加すると発行される（手順3）。控えて連絡

> client_id を .env に入れたら、サーバーで `docker compose up -d` を再実行して反映。

---

## 手順3: コースにJupyter演習を追加（柴田さま）

1. デモコース → **設定 → アプリ（外部ツール）→ +アプリ**
2. 種別「By Client ID」→ 手順2の **client_id** を入力して追加
3. コースナビに「Jupyter演習」が出る（表示順・表示/非表示は設定で調整可）

これで受講生は **Canvas → 「Jupyter演習」クリック → 自分のノートブックが開く**（SSO）。

---

## 手順4: カスタム層の画面からも入れるようにする（任意）

カスタム層の S4 画面（`/jupyter`）の「演習をはじめる」ボタンの遷移先を設定する。
カスタム層の `.env` に追記して再起動:

```
JUPYTERHUB_URL=https://jupyter.133-125-225-64.sslip.io/hub/
```

Canvasのコースナビから直接入る運用なら、ここは未設定でもよい（画面は準備中案内を出す）。

---

## うまくいかないときの確認

- `/hub/lti13/config` がエラー → `docker compose logs jupyterhub` でLTI環境変数の欠落を確認
- Canvasから起動して「Forbidden/認証失敗」→ client_id の不一致、または issuer が
  カスタム層と違う値。カスタム層 `.env` と**同じ**LTI_ISSUER になっているか確認
- ノートブックが起動しない/落ちる → メモリ不足の可能性。`SINGLEUSER_MEM_LIMIT` を
  下げる（例 `256M`）か、サーバーを一時スペックアップ。同時起動人数を減らす
- 受講生コンテナが Hub に戻れない → Hub と single-user が同じ `jupyterhub-net` に
  載っているか（`docker network inspect jupyterhub-net`）

## 9月（GPUサーバー搬入後）

- `infra/jupyter` 一式を校内GPUサーバーへ移設（同じ compose でよい）
- `SINGLEUSER_IMAGE` をGPU対応イメージに、`SINGLEUSER_MEM_LIMIT` を引き上げ
- 16名同時起動の負荷確認（要件: 演習系は16クライアント同時）

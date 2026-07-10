# 暫定ドメイン＋HTTPS化手順（ドメイン購入なし）

- 目的: ドメインを買わずに、CanvasとカスタムP層を**正式なHTTPS**で公開する。
  LTI 1.3 の実機テスト（L4）と社内共有の前提を満たす
- 方式: **sslip.io**（無料の仮ドメイン・登録不要）＋ **Caddy**（Let's Encrypt自動取得）
- 位置づけ: 本番前の暫定。将来は独自ドメインに差し替えるだけ（Caddyfileのホスト名を変更）

## 得られるURL（例。IPは 133.125.225.64）

- カスタム層: `https://app.133-125-225-64.sslip.io`
- Canvas本体: `https://canvas.133-125-225-64.sslip.io`

sslip.io は `<label>.133-125-225-64.sslip.io` を自動的に `133.125.225.64` に解決する。
IPが変わらない限りホスト名は安定（＝LTI登録も維持できる）。

## 正直な限界

- sslip.io は公開の共有DNSサービス。**ステージング・デモ・LTI検証には十分**だが、
  本番は独自ドメイン推奨（信頼性・ブランド・レート制限の観点）
- Let's Encrypt には発行レート制限がある。証明書取得の試行を無闇に繰り返さない
- 誰でもURLを踏める公開状態になるため、**実受講生の個人情報は入れない**（架空データのみ）

## 手順（さくらのサーバー上・Coworkが実施）

### 1. パケットフィルタで 80/443 を全開放

- ACMEのHTTP-01チャレンジと配信のため、80と443をインターネットへ開ける（0.0.0.0/0）
- 既存の 3000（Basic認証nginx）は不要になるので停止してよい（Caddyに一本化）

### 2. Canvasとカスタム層を内部ポートへ

Caddyが 80/443 を使うため、両サービスは localhost の別ポートで待受けにする。

- Canvas: 現在 `127.0.0.1:80` → **`127.0.0.1:8080`** に変更（Canvasのdocker公開ポートを変更して再起動）
- カスタム層: 既に `127.0.0.1:3001`（変更不要）

### 3. Canvasの外部ドメインを設定

Canvasは生成するURL（LTIのissuer等）に自ホストのドメインを使う。Canvasの
ドメイン設定を `canvas.133-125-225-64.sslip.io` にする（Canvasの設定ファイル/管理画面。
dockerの構成により手順が異なるため、Canvas同梱ドキュメントに従う）。設定後に再起動。

### 4. Caddyを起動（本リポジトリのCaddyfileを使用）

```
docker rm -f aischool-proxy 2>/dev/null || true   # 旧nginxを撤去
docker run -d --name aischool-caddy --restart unless-stopped \
  --network host \
  -v ~/AIschool-system/infra/reverse-proxy/Caddyfile:/etc/caddy/Caddyfile:ro \
  -v caddy_data:/data -v caddy_config:/config \
  caddy:2
```

Caddyが起動すると、2つのホスト名の証明書を自動取得する（初回は数十秒）。
`docker logs aischool-caddy` で `certificate obtained` を確認。

### 5. 動作確認

- `https://app.133-125-225-64.sslip.io/` がHTTPSで開く（鍵マーク）
- `https://canvas.133-125-225-64.sslip.io/login` がHTTPSで開く

## 5. カスタム層の .env（HTTPS前提の値に更新）

社内共有・LTIのため、必要に応じて更新（コミット禁止）:

```
# LTI 1.3（docs/LTI連携手順.md。Canvas開発者キー登録後に）
LTI_ISSUER=https://canvas.133-125-225-64.sslip.io
LTI_TOOL_URL=https://app.133-125-225-64.sslip.io
LTI_AUTH_URL=https://canvas.133-125-225-64.sslip.io/api/lti/authorize_redirect
LTI_JWKS_URL=https://canvas.133-125-225-64.sslip.io/api/lti/security/jwks
LTI_TOKEN_URL=https://canvas.133-125-225-64.sslip.io/login/oauth2/token
LTI_CLIENT_ID=<Canvas開発者キーのClient ID>
LTI_DEPLOYMENT_ID=<Deployment ID>
LTI_SESSION_SECRET=<openssl rand -base64 48 で生成>
```

`.env` 更新後はカスタム層コンテナを再起動する。

## 6. 社内共有について

- Caddyで公開されるので、**URLを送れば誰でもHTTPSで閲覧可能**（Basic認証は撤去）
- 講師・管理者画面を見せるには、LTI未設定の間はロールCookieが必要
  （本番はCanvasログインで自動判定。デモ用ロール切替UIを付ける案は別途）
- 繰り返し: **架空データのみ**。実個人情報はLTI＋運用体制が整うまで入れない

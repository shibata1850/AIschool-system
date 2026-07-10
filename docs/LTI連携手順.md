# LTI 1.3 連携手順（Canvas ⇄ カスタム層）

- 目的: 受講生・講師がCanvasにログインすると、カスタム層のツール（AI講師・演習・
  ダッシュボード）がCanvasの中から起動し、**本人・ロールがCanvasから自動判定**される
- 位置づけ: これが本番の認証。現在のロールCookieは開発・デモ用の暫定
- 前提（重要）: LTI 1.3の起動はブラウザのリダイレクトを伴うため、**CanvasとカスタムP層の
  両方がブラウザから到達でき、HTTPSであること**が必要（Canvasの開発者キーはhttpsのURLを
  要求する）。よってLTIの実機テストはTLS化・外部公開とセットで行う

## 1. カスタム層側のエンドポイント（実装済み）

| 役割 | パス |
|---|---|
| OIDCログイン開始 | `/api/lti/login` |
| 起動（id_token検証） | `/api/lti/launch` |
| 公開鍵JWKS | `/api/lti/jwks` |

## 2. Canvasでの開発者キー登録（管理者）

1. 管理者 → 開発者キー →「+ 開発者キー」→「+ LTIキー」
2. 手動設定（またはJSON）で以下を入力（`<APP>` はカスタム層の公開URL、例
   `https://app.example.jp`）:
   - Target Link URI: `<APP>/`（起動後の既定遷移先）
   - OpenID Connect 開始URL: `<APP>/api/lti/login`
   - Redirect URIs: `<APP>/api/lti/launch`
   - 公開JWK URL（JWK Method = Public JWK URL）: `<APP>/api/lti/jwks`
   - プライバシーレベル: `public`（氏名・ロールを渡す。個人情報最小化と整合させる）
3. 配置（Placements）: 「コースナビゲーション」等、ツールを出す場所を指定
   （Target Link URI を画面別に上書き可。例: 演習は `<APP>/exercises/...`）
4. キーを **ON** にし、発行された **Client ID** を控える
5. コース（またはアカウント）の「外部アプリ」で Client ID を入力してインストール
   → 発行される **Deployment ID** を控える

## 3. カスタム層側の環境変数（.env）

Canvasの値を `.env` に設定する（コミット禁止 — CLAUDE.md 2章）。セルフホストCanvasの
標準的なエンドポイントは次の形（`<CANVAS>` はCanvasの公開URL）:

```
LTI_ISSUER=<CANVAS>
LTI_CLIENT_ID=<開発者キーのClient ID>
LTI_AUTH_URL=<CANVAS>/api/lti/authorize_redirect
LTI_JWKS_URL=<CANVAS>/api/lti/security/jwks
LTI_TOKEN_URL=<CANVAS>/login/oauth2/token
LTI_TOOL_URL=<APP>
LTI_DEPLOYMENT_ID=<Deployment ID>
LTI_SESSION_SECRET=<十分に長いランダム値>
```

`LTI_SESSION_SECRET` の生成例（サーバー上）:

```
openssl rand -base64 48
```

（`LTI_PRIVATE_KEY` / `LTI_KEY_ID` は LTI Advantage サービス〔成績・名簿のサービス
呼び出し〕を使う場合のみ。基本の起動には不要。成績反映は当面 REST API を使う）

## 4. 動作の流れ（実装済みのフロー）

1. 受講生がCanvasでツールのリンクを開く
2. Canvas → `/api/lti/login`（iss・login_hint等）。ツールは state/nonce を生成して
   Cookieに保存し、Canvasの認可URLへ転送
3. Canvasが利用者を認証し、`id_token`（JWT）を `/api/lti/launch` へ form_post
4. ツールは state を突合し、id_token を **CanvasのJWKSで署名検証**（iss・aud・nonce・
   message_type・deployment_id も確認）
5. 検証OKなら本人（Canvas利用者ID）とロールを取り出し、**署名付きセッションCookie**を
   発行して目的の画面へ遷移

## 5. 未対応（次段階 L3・L4）

- 画面・APIのロール判定を、ロールCookieからLTIセッションへ切り替える（proxy.ts / auth.ts）
- Canvasに開発者キーを登録し、TLS化・外部公開のうえで実機の起動テスト
- 成績・名簿のLTI Advantageサービス化（当面は REST API で代替）

## 6. 注意

- LTIの一時Cookie（state/nonce）は SameSite=None; Secure。**HTTPSでないと送られない**
- `LTI_SESSION_SECRET` と `LTI_PRIVATE_KEY` は秘密情報。コミット・ログ出力禁止
- プライバシーレベルで氏名を渡すため、ログ・監査には氏名を残さない（IDのみ）

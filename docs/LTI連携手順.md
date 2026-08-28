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
   - **カスタムフィールド（必須）**: `canvas_user_id=$Canvas.user.id`
     — LTIの `sub` はCanvas REST APIの数値IDと別値のため、成績書き戻し（F3①）に必要。
     未設定だと採点は成立するがCanvas成績表へ反映されず、S7に「Canvas未反映」として残る
3. 配置（Placements）: 「コースナビゲーション」等、ツールを出す場所を指定
   （Target Link URI を画面別に上書き可。例: 演習は `<APP>/exercises/...`）
4. キーを **ON** にし、発行された **Client ID** を控える
5. コース（またはアカウント）の「外部アプリ」で Client ID を入力してインストール
   → 発行される **Deployment ID** を控える

## 3. カスタム層側の環境変数（.env）

Canvasの値を `.env` に設定する（コミット禁止 — CLAUDE.md 2章）。セルフホストCanvasの
標準的なエンドポイントは次の形（`<CANVAS>` はCanvasの公開URL）:

> **⚠ `LTI_ISSUER` は `<CANVAS>` とは限らない（2026-08-27 追記）**
> `LTI_ISSUER` は「Canvasの公開URL」ではなく、**Canvasが id_token の `iss` として
> 実際に送ってくる値**を設定する。CanvasはOSS版・セルフホストであっても
> `https://canvas.instructure.com` を既定の issuer として送ることがあり、
> ホスト名（例: `https://canvas.133-125-225-64.sslip.io`）とは一致しない。
> 本番環境の実値は `https://canvas.instructure.com`（2026-07-10のLTI実機起動成功時
> から使用。2026-08-27にプローブで再確認）。
> 実値の調べ方は下の「6. トラブルシューティング」を参照。

```
LTI_ISSUER=<Canvasが送るiss。<CANVAS>とは限らない — 上の注意を参照>
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

## 6. トラブルシューティング（2026-08-27 追記）

### 設定値をブラウザ無しで確認する（プローブ）

`/api/lti/login` は設定不備をそのまま応答で返すため、curl だけで設定値を照合できる。
副作用は一時Cookie（state/nonce）の発行のみ。

**プローブA — 設定中の issuer を表示させる**（わざと違う `iss` を送る）:

```
curl -s "<APP>/api/lti/login?iss=PROBE&login_hint=x&target_link_uri=x"
```

- `400` ＋「設定(LTI_ISSUER): ...」→ その値が現在の設定。Canvasの実 `iss` と突合する
- `501「LTI連携は未設定です」` → 必須5変数（ISSUER/CLIENT_ID/AUTH_URL/JWKS_URL/TOOL_URL）
  のいずれかが空

**プローブB — 残りの設定値を Location から確認する**:

```
curl -s -o /dev/null -D- "<APP>/api/lti/login?iss=<プローブAで判明したissuer>&login_hint=probe&target_link_uri=<APP>/"
```

`302` の `location` に `LTI_AUTH_URL`・`client_id`・`redirect_uri`（＝`LTI_TOOL_URL`由来）
が含まれる。Canvasの開発者キー画面の値と一致するか確認する。

**プローブC — CanvasのJWKSへ到達できるか**: `curl -s -o /dev/null -w "%{http_code}" <LTI_JWKS_URL>` → 200

> issuer・client_id・認可URL・redirect_uri は**秘密情報ではない**（実起動時に
> ブラウザのURLに現れる公開値）。`LTI_SESSION_SECRET` 等の秘密値とは扱いを分ける。

**プローブで確認できないもの**（実起動が必要）: `LTI_DEPLOYMENT_ID` の一致・
`LTI_SESSION_SECRET` の妥当性・ロール写像。**プローブが全て通っても疎通の証明にはならない**。
また、匿名アクセスが `/chat` で403になるのはLTI設定の有無に関わらず正しい挙動なので、
これも疎通の根拠にはならない。

### 起動が失敗したときの切り分け（応答で原因が分かる）

| 応答 | 原因 | 対処 |
|---|---|---|
| 501「LTI連携は未設定です」 | 必須5変数のいずれかが空 | `.env` を確認して再起動 |
| 500「LTI_SESSION_SECRET が未設定です」 | 署名鍵が空 | `openssl rand -base64 48` で設定 |
| 400「issuer が設定と一致しません」 | `LTI_ISSUER` の誤り | 応答に受信値・設定値の両方が出るので合わせる |
| 400「起動の照合に失敗しました」 | state/nonce Cookieが届いていない | HTTPS経由か・SameSite=None・時計ずれ・10分の期限切れを確認 |
| 401「deployment_id が一致しません」 | Canvasで再インストールしDeployment IDが変わった | Canvasの外部アプリ画面で現在の値を確認し `LTI_DEPLOYMENT_ID` を更新 |
| 401（その他） | id_token検証の失敗 | client_id・JWKS URL・署名アルゴリズムを確認 |

## 7. 注意

- LTIの一時Cookie（state/nonce）は SameSite=None; Secure。**HTTPSでないと送られない**
- `LTI_SESSION_SECRET` と `LTI_PRIVATE_KEY` は秘密情報。コミット・ログ出力禁止
- プライバシーレベルで氏名を渡すため、ログ・監査には氏名を残さない（IDのみ）
- 本番のClient IDはカスタム層 `10000000000002` / JupyterHub `10000000000003`（別ツール
  として個別に登録されている。手動対応リストB2参照）

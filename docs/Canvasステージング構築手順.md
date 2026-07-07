# Canvas LMS（OSS版）ステージング構築手順

- 対象: 要件定義書F1のステージング環境（未決事項#2のホスティング先確定後に実施）
- 前提: Canvas LMSはオープンソース版を使用し、本体は改変しない（CLAUDE.md 2章）
- 読者: SOFTDOING担当者（専任情シスなしの前提。判断が必要な箇所は【要判断】と明記）

## 1. 必要なもの

- ホスティング先のサーバー（【要判断】さくらのクラウド or AWS — docs/未決事項.md #2）
  - 目安: 4vCPU / メモリ8GB以上 / ディスク50GB以上（要件定義書F1の仮構成）
- Docker と Docker Compose が使えること
- ドメインとTLS証明書（受講生がブラウザでアクセスするため必須）

## 2. Canvas本体の構築

Canvas LMSの公式リポジトリ（instructure/canvas-lms）の手順に従う。
バージョンにより手順が変わるため、必ずリポジトリ同梱のドキュメントを正とする:

構築の実行部は **`infra/canvas/setup-staging.sh`** に用意済み（サーバー上で
`bash setup-staging.sh` を実行するだけ。動作確認済み）。行うことは:

1. 公式リポジトリを**バージョン固定で**取得する（2026-07-06時点の固定先:
   `stable/2026-05-20`。本体は改変しないため fork せず clone のみ。
   **Canvasのソースを本リポジトリや自組織のGitHubへコピーしない** —
   セキュリティ更新の追従責任を抱え込むため）
2. Canvas同梱の `doc/docker/`（`developing_with_docker.md`・
   `./script/docker_dev_setup.sh`）に従って Rails・PostgreSQL・Redis の
   コンテナ群を起動する
3. 初回セットアップで管理者アカウントとルートアカウント名を設定する
   （管理者のメール・パスワードは架空値でなく実運用値。パスワード管理台帳へ）
4. 授業時間帯（平日夕方〜夜・土日）を避けて作業する。メンテナンス窓は
   日曜5:00-7:00（要件定義書F1例外4）

バージョン更新は `setup-staging.sh` 内の `CANVAS_REF` を変えてコミット
（いつ・どの版に上げたかをgit履歴で追える）。

【注意1】`doc/docker/` の構成は開発・検証向け。本番（10月開校）は公式の
Production Start ガイドに沿って再構築し、バックアップ（日次スナップショット
＋7日保持 — 要件定義書8章）を必ず設定する。

【注意2】Docker Hub の `instructure/canvas-lms` イメージは約7年更新されて
おらず使用しない。コミュニティ製イメージも非公式のため採用しない。
**保守された公式本番イメージは存在しない**ので、ステージングは上記の同梱
docker-compose 構成、本番はリポジトリ同梱 `Dockerfile` からの自前ビルドとする
（調査根拠: docs/Canvas調査メモ.md 6章）。

【注意3】セルフホストでも**レート制限が既定で有効**（超過時は403）。カスタム層
からの応答判別を単純にするため、ステージング構築時に管理コンソールで
`request_throttle.send_429_response=true` を設定し、429を返す構成にする
（調査メモ2章。カスタム層クライアントは403/429どちらでも再試行する実装済み）。

## 3. カスタム層（本リポジトリ）との接続設定

### 3.1 REST API トークンの発行

1. Canvasに管理者でログイン → アカウント → 設定
2. 「承認済み統合（Approved Integrations）」で「新しいアクセストークン」を発行
   - 用途欄: 「LMSカスタム層（学習ログ収集・成績反映）」
   - 有効期限: 【要判断】無期限にせず、学期ごとの更新を推奨
3. 発行されたトークンを本リポジトリの `.env` に設定する（コミット禁止）:

```
CANVAS_BASE_URL=https://<ステージングのドメイン>
CANVAS_API_TOKEN=<発行したトークン>
```

### 3.2 接続確認

トークンが有効かをcurlで確認する（自分のユーザー情報が返ればOK）:

```cmd
curl -H "Authorization: Bearer %CANVAS_API_TOKEN%" %CANVAS_BASE_URL%/api/v1/users/self
```

カスタム層のクライアント実装は `src/lib/canvas/client.ts`
（接続確認 getSelf / コース一覧 / 受講生名簿 / 提出一覧 / 成績反映。
全一覧はLinkヘッダーで全ページ取得、レート制限時は自動再試行）。

### 3.3 LTI 1.3 の開発者キー登録（AIチャット・演習ツールの埋め込み用）

1. 管理者 → 開発者キー →「+ 開発者キー」→「+ LTIキー」
2. JSON設定に次の必須フィールドを入れる（値はLTI実装時に確定）:
   `title` / `description` / `target_link_uri` / `oidc_initiation_url` /
   `public_jwk`（または `public_jwk_url`）/ extensions 内 `privacy_level`
3. キーの状態を **ON** に切り替える
4. コース（またはアカウント）の「外部アプリ」で **Client ID** を入力してインストール

カスタム層側で用意する3エンドポイント（LTI実装タスク）:
(a) OIDCログイン開始URL、(b) target link URI（id_token JWTの検証・起動）、
(c) JWKSエンドポイント（公開鍵セット）。詳細は docs/Canvas調査メモ.md 7章

### 3.4 出席データの方針

Canvas本体に出席用REST APIは**存在しない**（公式のRoll Call AttendanceはLTI別体で、
セルフホストでは自前デプロイ＋S3互換ストレージが必要になり16名規模には過大）。
出席はカスタム層で独自管理し、必要に応じて成績としてCanvasへ書き戻す方針を推奨
（docs/未決事項.md #11、調査メモ5章）。

## 4. 接続後にカスタム層側で行う作業（開発タスク）

1. `src/lib/f3/store.ts` のインメモリ実装をCanvas接続実装へ差し替え
   （検索・更新はヘルパーに集約済み。`docs/実装状況.md` の置換点一覧を参照）
2. ロールCookie（`proxy.ts` / `src/lib/auth.ts`）をLTI 1.3ログインへ差し替え
3. ステージングに対するE2Eの実行（テストデータは架空受講生のみ — CLAUDE.md 2章）
4. 16クライアント模擬負荷の実施（docs/テスト計画書.md 4章）

## 5. トラブルシューティング（構築時の既知問題）

### Bundle install が「write permissions」エラーで失敗する

- 症状: `There was an error while trying to write to /usr/src/app/Gemfile.lock ...
  grant write permissions` で `docker_dev_setup.sh` が停止する
- 原因: コンテナ内ユーザー（uid 9999）がホスト側のマウント先へ書き込めない
  （Linux実機の既知問題。公式 doc/docker/developing_with_docker.md の
  Troubleshooting > Permissions）
- 対処（2026-07-07 実サーバーで発生・この手順で解消）:

```
sudo chmod -R a+rwX ~/canvas-lms
cd ~/canvas-lms
./script/docker_dev_setup.sh
```

- 恒久対策: `infra/canvas/setup-staging.sh` がクローン直後に権限調整を行う
  よう修正済み（再構築時は再発しない）

### Yarn install が xsslint の 404 で失敗する

- 症状: `Yarn install [FAIL]`、ログに
  `codeload.github.com/instructure/xsslint/tar.gz/<sha>: 404 Not Found`
- 原因: Canvasが開発用リンター `xsslint` を固定コミットで参照しているが、
  そのコミットが上流（instructure/xsslint の babel7 ブランチ）から削除され、
  取得不能になっている（2026-07-07 時点で `stable/2026-05-20` に発生）
- 影響: `xsslint` は `lint:xss`（開発時のXSS静的チェック）専用で、Canvasの
  動作・API・LTIには**一切不要**。除去してもステージングの動作に影響なし
- 対処（実サーバーでこの手順で解消）:

```
cd ~/canvas-lms
python3 -c "import json; p=json.load(open('package.json')); p.get('devDependencies',{}).pop('xsslint',None); p.get('dependencies',{}).pop('xsslint',None); json.dump(p, open('package.json','w'), indent=2, ensure_ascii=False); open('package.json','a').write('\n')"
awk '/^xsslint@instructure\/xsslint#babel7:/{s=1} s{if($0==""){s=0}; next} {print}' yarn.lock > yarn.lock.tmp && mv yarn.lock.tmp yarn.lock
./script/docker_dev_setup.sh
```

- 恒久対策: `infra/canvas/setup-staging.sh` がクローン後に、この参照が
  残っている場合のみ自動で除去する（冪等。参照が生きている版では何もしない）
- 補足: これはCanvasの機能変更ではなく上流の壊れた依存への回避であり、
  「本体を改変しない」規約（CLAUDE.md 2章）の趣旨には反しない

## 6. やってはいけないこと

- Canvas本体ソースの改変・フォーク（CLAUDE.md 絶対ルール）
- アクセストークン・DBパスワードのリポジトリへのコミット
- 実受講生の個人情報をステージングに投入すること（架空値のみ）
- 授業時間帯のCanvas更新・再起動

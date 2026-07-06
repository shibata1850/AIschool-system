# Canvas LMS（OSS版）調査メモ

- 調査日: 2026-07-06
- 方法: instructure/canvas-lms リポジトリの一次ソース（`doc/api/*.md`・コントローラのAPIドキュメントコメント・ミドルウェア実装）を精読して検証
- 位置づけ: `src/lib/canvas/client.ts` と `docs/Canvasステージング構築手順.md` の設計根拠。仕様の正はCanvasリポジトリ同梱ドキュメント

## 1. ページネーション（実装済み）

- 一覧APIは既定 **10件/ページ**。`?per_page=` で変更可、上限は **100**（`lib/api.rb` の `MAX_PER_PAGE`）
- 次ページは **`Link` ヘッダー**の `rel="next"` で返る。`next` の不在が最終ページの判定
- LinkのURLは**不透明（opaque）として全パラメータ込みでそのまま辿る**。ページ番号の自前組み立ては禁止
- ヘッダー名は大文字小文字を区別せず読むこと
- → `client.ts` の `requestAllPages` に実装済み（`per_page=100`＋`rel="next"` 追跡＋自ホスト限定＋上限50頁）
- 出典: `doc/api/pagination.md` / `lib/api.rb`

## 2. レートリミット（実装済み）

- **セルフホストでも既定で有効**（`RequestThrottle`、`request_throttle.enabled` 既定 `"true"`）
- Leaky bucket 方式: 閾値 `hwm`=600、流出 10/秒。コストはCPU/DB時間ベース（`X-Request-Cost`）
- 超過時は**既定 403**（`request_throttle.send_429_response=true` で429に変更可）。
  `X-Rate-Limit-Remaining` が `0.0` になる。**クォータはアクセストークン単位**
- → `client.ts` に「403/429＋Remaining≦0 のときだけ指数バックオフ再試行（最大2回）」を実装済み。
  権限エラーの403は再試行しない
- 運用推奨: ステージングで `request_throttle.send_429_response=true` を設定し429に正規化。
  学習ログの一括取得は直列または少並列で行う
- 出典: `app/middleware/request_throttle.rb` / `doc/api/throttling.md`

## 3. 提出・成績（実装との整合確認済み）

- 一覧: `GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions`
  （`include[]=submission_history,rubric_assessment,user` 等が指定可）
- 採点: `PUT .../submissions/:user_id` に `submission[posted_grade]`（文字列）＋
  `comment[text_comment]` — `client.ts` の `gradeSubmission` の形式と一致
- 出典: `app/controllers/submissions_api_controller.rb`

## 4. 受講生名簿（実装済み）

- `GET /api/v1/courses/:course_id/users?enrollment_type[]=student` で受講生のみ取得
  （講師・TA・オブザーバーを除外）。`include[]=enrollments` で成績同時取得も可能
- 名簿＋成績を1リクエストで取るなら `include[]=enrollments` が効率的。ただし
  `email` 等の include は個人情報最小化（CLAUDE.md 9章）のため必要最小限にする
- 別法: `GET /api/v1/courses/:course_id/enrollments?type[]=StudentEnrollment`
- 出典: `app/controllers/courses_controller.rb` / `enrollments_api_controller.rb`

## 5. 出席（重要: コアAPIが存在しない）

- **Canvas本体に出席用REST APIはない**。出席は「Roll Call Attendance」という**別体のLTIツール**
- Roll Call は初回記録時に「Roll Call Attendance」という100点満点の課題を自動作成し、
  出席率を成績として書き戻す → 統合側はこの課題の Submissions API で出席スコアを読める
- ただしセルフホストでは Roll Call の**自前デプロイが必要**
  （Rails＋Postgres＋Redis＋**S3互換ストレージ必須**、LTI 1.1世代）。16名規模には運用が重い
- **推奨: 出席はカスタム層（自作LTIツール側）で独自管理**し、必要なら成績としてCanvasへ
  書き戻す。参照実装の出席記録（lessonRecords）はこの方針と整合する
- → 判断は docs/未決事項.md #11 に登録
- 出典: instructure/rollcall-attendance リポジトリ / Instructure コミュニティ記事

## 6. Docker構成（構築手順に反映済み）

- リポジトリ同梱の `doc/docker/` は**開発・検証向け**（`./script/docker_dev_setup.sh`）
- Docker Hub の `instructure/canvas-lms` 公式イメージは**約7年更新されておらず利用非推奨**。
  コミュニティイメージも非公式
- 結論: **保守された公式本番イメージは存在しない**。ステージングはリポジトリ同梱の
  docker-compose 開発構成、本番はリポジトリの `Dockerfile` からの自前ビルドを
  IaC化する（本体無改変のまま更新追従できる形にする）

## 7. LTI 1.3 登録の最小手順（構築手順に反映済み）

1. 管理者が Developer Key → **LTIキー**を作成。必須フィールド:
   `title` / `description` / `target_link_uri` / `oidc_initiation_url` /
   `public_jwk`（または `public_jwk_url`）/ extensions 内 `privacy_level`
2. キーを **ON** に切替
3. コース／アカウントの External Apps に **`client_id`** を入力してインストール
- ツール（カスタム層）側の実装必須3エンドポイント:
  (a) OIDCログイン開始URL、(b) target link URI（id_token JWT検証・起動）、
  (c) JWKSエンドポイント（公開鍵セット）
- 出典: `doc/api/lti_dev_key_config.md`

## 8. APIトークン

- ヘッダー形式は `Authorization: Bearer <token>`（クエリパラメータより推奨）
- 手動発行: プロフィール設定 → 承認済み連携 → 新しいアクセストークン（セルフホストで利用可）
- マルチユーザー化する場合は OAuth2（Developer KeyはOSS版では Site Admin で発行。
  OAuth2トークンは1時間で失効し refresh token で更新）
- 手動発行トークンの有効期限未設定時の挙動は未確認（発行時に必ず期限を設定する運用とする）
- 出典: `doc/api/oauth.md`

# AIschool-system

Next Gen AI School LMSカスタム層の**参照実装**（SOFTDOING内部バックアップ）。

- 位置づけ: `CLAUDE.md` 10章の役割分担に基づく内部成果物。正式な開発・納品主体は有限会社ノーティ（見積No.13020653）であり、本リポジトリの成果物をノーティ委託分として計上・報告しない
- 仕様: `docs/要件定義書.md`（正本）、`docs/画面仕様書.md`、`docs/テスト計画書.md`
- 未決事項・要望: `docs/未決事項.md` / `docs/要望リスト.md`

## 技術構成

- Next.js（App Router）+ TypeScript — LTI 1.3ツール・ダッシュボードのカスタム層
- AI推論: 抽象化レイヤー `src/lib/ai/`（`AI_PROVIDER=mock | claude | local` で切替。未決事項#3）
- テスト: Playwright（E2E）+ Vitest（単体）

## 開発コマンド

```cmd
npm install
npm run dev          … 開発サーバー起動（http://localhost:3000）
npm run typecheck    … 型チェック
npm run test:unit    … 単体テスト（Vitest）
npm run test:e2e     … E2Eテスト（Playwright。初回は npx playwright install が必要）
npm run build        … 本番ビルド
```

- 環境変数は `.env.example` を `.env` にコピーして設定する（`.env` はコミット禁止）
- Chromiumがプリインストールされた環境では `PLAYWRIGHT_CHROMIUM_PATH=<chromiumのパス>` を指定するとダウンロード不要でE2Eを実行できる

## 開発規約

`CLAUDE.md` を必ず読むこと。特に:

- Canvas LMS本体の改変禁止（LTI 1.3 + REST APIのみ)
- E2Eテストなしのコミット禁止（機能コードと同一コミット）
- 実個人情報をコード・テストデータに含めない
- UIテキストはすべて日本語（GOOVIS/Quest 3/NearHub/モバイルモニターの4デバイス制約に従う）

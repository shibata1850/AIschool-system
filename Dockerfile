# カスタム層のコンテナイメージ（さくらのクラウド移管用 — docs/ホスティング方針.md）
# Vercelはこのファイルを使わずリポジトリを直接ビルドするため、両立する
#
# 【重要】本番イメージに開発用パッケージを入れない（2026-08-31）
# 以前は builder の /app をまるごとコピーしていたため、@playwright/test・vitest・
# typescript・drizzle-kit・tsx とその依存ツリーが本番イメージに同梱されていた。
# これらは本番で1行も実行されないのに、Trivyの検出件数の大半を占めていた
# （drizzle-kit が引きずる esbuild 0.18.20 など、Goバイナリのstdlibだけで49件）。
# 対策として、実行に必要なものだけを最終イメージへコピーする。
# 詳細は docs/セキュリティ検証.md「イメージの脆弱性」。

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 運用スクリプト（マイグレーション・シード・週次レポート）を素のJSへ事前コンパイルする。
# こうすると実行時に tsx / drizzle-kit が不要になる（外部依存は pg と drizzle-orm のみ＝
# どちらも本番依存）。scripts/*.ts のままだと実行に tsx が要り、tsx は esbuild の
# Goバイナリを持ち込む。
RUN npx esbuild scripts/migrate.ts scripts/seed.ts scripts/generate-weekly-report.ts \
      --bundle --platform=node --format=esm --target=node22 \
      --packages=external --alias:@=./src \
      --outdir=dist-scripts --out-extension:.js=.mjs

# 本番依存だけを残す（@playwright/test・vitest・typescript・tsx・drizzle-kit・@types/* が消える）
RUN npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# ベースイメージのOSパッケージを最新へ（libssl3/libcrypto3 等。`--pull` だけでは
# イメージ内のapkパッケージまでは新しくならないため、ここで更新する）
RUN apk upgrade --no-cache

# **同梱の npm CLI を削除する。**
# npm 自身が抱える依存（tar・pacote・sigstore・picomatch・ip-address・
# brace-expansion）が Critical 1 / High 10 の発生源で、上流の node:22-alpine が
# 更新するまで `--pull` では消えない。本イメージで npm が要るのは起動コマンドだけ
# なので、Next を直接起動する形にして npm ごと外す。
# 運用スクリプトは `node dist-scripts/*.mjs` で動くため npm/npx に依存しない。
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# 実行に必要なものだけを個別にコピーする。src/・e2e/・テスト設定は本番に不要なので入れない
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist-scripts ./dist-scripts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
# `npm start` は使えない（npmを削除したため）。Nextを直接起動する
CMD ["node", "node_modules/next/dist/bin/next", "start"]

# カスタム層のコンテナイメージ（さくらのクラウド移管用 — docs/ホスティング方針.md）
# Vercelはこのファイルを使わずリポジトリを直接ビルドするため、両立する

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]

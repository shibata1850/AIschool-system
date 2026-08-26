import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// DB接続系テスト（f3/store, audit/log 等）が使うDATABASE_URL等を .env.test から読み込む。
// .env.test はコミットしない（.env.test.example が見本）。無ければ何もしない
// （DB非依存のテストのみ実行する分には支障ない）。
const envTestPath = path.resolve(__dirname, ".env.test");
if (existsSync(envTestPath)) {
  process.loadEnvFile(envTestPath);
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // 複数テストファイルがDATABASE_URLの共有テストDBへ同時にresetStore()等を
    // 発行すると競合する（インメモリ実装時代は各ワーカーが独立メモリだったため
    // 問題化しなかった）。ファイル単位で直列実行にして避ける
    fileParallelism: false,
  },
});

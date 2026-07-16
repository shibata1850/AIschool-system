import { defineConfig, devices } from "@playwright/test";

/**
 * E2E設定（CLAUDE.md 7章 テスト規律）。
 * 4デバイス条件のうち、CIで再現可能な画面条件をプロジェクトとして定義する。
 * 実機確認（GOOVIS/Quest 3/NearHub/モバイルモニター）は docs/テスト計画書.md 5章に従い別途実施。
 */
export default defineConfig({
  testDir: "./e2e",
  // 参照実装は共有インメモリストアを使うため直列実行（並列だとリセットが衝突する）
  fullyParallel: false,
  workers: 1,
  forbidOnly: true, // .only を残したコミット禁止（CLAUDE.md 7章）
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    // 実行環境にプリインストール済みのChromiumを使う（PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD環境向け）。
    // 未設定の環境では npx playwright install でダウンロードした標準ブラウザが使われる
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  projects: [
    {
      // GOOVIS G3 MAX 想定（NUC直結・1920x1080）
      name: "goovis",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
    {
      // モバイルモニター15.6インチ想定（1366x768）
      name: "mobile-monitor",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // E2Eは決定的にする: ローカルに .env（Canvas接続情報）があっても
    // 未接続（デモモード）として動かす。実接続の表示確認はステージングで行う
    env: {
      ...process.env,
      CANVAS_BASE_URL: "",
      CANVAS_API_TOKEN: "",
      // E2Eはロール総当たりのためCookieロールを許可（本番デプロイでは付けない）
      DEV_COOKIE_ROLES: "1",
    },
  },
});

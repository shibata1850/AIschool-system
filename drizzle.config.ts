import { defineConfig } from "drizzle-kit";

/**
 * マイグレーション生成・適用先の接続情報。
 * DATABASE_ADMIN_URL（テーブル所有者ロール）を使う。実行時アプリは
 * 権限を絞った DATABASE_URL（src/lib/db/client.ts）を使うため、これとは別。
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_ADMIN_URL ??
      "postgres://aischool_admin:devadminpw@localhost:5432/aischool_dev",
  },
});

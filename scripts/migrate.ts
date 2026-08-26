import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * スキーマ移行の適用（テーブル所有ロールで実行）。
 * 実行: DATABASE_ADMIN_URL=... npx tsx scripts/migrate.ts
 * さくらのクラウド本番でも同じスクリプトを使う（infra/custom-layer/README.md）。
 */
async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error("DATABASE_ADMIN_URL を設定してください（マイグレーション用の所有ロール接続文字列）");
  }
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./drizzle/migrations" });
  await pool.end();
  console.log("マイグレーション適用が完了しました");
}

main().catch((error) => {
  console.error("マイグレーションに失敗しました:", error);
  process.exit(1);
});

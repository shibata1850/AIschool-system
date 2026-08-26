import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * 管理用DB接続（テーブル所有ロール）。
 * 用途はE2E・開発用のリセットAPI（TRUNCATE＋再シード）のみに限定する。
 * 通常のAPI route・画面からは絶対に使わないこと（監査ログの追記専用性を
 * アプリ経路で回避できてしまうため — SEC-2）。
 */
declare global {
  // eslint-disable-next-line no-var
  var __dbAdminPool: Pool | undefined;
}

function requireUrl(name: string): string {
  const url = process.env[name];
  if (!url) {
    throw new Error(`${name} が設定されていません（.env.example参照）`);
  }
  return url;
}

function getAdminPool(): Pool {
  if (!globalThis.__dbAdminPool) {
    globalThis.__dbAdminPool = new Pool({
      connectionString: requireUrl("DATABASE_ADMIN_URL"),
    });
  }
  return globalThis.__dbAdminPool;
}

export function getAdminDb(): NodePgDatabase<typeof schema> {
  return drizzle(getAdminPool(), { schema });
}

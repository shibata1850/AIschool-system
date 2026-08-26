import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * 実行時アプリ用のDB接続（権限を絞った aischool_app ロール）。
 * Next.js dev のホットリロードでも接続プールを使い回すため globalThis に置く
 * （__f3Store と同じ理由・パターン）。
 */
declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
}

function requireUrl(name: string): string {
  const url = process.env[name];
  if (!url) {
    throw new Error(`${name} が設定されていません（.env.example参照）`);
  }
  return url;
}

function getPool(): Pool {
  if (!globalThis.__dbPool) {
    globalThis.__dbPool = new Pool({ connectionString: requireUrl("DATABASE_URL") });
  }
  return globalThis.__dbPool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  return drizzle(getPool(), { schema });
}

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
export type DbExecutor = Pick<NodePgDatabase<typeof schema>, "select" | "selectDistinct" | "selectDistinctOn" | "insert" | "update" | "delete" | "execute">;

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

export class WeeklyReportBusyError extends Error {
  constructor() { super("Weekly report generation or retention is already running"); }
}

/** Use the supplied DB for every operation; acquiring another pooled connection can deadlock. */
export async function withWeeklyReportLock<T>(work: (db: NodePgDatabase<typeof schema>) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const lockId = 1313297234;
  let acquired = false;
  let discard = true;
  try {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS acquired", [lockId],
    );
    acquired = result.rows[0]?.acquired === true;
    discard = false;
    if (!acquired) throw new WeeklyReportBusyError();
    // Session lock, not transaction lock: notification claims must commit before HTTP delivery.
    return await work(drizzle(client, { schema }));
  } finally {
    if (acquired) {
      try {
        const result = await client.query<{ released: boolean }>(
          "SELECT pg_advisory_unlock($1) AS released", [lockId],
        );
        discard = result.rows[0]?.released !== true;
      } catch {
        // Never return a connection with an uncertain session lock to the pool.
        discard = true;
      }
    }
    client.release(discard);
  }
}

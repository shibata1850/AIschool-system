import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assignments as assignmentsTable, externalMastery } from "@/lib/db/schema";

/**
 * eラーニングシステムから受け取る自宅学習の到達度（E7-c）。
 *
 * **教室の到達度とは合成しない。** 並べて別々に見せる方針
 * （docs/eラーニング連携.md 3.2.2）。このモジュールは「受け取って保存する」ことと
 * 「表示のために取り出す」ことだけを担い、教室側の集計には一切関与しない。
 */

/** 送信元システム。現在はeラーニングのみ */
export const SOURCE_ELEARNING = "elearning";

export interface MasteryInput {
  studentId: string;
  unitId: string;
  /** 0〜100。データ不足で「測定中」の場合は null（0点として扱わない） */
  score: number | null;
  /** 算出根拠。受講生本人が確認できるように保持する（先方 受け入れ基準 B-3） */
  reasons?: string[];
  /** 送信元が算出した時刻（ISO 8601） */
  measuredAt: string;
}

export interface MasteryRecord extends MasteryInput {
  source: string;
  receivedAt: string;
  /** 単元の表示名。本リポジトリの課題マスタから解決する（未知の単元では undefined） */
  unitTitle?: string;
}

export type ValidationError = { index: number; field: string; message: string };

/**
 * 受信データの検証（純粋関数）。DBに触れないので単体テストで網羅できる。
 * 1件でも不正なら全体を拒否する（部分適用すると送信側が何が入ったか分からなくなる）。
 */
export function validateMasteryPayload(payload: unknown): {
  ok: true;
  items: MasteryInput[];
} | {
  ok: false;
  errors: ValidationError[];
} {
  const errors: ValidationError[] = [];
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, errors: [{ index: -1, field: "(body)", message: "JSONオブジェクトを送ってください" }] };
  }
  const rawItems = (payload as { items?: unknown }).items;
  if (!Array.isArray(rawItems)) {
    return { ok: false, errors: [{ index: -1, field: "items", message: "items は配列で送ってください" }] };
  }
  if (rawItems.length === 0) {
    return { ok: false, errors: [{ index: -1, field: "items", message: "items が空です" }] };
  }
  // 1リクエストの上限。無制限だと巨大な本文でメモリを圧迫できてしまう
  if (rawItems.length > 500) {
    return { ok: false, errors: [{ index: -1, field: "items", message: "1回の送信は500件までです" }] };
  }

  const items: MasteryInput[] = [];
  rawItems.forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      errors.push({ index, field: "(item)", message: "オブジェクトではありません" });
      return;
    }
    const r = raw as Record<string, unknown>;
    const studentId = typeof r.studentId === "string" ? r.studentId.trim() : "";
    const unitId = typeof r.unitId === "string" ? r.unitId.trim() : "";
    if (!studentId) errors.push({ index, field: "studentId", message: "必須です" });
    if (!unitId) errors.push({ index, field: "unitId", message: "必須です" });

    // score は「未指定」と「測定中(null)」を区別する。undefined は入力漏れとして弾く
    let score: number | null = null;
    if (r.score === null) {
      score = null;
    } else if (typeof r.score === "number" && Number.isInteger(r.score) && r.score >= 0 && r.score <= 100) {
      score = r.score;
    } else {
      errors.push({
        index,
        field: "score",
        message: "0〜100の整数、または測定中を表す null を指定してください",
      });
    }

    const measuredAtRaw = typeof r.measuredAt === "string" ? r.measuredAt : "";
    const measuredAt = new Date(measuredAtRaw);
    if (!measuredAtRaw || Number.isNaN(measuredAt.getTime())) {
      errors.push({ index, field: "measuredAt", message: "ISO 8601 の日時を指定してください" });
    }

    let reasons: string[] | undefined;
    if (r.reasons !== undefined) {
      if (Array.isArray(r.reasons) && r.reasons.every((x) => typeof x === "string")) {
        reasons = r.reasons as string[];
      } else {
        errors.push({ index, field: "reasons", message: "文字列の配列で指定してください" });
      }
    }

    if (errors.some((e) => e.index === index)) return;
    items.push({ studentId, unitId, score, reasons, measuredAt: measuredAtRaw });
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, items };
}

/**
 * 受信した単元IDのうち、本リポジトリの課題マスタに存在しないものを返す。
 *
 * 単元マスタの「正」は本リポジトリ側（先方2.3）。未知の単元を黙って受け取ると、
 * ダッシュボードに出所不明の数字が並ぶことになるため、送信側へ差し戻す。
 */
export async function findUnknownUnitIds(unitIds: string[]): Promise<string[]> {
  const unique = [...new Set(unitIds)];
  if (unique.length === 0) return [];
  const db = getDb();
  const found = await db
    .select({ id: assignmentsTable.id })
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.id, unique));
  const known = new Set(found.map((r) => r.id));
  return unique.filter((id) => !known.has(id));
}

/** 受信内容を保存する（1受講生×1単元は上書き。履歴は監査ログ側に残る） */
export async function saveMastery(
  items: MasteryInput[],
  source: string = SOURCE_ELEARNING,
): Promise<{ savedAt: string }> {
  const db = getDb();
  const receivedAt = new Date();
  for (const item of items) {
    await db
      .insert(externalMastery)
      .values({
        studentId: item.studentId,
        unitId: item.unitId,
        source,
        score: item.score,
        reasons: item.reasons ?? null,
        measuredAt: new Date(item.measuredAt),
        receivedAt,
      })
      .onConflictDoUpdate({
        target: [externalMastery.studentId, externalMastery.unitId, externalMastery.source],
        set: {
          score: item.score,
          reasons: item.reasons ?? null,
          measuredAt: new Date(item.measuredAt),
          receivedAt,
        },
      });
  }
  return { savedAt: receivedAt.toISOString() };
}

/** 受講生1名分の自宅学習到達度を、単元名を添えて取り出す（S5表示用） */
export async function getExternalMasteryForStudent(
  studentId: string,
): Promise<MasteryRecord[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(externalMastery)
    .where(eq(externalMastery.studentId, studentId));
  if (rows.length === 0) return [];

  const titles = new Map<string, string>();
  const found = await db
    .select({ id: assignmentsTable.id, title: assignmentsTable.title })
    .from(assignmentsTable)
    .where(inArray(assignmentsTable.id, [...new Set(rows.map((r) => r.unitId))]));
  for (const a of found) titles.set(a.id, a.title);

  return rows
    .map((r) => ({
      studentId: r.studentId,
      unitId: r.unitId,
      source: r.source,
      score: r.score,
      reasons: (r.reasons as string[] | null) ?? undefined,
      measuredAt: r.measuredAt.toISOString(),
      receivedAt: r.receivedAt.toISOString(),
      unitTitle: titles.get(r.unitId),
    }))
    .sort((a, b) => a.unitId.localeCompare(b.unitId));
}

/** 退会者データ削除（F5②）で使う。受講生1名分をすべて消す */
export async function purgeExternalMastery(studentId: string): Promise<number> {
  const db = getDb();
  const deleted = await db
    .delete(externalMastery)
    .where(eq(externalMastery.studentId, studentId))
    .returning({ unitId: externalMastery.unitId });
  return deleted.length;
}

/** 単元マスタ（E7-b）。相手に渡すのは参照に必要な最小限だけ */
export async function listUnitMaster(): Promise<
  Array<{ id: string; title: string; deadline: string }>
> {
  const db = getDb();
  const rows = await db
    .select({
      id: assignmentsTable.id,
      title: assignmentsTable.title,
      deadline: assignmentsTable.deadline,
    })
    .from(assignmentsTable);
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

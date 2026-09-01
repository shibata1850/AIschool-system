import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit/log";
import { verifyIntegrationToken } from "@/lib/integration/auth";
import {
  SOURCE_ELEARNING,
  findUnknownUnitIds,
  saveMastery,
  validateMasteryPayload,
} from "@/lib/integration/mastery";

export const dynamic = "force-dynamic";

/**
 * E7-c: 自宅学習の到達度を受け取るAPI（eラーニングシステム → クラウドキャンパス）。
 * 先方の受け入れ基準 B-7「到達度スコアがクラウドキャンパス側に反映されること」に対応する。
 *
 * **これはeラーニングの機能ではない。** 本リポジトリの到達度ダッシュボードの
 * 入力を1つ増やす実装であり、CLAUDE.md 13.1 の禁止範囲には当たらない
 * （境界の説明は docs/eラーニング連携.md 3.2.1）。
 *
 * 受け取った値は**教室の到達度とは別テーブルに保存し、合成しない**（同 3.2.2）。
 *
 * 送信例:
 *   POST /api/integration/mastery
 *   Authorization: Bearer <INTEGRATION_API_TOKEN>
 *   { "items": [
 *       { "studentId": "s1", "unitId": "a1", "score": 72,
 *         "reasons": ["第2章の誤答が多い"], "measuredAt": "2026-09-01T00:00:00Z" },
 *       { "studentId": "s2", "unitId": "a1", "score": null,
 *         "measuredAt": "2026-09-01T00:00:00Z" }
 *   ] }
 */
export async function POST(request: Request) {
  const auth = verifyIntegrationToken(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSONとして読めませんでした" }, { status: 400 });
  }

  const validated = validateMasteryPayload(payload);
  if (!validated.ok) {
    // 送信側が何を直せばよいか分かるよう、項目ごとに返す（先方E7例外4の再送に必要）
    return NextResponse.json(
      { error: "入力が不正です", details: validated.errors },
      { status: 400 },
    );
  }

  // 単元マスタの「正」は本リポジトリ側。知らない単元は受け取らずに差し戻す
  const unknown = await findUnknownUnitIds(validated.items.map((i) => i.unitId));
  if (unknown.length > 0) {
    return NextResponse.json(
      {
        error: "未知の単元IDが含まれています。単元マスタ（GET /api/integration/units）を取得し直してください",
        unknownUnitIds: unknown,
      },
      { status: 409 },
    );
  }

  const { savedAt } = await saveMastery(validated.items, SOURCE_ELEARNING);

  // 監査ログ（CLAUDE.md 9章）。**氏名は残さない — 受講生IDと単元IDのみ**。
  // 1件ずつ残すと大量送信で膨れるため、1リクエストを1エントリにまとめる
  await recordAudit({
    actorRole: "system",
    actorId: SOURCE_ELEARNING,
    action: "update",
    entity: "external_mastery",
    entityId: `${SOURCE_ELEARNING}:${savedAt}`,
    after: {
      count: validated.items.length,
      // 何を受け取ったかを後から追えるようにする（スコアは個人情報ではない）
      items: validated.items.map((i) => ({
        studentId: i.studentId,
        unitId: i.unitId,
        score: i.score,
      })),
    },
  });

  return NextResponse.json({ accepted: validated.items.length, savedAt });
}

import { getAdminDb } from "./adminClient";
import {
  assignments as assignmentsTable,
  auditLog as auditLogTable,
  deviceAssignments as deviceAssignmentsTable,
  lessonRecords as lessonRecordsTable,
  submissions as submissionsTable,
  weeklyReports as weeklyReportsTable,
} from "./schema";
import type { Assignment } from "@/lib/f3/types";
import { buildRichAuditEntries, buildRichSeed } from "@/lib/f3/demoSeed";
import { SEED_LESSON_RECORDS } from "@/lib/f4/fixtures";

/**
 * DBの初期化（E2E・開発用のリセット、および新規環境の初回投入で使う）。
 * 管理ロール（テーブル所有者）で実行する。既存データを全削除してから再投入する。
 */
export async function resetDatabase(): Promise<void> {
  const db = getAdminDb();
  await db.transaction(async (tx) => {
    // 子→親の順に削除（submissionsがassignmentsを参照するFK制約のため）
    await tx.delete(submissionsTable);
    await tx.delete(lessonRecordsTable);
    await tx.delete(deviceAssignmentsTable);
    await tx.delete(assignmentsTable);
    await tx.delete(auditLogTable);
    await tx.delete(weeklyReportsTable);

    async function insertMinimalSeed() {
      await tx.insert(assignmentsTable).values(MINIMAL_ASSIGNMENT);

      await tx.insert(submissionsTable).values({
        id: "s1",
        assignmentId: "a1",
        studentId: "student-demo",
        status: "not_started",
        version: 1,
        promptText: "",
        aiOutputText: "",
        reflectionText: "",
        isLate: false,
        hasDeviation: false,
        versions: [],
      });

      const lessonRows = Object.entries(SEED_LESSON_RECORDS).flatMap(([studentId, records]) =>
        records.map((r) => ({
          studentId,
          lessonId: r.lessonId,
          weekStart: r.weekStart,
          attended: r.attended,
          submitted: r.submitted,
          score: r.score,
          dataMissing: r.dataMissing ?? false,
        })),
      );
      if (lessonRows.length > 0) {
        await tx.insert(lessonRecordsTable).values(lessonRows);
      }

      const deviceRows = Array.from({ length: 16 }, (_, i) => {
        const seatNo = i + 1;
        const pad = String(seatNo).padStart(2, "0");
        return {
          seatNo,
          nucId: `NUC-${pad}`,
          monitorId: `MON-${pad}`,
          studentId: seatNo === 1 ? "student-demo" : `s${pad}`,
          usingBackup: false,
        };
      });
      await tx.insert(deviceAssignmentsTable).values(deviceRows);
    }

    async function insertRichSeed() {
      const rich = buildRichSeed();

      await tx.insert(assignmentsTable).values([...rich.assignments.values()]);
      // ドメイン型の canvasSyncedAt は ISO文字列、DBは timestamp のため明示的に詰め替える
      // （シードは常にCanvas未反映の状態で作る）
      await tx.insert(submissionsTable).values(
        [...rich.submissions.values()].map((s) => ({
          id: s.id,
          assignmentId: s.assignmentId,
          studentId: s.studentId,
          status: s.status,
          version: s.version,
          promptText: s.promptText,
          aiOutputText: s.aiOutputText,
          reflectionText: s.reflectionText,
          isLate: s.isLate,
          aiGrade: s.aiGrade ?? null,
          teacherScore: s.teacherScore ?? null,
          hasDeviation: s.hasDeviation,
          teacherComment: s.teacherComment ?? null,
          submittedAt: s.submittedAt ?? null,
          versions: s.versions,
        })),
      );

      const lessonRows = [...rich.lessonRecords.entries()].flatMap(([studentId, records]) =>
        records.map((r) => ({
          studentId,
          lessonId: r.lessonId,
          weekStart: r.weekStart,
          attended: r.attended,
          submitted: r.submitted,
          score: r.score,
          dataMissing: r.dataMissing ?? false,
        })),
      );
      await tx.insert(lessonRecordsTable).values(lessonRows);
      await tx.insert(deviceAssignmentsTable).values([...rich.deviceAssignments.values()]);

      const auditRows = buildRichAuditEntries().map((entry) => ({ ...entry, at: new Date() }));
      await tx.insert(auditLogTable).values(auditRows);
    }

    if (process.env.DEMO_RICH_SEED === "1") {
      await insertRichSeed();
    } else {
      await insertMinimalSeed();
    }
  });
}

const MINIMAL_ASSIGNMENT: Assignment = {
  id: "a1",
  title: "お店の紹介文をAIに書かせよう",
  description:
    "あなたはパン屋の店長です。新商品のメロンパンを紹介する文章をAIに書かせるためのプロンプトを書いてください。「だれに向けて」「どんな長さで」「どんな雰囲気（ふんいき）で」を指定できると高得点です。",
  charLimit: 4000,
  deadline: "2027-03-31T23:59:00+09:00",
};

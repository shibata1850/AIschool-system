import { describe, expect, it } from "vitest";
import type { LessonRecord } from "../achievement";
import type { StudentProfile } from "../fixtures";
import {
  buildNotificationBody,
  buildWeeklyReport,
  weekStartOf,
  type WeeklyReportInput,
} from "../weeklyReport";

const STUDENTS: StudentProfile[] = [
  { id: "s01", displayName: "デモ生徒01", seatNo: 1 },
  { id: "s02", displayName: "デモ生徒02", seatNo: 2 },
  { id: "s03", displayName: "デモ生徒03", seatNo: 3 },
];

function rec(weekStart: string, score: number | null, extra: Partial<LessonRecord> = {}): LessonRecord {
  return {
    lessonId: `l-${weekStart}`,
    weekStart,
    attended: true,
    submitted: score !== null,
    score,
    ...extra,
  };
}

function input(over: Partial<WeeklyReportInput> = {}): WeeklyReportInput {
  return {
    weekStart: "2026-10-19",
    students: STUDENTS,
    recordsByStudent: new Map(),
    pendingByStudent: new Map(),
    ...over,
  };
}

describe("buildWeeklyReport（要件定義書F4 週次到達度レポート）", () => {
  it("正常系: 受講生別の行とクラス平均を組み立てる", () => {
    const report = buildWeeklyReport(
      input({
        recordsByStudent: new Map([
          ["s01", [rec("2026-10-19", 80)]],
          ["s02", [rec("2026-10-19", 60)]],
        ]),
      }),
    );

    expect(report.weekStart).toBe("2026-10-19");
    expect(report.rows).toHaveLength(2);
    expect(report.summary.studentCount).toBe(2);
    // 80*0.6+100*0.2+100*0.2 = 88 / 60*0.6+100*0.2+100*0.2 = 76 → 平均82
    expect(report.summary.averageAchievement).toBe(82);
    expect(report.summary.averageAttendanceRate).toBe(100);
  });

  it("学習記録が無い受講生は行に含めない（未受講者を0点で並べない）", () => {
    const report = buildWeeklyReport(
      input({ recordsByStudent: new Map([["s01", [rec("2026-10-19", 80)]]]) }),
    );
    expect(report.rows.map((r) => r.studentId)).toEqual(["s01"]);
    expect(report.summary.studentCount).toBe(1);
  });

  it("座席番号順に並ぶ", () => {
    const report = buildWeeklyReport(
      input({
        recordsByStudent: new Map([
          ["s03", [rec("2026-10-19", 70)]],
          ["s01", [rec("2026-10-19", 70)]],
          ["s02", [rec("2026-10-19", 70)]],
        ]),
      }),
    );
    expect(report.rows.map((r) => r.seatNo)).toEqual([1, 2, 3]);
  });

  it("2週連続下降を停滞アラートとして最上部用に抽出する", () => {
    const declining = [
      rec("2026-10-05", 90),
      rec("2026-10-12", 70),
      rec("2026-10-19", 50),
    ];
    const stable = [
      rec("2026-10-05", 70),
      rec("2026-10-12", 75),
      rec("2026-10-19", 80),
    ];
    const report = buildWeeklyReport(
      input({ recordsByStudent: new Map([["s01", declining], ["s02", stable]]) }),
    );

    expect(report.summary.decliningCount).toBe(1);
    expect(report.alerts).toHaveLength(1);
    expect(report.alerts[0].studentId).toBe("s01");
    expect(report.rows.find((r) => r.studentId === "s02")?.declining).toBe(false);
  });

  it("未提出課題一覧を受講生別に持つ", () => {
    const report = buildWeeklyReport(
      input({
        recordsByStudent: new Map([["s01", [rec("2026-10-19", 80)]], ["s02", [rec("2026-10-19", 80)]]]),
        pendingByStudent: new Map([["s01", ["お店の紹介文をAIに書かせよう", "じこしょうかい"]]]),
      }),
    );

    expect(report.rows.find((r) => r.studentId === "s01")?.pendingAssignments).toHaveLength(2);
    expect(report.rows.find((r) => r.studentId === "s02")?.pendingAssignments).toEqual([]);
    expect(report.summary.withPendingCount).toBe(1);
  });

  it("例外3: 全週が計測不能の受講生は平均の分母に入らない（0点扱いにしない）", () => {
    const missing = [rec("2026-10-19", null, { attended: false, dataMissing: true })];
    const report = buildWeeklyReport(
      input({ recordsByStudent: new Map([["s01", [rec("2026-10-19", 80)]], ["s02", missing]]) }),
    );

    // 行としては出るが latest は null
    expect(report.rows).toHaveLength(2);
    expect(report.rows.find((r) => r.studentId === "s02")?.latest).toBeNull();
    // 平均は計測可能な s01 のみ（88）で、s02 の0点は混ざらない
    expect(report.summary.averageAchievement).toBe(88);
  });

  it("境界値: 対象者が0名でも壊れず、平均は null になる", () => {
    const report = buildWeeklyReport(input());
    expect(report.rows).toEqual([]);
    expect(report.summary.studentCount).toBe(0);
    expect(report.summary.averageAchievement).toBeNull();
    expect(report.alerts).toEqual([]);
  });
});

describe("buildNotificationBody（Canvasメッセージ本文）", () => {
  const report = buildWeeklyReport(
    input({
      recordsByStudent: new Map([
        ["s01", [rec("2026-10-05", 90), rec("2026-10-12", 70), rec("2026-10-19", 50)]],
      ]),
      pendingByStudent: new Map([["s01", ["お店の紹介文をAIに書かせよう"]]]),
    }),
  );

  it("対象週・人数・停滞アラートを含む", () => {
    const body = buildNotificationBody(report);
    expect(body).toContain("2026-10-19");
    expect(body).toContain("対象受講生: 1名");
    expect(body).toContain("停滞アラート");
    expect(body).toContain("デモ生徒01");
  });

  it("個人の点数は本文に載せない（メッセージは平文で残るため）", () => {
    const body = buildNotificationBody(report);
    // 停滞している s01 の最新到達度（50*0.6+0*0.2+100*0.2=50）が本文に出ないこと
    expect(body).not.toContain("到達度: 50");
    expect(body).not.toMatch(/デモ生徒01.*\d+点/);
  });

  it("アラートが無いときは「なし」と明示する", () => {
    const calm = buildWeeklyReport(
      input({ recordsByStudent: new Map([["s01", [rec("2026-10-19", 80)]]]) }),
    );
    expect(buildNotificationBody(calm)).toContain("停滞アラート: なし");
  });

  it("URLを渡すと導線を添える", () => {
    expect(buildNotificationBody(report, "https://example.jp/teacher/report")).toContain(
      "https://example.jp/teacher/report",
    );
  });
});

describe("weekStartOf（バッチの対象週の決定）", () => {
  it("週の途中の日付から、その週の月曜を返す", () => {
    expect(weekStartOf(new Date("2026-10-21T00:00:00Z"))).toBe("2026-10-19"); // 水曜
    expect(weekStartOf(new Date("2026-10-25T23:59:00Z"))).toBe("2026-10-19"); // 日曜
  });

  it("境界値: 月曜そのものは自分自身を返す", () => {
    expect(weekStartOf(new Date("2026-10-19T07:00:00Z"))).toBe("2026-10-19");
  });

  it("境界値: 日曜の翌日（月曜）は次の週になる", () => {
    expect(weekStartOf(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
  });
});

import {
  computeWeeklyAchievements,
  isDeclining,
  latestAchievement,
  type AchievementWeights,
  type LessonRecord,
  type WeeklyAchievement,
} from "./achievement";
import type { StudentProfile } from "./fixtures";

/**
 * 週次到達度レポートの組み立て（要件定義書 F4「週次到達度レポートの内容」）。
 *
 * 内容: 出席率 / 課題提出率 / 到達度スコア推移（週次）/ 停滞アラート（2週連続下降）
 *       / 未提出課題一覧
 *
 * 本モジュールは副作用を持たない純粋関数に保つ（DB・Canvasアクセスは呼び出し側）。
 * 生成・保存・通知は generateWeeklyReport.ts が担う。
 */

/** レポート1行（受講生1名分） */
export interface WeeklyReportRow {
  studentId: string;
  /** 表示名のみ。氏名フルネームは載せない（要件定義書5.3） */
  displayName: string;
  seatNo: number;
  /** 週次の推移（古い週から） */
  weekly: WeeklyAchievement[];
  /** 最新の計測可能な週。記録が無い/全週計測不能なら null */
  latest: WeeklyAchievement | null;
  /** 2週連続で到達度が下降しているか */
  declining: boolean;
  /** 未提出（完了していない）課題の表示名 */
  pendingAssignments: string[];
}

export interface WeeklyReportSummary {
  /** レポート対象となった受講生数（学習記録がある人数） */
  studentCount: number;
  /** 最新週の到達度の平均（計測可能な受講生のみ。該当なしは null） */
  averageAchievement: number | null;
  averageAttendanceRate: number | null;
  averageSubmissionRate: number | null;
  decliningCount: number;
  /** 未提出課題が1件以上ある受講生数 */
  withPendingCount: number;
}

export interface WeeklyReport {
  /** 対象週の月曜（ISO日付） */
  weekStart: string;
  summary: WeeklyReportSummary;
  rows: WeeklyReportRow[];
  /** 停滞アラート（2週連続下降）の対象者。最上部表示用（画面仕様書S8） */
  alerts: Array<{ studentId: string; displayName: string; seatNo: number }>;
}

export interface WeeklyReportInput {
  /** 対象週の月曜（ISO日付） */
  weekStart: string;
  students: StudentProfile[];
  /** 受講生ID → 学習記録 */
  recordsByStudent: Map<string, LessonRecord[]>;
  /** 受講生ID → 未提出課題の表示名 */
  pendingByStudent: Map<string, string[]>;
  weights?: AchievementWeights;
}

/** 小数第1位まで・四捨五入した平均。対象が0件なら null */
function averageOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/**
 * レポートを組み立てる。
 * 学習記録が1件も無い受講生は行に含めない（途中入会・未受講者を0点で並べない —
 * F4例外1と同じ考え方）。
 */
export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const rows: WeeklyReportRow[] = [];

  for (const student of input.students) {
    const records = input.recordsByStudent.get(student.id) ?? [];
    if (records.length === 0) continue;

    const weekly = computeWeeklyAchievements(records, input.weights);
    if (weekly.length === 0) continue;

    rows.push({
      studentId: student.id,
      displayName: student.displayName,
      seatNo: student.seatNo,
      weekly,
      latest: latestAchievement(weekly),
      declining: isDeclining(weekly),
      pendingAssignments: input.pendingByStudent.get(student.id) ?? [],
    });
  }

  rows.sort((a, b) => a.seatNo - b.seatNo);

  const measurable = rows
    .map((r) => r.latest)
    .filter((l): l is WeeklyAchievement => l !== null);

  return {
    weekStart: input.weekStart,
    summary: {
      studentCount: rows.length,
      averageAchievement: averageOrNull(measurable.map((l) => l.total)),
      averageAttendanceRate: averageOrNull(measurable.map((l) => l.attendanceRate)),
      averageSubmissionRate: averageOrNull(measurable.map((l) => l.submissionRate)),
      decliningCount: rows.filter((r) => r.declining).length,
      withPendingCount: rows.filter((r) => r.pendingAssignments.length > 0).length,
    },
    rows,
    alerts: rows
      .filter((r) => r.declining)
      .map((r) => ({ studentId: r.studentId, displayName: r.displayName, seatNo: r.seatNo })),
  };
}

/**
 * 通知メッセージの本文（Canvasメッセージ用）。
 * 個人の点数は本文に載せない（メッセージは平文で残るため。要件定義書5.3・
 * CLAUDE.md 9章）。件数と受講生の表示名までにとどめ、詳細は画面で見てもらう。
 */
export function buildNotificationBody(report: WeeklyReport, reportUrl?: string): string {
  const lines: string[] = [
    `${report.weekStart} の週の到達度レポートを作成しました。`,
    "",
    `対象受講生: ${report.summary.studentCount}名`,
  ];

  if (report.summary.averageAchievement !== null) {
    lines.push(`クラス平均の到達度: ${report.summary.averageAchievement}`);
  } else {
    lines.push("クラス平均の到達度: 計測可能な記録がありません");
  }

  if (report.alerts.length > 0) {
    lines.push("", `停滞アラート（2週連続で到達度が下降）: ${report.alerts.length}名`);
    for (const a of report.alerts) {
      lines.push(`  ・座席${a.seatNo} ${a.displayName}`);
    }
  } else {
    lines.push("", "停滞アラート: なし");
  }

  if (report.summary.withPendingCount > 0) {
    lines.push("", `未提出の課題がある受講生: ${report.summary.withPendingCount}名`);
  }

  if (reportUrl) {
    lines.push("", `詳細はこちら: ${reportUrl}`);
  }

  return lines.join("\n");
}

/** 指定日が含まれる週の月曜（ISO日付）を返す。バッチの対象週の決定に使う */
export function weekStartOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay: 0=日曜。月曜起点に揃える
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d.toISOString().slice(0, 10);
}

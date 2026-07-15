import type { LessonRecord } from "@/lib/f4/achievement";
import { clearAuditLog, recordAudit } from "@/lib/audit/log";
import type { DeviceAssignment } from "./store";
import type { Assignment, ExerciseStatus, Submission } from "./types";

/**
 * デモ用のリッチなシードデータ（環境変数 DEMO_RICH_SEED=1 のとき使用）。
 * 「授業中の教室（16席）」を再現し、全画面が現実的に埋まるようにする。
 * すべて架空値（CLAUDE.md 2章）。E2Eは最小シード（store.ts）を使うため本データは不使用。
 */

const WEEKS = ["2026-10-05", "2026-10-12", "2026-10-19"] as const;

/** 課題a1（既存）＋自己紹介課題a2（ホームを複数タスクにするため） */
const ASSIGNMENTS: Array<[string, Assignment]> = [
  [
    "a1",
    {
      id: "a1",
      title: "お店の紹介文をAIに書かせよう",
      description:
        "あなたはパン屋の店長です。新商品のメロンパンを紹介する文章をAIに書かせるためのプロンプトを書いてください。「だれに向けて」「どんな長さで」「どんな雰囲気（ふんいき）で」を指定できると高得点です。",
      charLimit: 4000,
      deadline: "2027-03-31T23:59:00+09:00",
    },
  ],
  [
    "a2",
    {
      id: "a2",
      title: "じこしょうかいをAIに手伝ってもらおう",
      description:
        "あなたのすきなこと・とくいなことをAIにつたえて、みじかい自己紹介文を作ってもらうプロンプトを書いてください。",
      charLimit: 2000,
      deadline: "2027-03-31T23:59:00+09:00",
    },
  ],
];

interface SubPlan {
  sid: string;
  status: ExerciseStatus;
  prompt?: string;
  output?: string;
  ai?: number; // AI一次採点スコア
  teacher?: number; // 講師確定スコア
  comment?: string; // 差戻しコメント
  late?: boolean;
}

/** a1（モニタリング対象）の16人分の状態。色・採点待ち・遅延・差戻しがひと通り出る配置 */
const A1_PLAN: SubPlan[] = [
  { sid: "student-demo", status: "returned", prompt: "メロンパンの紹介文を書いて。", comment: "「だれに向けて」書く相手を決めてみよう。" },
  { sid: "s02", status: "not_started" },
  { sid: "s03", status: "in_progress", prompt: "パン屋のメロンパンをしょうかいして。" },
  { sid: "s04", status: "submitted", prompt: "小学生に向けて、100文字くらいでメロンパンをしょうかいして。" },
  { sid: "s05", status: "ai_graded", ai: 84, prompt: "小学生向けに、わくわくする雰囲気で、80文字でメロンパンをしょうかいして。", output: "（AI実行結果）ふわっと甘い、できたてメロンパン！…" },
  { sid: "s06", status: "ai_graded", ai: 62, prompt: "メロンパンをしょうかいする文をつくって。", output: "（AI実行結果）メロンパンです。おいしいです。" },
  { sid: "s07", status: "completed", teacher: 90, prompt: "家族向けに、やさしい言葉で120文字でメロンパンをしょうかいして。" },
  { sid: "s08", status: "ai_graded", ai: 77, prompt: "中学生向けに、少していねいな言葉でメロンパンをしょうかいして。" },
  { sid: "s09", status: "in_progress", prompt: "メロンパン　しょうかい" },
  { sid: "s10", status: "submitted", prompt: "おいしいメロンパンの紹介を200文字で、遅れてすみません。", late: true },
  { sid: "s11", status: "not_started" },
  { sid: "s12", status: "in_progress", prompt: "お店のメロンパンを…" },
  { sid: "s13", status: "ai_graded", ai: 91, prompt: "小学校低学年向けに、やさしい言葉で、60文字で、うれしい気持ちになるようにメロンパンをしょうかいして。" },
  { sid: "s14", status: "completed", teacher: 74, prompt: "友だちにすすめる感じでメロンパンをしょうかいして。" },
  { sid: "s15", status: "not_started" },
  { sid: "s16", status: "in_progress", prompt: "メロンパンのいいところを3つ入れてしょうかいして。" },
];

function buildSubmission(plan: SubPlan, assignmentId: string, id: string): Submission {
  const hasContent = plan.status !== "not_started";
  return {
    id,
    assignmentId,
    studentId: plan.sid,
    status: plan.status,
    version: 1,
    promptText: plan.prompt ?? "",
    aiOutputText: plan.output ?? "",
    reflectionText: "",
    isLate: plan.late ?? false,
    hasDeviation: false,
    submittedAt: hasContent && plan.status !== "in_progress" ? "2026-10-19T10:20:00+09:00" : undefined,
    teacherScore: plan.teacher,
    teacherComment: plan.comment,
    aiGrade:
      plan.ai !== undefined
        ? {
            totalScore: plan.ai,
            feedback: "よいところ: 相手や長さを指定できています。もう一歩: 雰囲気の言葉を足すとさらに良くなります。",
            rationale: `観点別: 明確さ${Math.round(plan.ai / 10)}/10・具体性${Math.round(plan.ai / 12)}/10。指定要素の有無で加点。`,
            model: "mock",
            promptVersion: "demo-1",
          }
        : undefined,
    versions: [],
  };
}

/** 週次レポート用の学習記録（16人・3週）。一部は下降（停滞アラート）になる */
const RECORD_SCORES: Record<string, [number | null, number | null, number | null]> = {
  "student-demo": [80, null, 74], // 中間週は計測不能（既存デモと同傾向）
  s02: [66, null, null],
  s03: [null, null, 88],
  s04: [70, 72, 78],
  s05: [86, 88, 92],
  s06: [82, 70, 58], // 下降＝停滞アラート
  s07: [60, 72, 90],
  s08: [74, 76, 80],
  s09: [null, 62, 66],
  s10: [58, 61, 64],
  s11: [90, 86, 84],
  s12: [85, 76, 67], // 下降＝停滞アラート
  s13: [70, 80, 91],
  s14: [64, 70, 78],
  s15: [52, 58, 63],
  s16: [72, 75, 77],
};

function buildRecords(scores: [number | null, number | null, number | null]): LessonRecord[] {
  return WEEKS.map((weekStart, i) => {
    const score = scores[i];
    if (score === null) {
      // 記録なし週は「計測不能」（欠席や障害）
      return { lessonId: `l${i + 1}`, weekStart, attended: i !== 1, submitted: false, score: null, dataMissing: i === 1 };
    }
    return { lessonId: `l${i + 1}`, weekStart, attended: true, submitted: true, score };
  });
}

export interface RichSeed {
  assignments: Map<string, Assignment>;
  submissions: Map<string, Submission>;
  lessonRecords: Map<string, LessonRecord[]>;
  deviceAssignments: Map<number, DeviceAssignment>;
}

export function buildRichSeed(): RichSeed {
  const assignments = new Map<string, Assignment>(ASSIGNMENTS);

  const submissions = new Map<string, Submission>();
  // a1: 16人分
  for (const plan of A1_PLAN) {
    const id = plan.sid === "student-demo" ? "s1" : `a1-${plan.sid}`;
    submissions.set(id, buildSubmission(plan, "a1", id));
  }
  // a2: デモ生徒のみ取組中（ホームを複数タスクにする）
  submissions.set(
    "a2-student-demo",
    buildSubmission(
      { sid: "student-demo", status: "in_progress", prompt: "すきなこと: サッカー。" },
      "a2",
      "a2-student-demo",
    ),
  );

  const lessonRecords = new Map<string, LessonRecord[]>();
  for (const [sid, scores] of Object.entries(RECORD_SCORES)) {
    lessonRecords.set(sid, buildRecords(scores));
  }

  const deviceAssignments = new Map<number, DeviceAssignment>();
  for (let seatNo = 1; seatNo <= 16; seatNo += 1) {
    const pad = String(seatNo).padStart(2, "0");
    deviceAssignments.set(seatNo, {
      seatNo,
      nucId: `NUC-${pad}`,
      goovisId: `GOOVIS-${pad}`,
      studentId: seatNo === 1 ? "student-demo" : `s${pad}`,
      // 5番・11番はGOOVIS不調で予備機（モバイルモニター）に切替中
      usingBackup: seatNo === 5 || seatNo === 11,
    });
  }

  return { assignments, submissions, lessonRecords, deviceAssignments };
}

/** 監査ログのデモ記録（画面が空にならないように数件）。呼ぶたびに置き換える */
export function seedRichAudit(): void {
  clearAuditLog();
  recordAudit({ actorRole: "student", action: "update", entity: "submission", entityId: "a1-s07", before: { status: "in_progress" }, after: { status: "submitted" } });
  recordAudit({ actorRole: "system", action: "update", entity: "submission", entityId: "a1-s07", before: { status: "submitted" }, after: { status: "ai_graded" } });
  recordAudit({ actorRole: "teacher", action: "update", entity: "submission", entityId: "a1-s07", before: { status: "ai_graded", teacherScore: undefined }, after: { status: "completed", teacherScore: 90 } });
  recordAudit({ actorRole: "teacher", action: "update", entity: "device_assignment", entityId: "seat-5", before: { usingBackup: false }, after: { usingBackup: true } });
}

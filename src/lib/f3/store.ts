import type { LessonRecord } from "@/lib/f4/achievement";
import { SEED_LESSON_RECORDS } from "@/lib/f4/fixtures";
import type { Assignment, Submission } from "./types";
import { buildRichSeed, seedRichAudit } from "./demoSeed";

/**
 * 参照実装用のインメモリストア（提出・課題・学習記録の単一データソース）。
 * 本番はCanvas（Assignment/Submission）＋カスタム層DBに置き換える前提で、
 * アクセスを本モジュールのヘルパーに閉じ込めている。
 * データはすべて架空値（CLAUDE.md 2章: 実個人情報の使用禁止）。
 */

/** いま教室で扱っている課題（モニタリングの対象。本番は授業コマから解決する） */
export const CURRENT_ASSIGNMENT_ID = "a1";

/** いま出席を取る授業コマの週（本番は授業コマから解決する） */
export const CURRENT_LESSON_WEEK = "2026-10-19";

/** デバイス割当（要件定義書6.1 device_assignments） */
export interface DeviceAssignment {
  seatNo: number;
  nucId: string;
  goovisId: string;
  studentId: string;
  /** GOOVIS不調時にモバイルモニター（予備機）へ切替中か（未決事項#4の仮運用） */
  usingBackup: boolean;
}

interface DomainStore {
  assignments: Map<string, Assignment>;
  submissions: Map<string, Submission>;
  /** 受講生ID → 授業コマごとの学習記録（到達度の入力） */
  lessonRecords: Map<string, LessonRecord[]>;
  /** 座席番号 → デバイス割当 */
  deviceAssignments: Map<number, DeviceAssignment>;
}

declare global {
  // Next.js dev のホットリロードでもストアを維持するため globalThis に置く
  var __f3Store: DomainStore | undefined;
}

/**
 * シードを選ぶ。DEMO_RICH_SEED=1 のとき「授業中の教室」を再現したリッチなデモ
 * （全画面が埋まる）。それ以外は最小シード（E2E・開発の基準・現状維持）。
 */
function seed(): DomainStore {
  if (process.env.DEMO_RICH_SEED === "1") {
    seedRichAudit();
    return buildRichSeed();
  }
  return seedMinimal();
}

function seedMinimal(): DomainStore {
  const assignments = new Map<string, Assignment>();
  assignments.set("a1", {
    id: "a1",
    title: "お店の紹介文をAIに書かせよう",
    description:
      "あなたはパン屋の店長です。新商品のメロンパンを紹介する文章をAIに書かせるためのプロンプトを書いてください。「だれに向けて」「どんな長さで」「どんな雰囲気（ふんいき）で」を指定できると高得点です。",
    charLimit: 4000,
    deadline: "2027-03-31T23:59:00+09:00",
  });

  const submissions = new Map<string, Submission>();
  submissions.set("s1", {
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

  const lessonRecords = new Map<string, LessonRecord[]>(
    Object.entries(structuredClone(SEED_LESSON_RECORDS)),
  );

  // 座席1〜16にNUC/GOOVISを対応付ける（識別子は資産管理番号の架空値）
  const deviceAssignments = new Map<number, DeviceAssignment>();
  for (let seatNo = 1; seatNo <= 16; seatNo += 1) {
    const pad = String(seatNo).padStart(2, "0");
    deviceAssignments.set(seatNo, {
      seatNo,
      nucId: `NUC-${pad}`,
      goovisId: `GOOVIS-${pad}`,
      studentId: seatNo === 1 ? "student-demo" : `s${pad}`,
      usingBackup: false,
    });
  }

  return { assignments, submissions, lessonRecords, deviceAssignments };
}

export function getStore(): DomainStore {
  if (!globalThis.__f3Store) {
    globalThis.__f3Store = seed();
  }
  return globalThis.__f3Store;
}

/** E2E・開発用: ストアを初期状態に戻す */
export function resetStore(): void {
  globalThis.__f3Store = seed();
}

/** 受講生の提出を課題スコープで取得する（IDの散在防止用ヘルパー） */
export function findSubmission(
  assignmentId: string,
  studentId: string,
): Submission | undefined {
  return [...getStore().submissions.values()].find(
    (s) => s.assignmentId === assignmentId && s.studentId === studentId,
  );
}

/** 受講生の学習記録（到達度の入力）を取得する */
export function getLessonRecords(studentId: string): LessonRecord[] {
  return getStore().lessonRecords.get(studentId) ?? [];
}

/** 1席のデバイス割当（存在しない座席は undefined） */
export function getDeviceAssignment(seatNo: number): DeviceAssignment | undefined {
  return getStore().deviceAssignments.get(seatNo);
}

/** 全席のデバイス割当（座席番号順） */
export function getDeviceAssignments(): DeviceAssignment[] {
  return [...getStore().deviceAssignments.values()].sort(
    (a, b) => a.seatNo - b.seatNo,
  );
}

/** 予備機（モバイルモニター）への切替状態を変更する。存在しない座席は undefined */
export function setDeviceBackup(
  seatNo: number,
  usingBackup: boolean,
): DeviceAssignment | undefined {
  const assignment = getStore().deviceAssignments.get(seatNo);
  if (!assignment) return undefined;
  assignment.usingBackup = usingBackup;
  return assignment;
}

/**
 * 出席を記録する（未決#11: 出席はカスタム層で管理）。
 * 指定週の学習記録が無ければ作成する。変更前の値（true/false/未記録）を返す。
 */
export function setAttendance(
  studentId: string,
  weekStart: string,
  attended: boolean,
): { before: boolean | "none"; changed: boolean } {
  const store = getStore();
  let records = store.lessonRecords.get(studentId);
  if (!records) {
    records = [];
    store.lessonRecords.set(studentId, records);
  }
  const existing = records.find((r) => r.weekStart === weekStart);
  if (!existing) {
    records.push({
      lessonId: `w-${weekStart}`,
      weekStart,
      attended,
      submitted: false,
      score: null,
    });
    // 週順を保つ
    records.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    return { before: "none", changed: true };
  }
  const before = existing.attended;
  if (before === attended && !existing.dataMissing) {
    return { before, changed: false };
  }
  existing.attended = attended;
  // 出席を記録したら「計測不能」フラグは解除する
  existing.dataMissing = false;
  return { before, changed: true };
}

/** 指定週の出席状態（記録が無ければ undefined） */
export function getAttendance(
  studentId: string,
  weekStart: string,
): boolean | undefined {
  return getStore()
    .lessonRecords.get(studentId)
    ?.find((r) => r.weekStart === weekStart)?.attended;
}

/**
 * 退会者の学習データ（提出・学習記録）を削除する（Pマーク保持期限。要件定義書5.3）。
 * 破壊的操作。呼び出し側で保持期限の判定・管理者権限確認・監査記録を必ず行うこと。
 * 削除件数を返す（監査の変更前スナップショット用）。再実行しても安全（冪等）。
 */
export function purgeStudentData(studentId: string): {
  deletedSubmissions: number;
  hadLessonRecords: boolean;
} {
  const store = getStore();
  let deletedSubmissions = 0;
  for (const [id, s] of store.submissions) {
    if (s.studentId === studentId) {
      store.submissions.delete(id);
      deletedSubmissions += 1;
    }
  }
  const hadLessonRecords = store.lessonRecords.delete(studentId);
  return { deletedSubmissions, hadLessonRecords };
}

/**
 * 講師の成績確定を最新の授業コマ記録へ反映する（F3→F4連携）。
 * 記録がない受講生（学習記録の収集前）は何もしない。
 */
export function recordCompletionScore(studentId: string, score: number): void {
  const records = getStore().lessonRecords.get(studentId);
  if (!records || records.length === 0) return;
  const latest = records[records.length - 1];
  latest.submitted = true;
  latest.score = score;
}

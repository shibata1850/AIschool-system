import type { LessonRecord } from "@/lib/f4/achievement";
import { SEED_LESSON_RECORDS } from "@/lib/f4/fixtures";
import type { Assignment, Submission } from "./types";

/**
 * 参照実装用のインメモリストア（提出・課題・学習記録の単一データソース）。
 * 本番はCanvas（Assignment/Submission）＋カスタム層DBに置き換える前提で、
 * アクセスを本モジュールのヘルパーに閉じ込めている。
 * データはすべて架空値（CLAUDE.md 2章: 実個人情報の使用禁止）。
 */

/** いま教室で扱っている課題（モニタリングの対象。本番は授業コマから解決する） */
export const CURRENT_ASSIGNMENT_ID = "a1";

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

function seed(): DomainStore {
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

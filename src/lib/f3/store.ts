import type { Assignment, Submission } from "./types";

/**
 * 参照実装用のインメモリストア。
 * 本番はCanvas（Assignment/Submission）＋カスタム層DBに置き換える前提で、
 * アクセスを本モジュールに閉じ込めている。
 * データはすべて架空値（CLAUDE.md 2章: 実個人情報の使用禁止）。
 */

interface F3Store {
  assignments: Map<string, Assignment>;
  submissions: Map<string, Submission>;
}

declare global {
  // Next.js dev のホットリロードでもストアを維持するため globalThis に置く
  var __f3Store: F3Store | undefined;
}

function seed(): F3Store {
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

  return { assignments, submissions };
}

export function getStore(): F3Store {
  if (!globalThis.__f3Store) {
    globalThis.__f3Store = seed();
  }
  return globalThis.__f3Store;
}

/** E2E・開発用: ストアを初期状態に戻す */
export function resetStore(): void {
  globalThis.__f3Store = seed();
}

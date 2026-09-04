import { beforeEach, describe, expect, it } from "vitest";
import { resetStore } from "@/lib/f3/store";
import { STUDENTS } from "@/lib/f4/fixtures";
import { listChatLogs, listStudentsWithChatLogs, recordChatLog } from "../chatLog";

/**
 * 回帰: **架空名簿に無い受講生の会話ログが、保存されているのに0件に見えていた**
 * （2026-09-02 本番で発生）。
 *
 * 経緯: 本番でAI講師に3問質問したあと「AI講師の会話ログ」画面が
 * 「まだ記録がありません」と表示した。保存はできていたが、画面が
 * **架空名簿（`STUDENTS` fixtures の16名）を順に引いて**いたため見つけられなかった。
 * 本番はLTI運用で `getCurrentUser()` が返すのはCanvasの実利用者IDであり、
 * 架空名簿には存在しない。
 *
 * 修正: **テーブルにある受講生IDを起点にする**（`listStudentsWithChatLogs`）。
 *
 * **なぜE2Eではなくここで固定するか**: 名簿外のIDで会話ログを作るには、
 * 任意のIDで記録を差し込む開発用エンドポイントが要る。テストのためだけに
 * 本番へその口を増やすのは攻撃面を広げるので採らない（CLAUDE.md 9章）。
 * 画面がこの関数を使っていることは、通常のE2E（LOG-N1）が併せて担保する。
 */
describe("会話ログの一覧起点（2026-09-02の回帰）", () => {
  /** 架空名簿に存在しないID。LTIの実利用者（Canvasのsub）を模す */
  const LTI_LIKE_ID = "lti-user-0f8c2a1b";

  beforeEach(async () => {
    await resetStore();
  });

  it("前提: このIDは架空名簿に含まれていない", () => {
    expect(STUDENTS.some((s) => s.id === LTI_LIKE_ID)).toBe(false);
  });

  it("**名簿に無いIDでも、記録があれば一覧の起点に出る**", async () => {
    await recordChatLog({
      studentId: LTI_LIKE_ID,
      maskedQuestion: "STEP03では何をしますか",
      reply: "本校のカリキュラムは確認していません",
      blocked: false,
      piiDetected: false,
    });

    const ids = await listStudentsWithChatLogs();
    expect(ids).toContain(LTI_LIKE_ID);

    const logs = await listChatLogs(LTI_LIKE_ID);
    expect(logs).toHaveLength(1);
    expect(logs[0].maskedQuestion).toBe("STEP03では何をしますか");
  });

  it("記録が無ければ起点も空（存在しないIDを並べない）", async () => {
    expect(await listStudentsWithChatLogs()).toEqual([]);
  });

  it("同じ受講生の複数件は1つにまとまる（重複して並ばない）", async () => {
    for (const q of ["質問1", "質問2", "質問3"]) {
      await recordChatLog({
        studentId: LTI_LIKE_ID,
        maskedQuestion: q,
        blocked: false,
        piiDetected: false,
      });
    }
    expect(await listStudentsWithChatLogs()).toEqual([LTI_LIKE_ID]);
    expect(await listChatLogs(LTI_LIKE_ID)).toHaveLength(3);
  });
});

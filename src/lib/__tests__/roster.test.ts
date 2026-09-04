import { beforeEach, describe, expect, it } from "vitest";
import { resetStore } from "@/lib/f3/store";
import { STUDENTS } from "@/lib/f4/fixtures";
import { getRoster, recordStudentLaunch, purgeStudentFromRoster } from "../roster";

/**
 * 受講生名簿（2026-09-02追加）。
 *
 * **解決している問題**: 講師画面が架空名簿を使い、受講生の画面はLTIの `sub` で
 * 自分のデータを引いていたため、IDが噛み合わず「講師が送った一言が実受講生に
 * 届かない」「会話ログが0件に見える」が本番で起きた。
 *
 * ここで固定する性質:
 * 1. LTI起動が1件も無ければ架空名簿（デモ・E2E・開校前）
 * 2. **1件でもあれば実名簿だけ**（架空と混ぜない）
 * 3. 座席は device_assignments から引く
 */
describe("受講生名簿", () => {
  beforeEach(async () => {
    await resetStore();
  });

  it("LTI起動の記録が無ければ架空名簿を返す（デモ・E2E・開校前）", async () => {
    const roster = await getRoster();
    expect(roster).toEqual(STUDENTS);
    expect(roster).toHaveLength(16);
  });

  it("**1件でも記録があれば、実名簿だけを返す**（架空と混ぜない）", async () => {
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "受講生A" });

    const roster = await getRoster();
    expect(roster).toHaveLength(1);
    expect(roster[0].id).toBe("lti-sub-aaa");
    // 架空名簿の受講生が混ざっていないこと（混ざると講師画面に架空の生徒が並ぶ）
    expect(roster.some((s) => s.id === "student-demo")).toBe(false);
  });

  it("座席は device_assignments から引く（割当が無ければ座席なし＝末尾）", async () => {
    // 最小シードは座席1に student-demo を割り当てている
    await recordStudentLaunch({ id: "student-demo", displayName: "実受講生01" });
    await recordStudentLaunch({ id: "lti-sub-zzz", displayName: "実受講生ZZ" });

    const roster = await getRoster();
    expect(roster[0]).toMatchObject({ id: "student-demo", seatNo: 1 });
    // 割当の無い受講生は座席0で末尾
    expect(roster[1]).toMatchObject({ id: "lti-sub-zzz", seatNo: 0 });
  });

  it("再起動で表示名を更新し、重複して増えない", async () => {
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "旧名" });
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "新名" });

    const roster = await getRoster();
    expect(roster).toHaveLength(1);
    expect(roster[0].displayName).toBe("新名");
  });

  it("**一度取れた canvas_user_id を、取れない起動で消さない**", async () => {
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "受講生A", canvasUserId: 4321 });
    // カスタムフィールド未設定の起動（canvasUserId なし）が後から来ても消えない
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "受講生A" });

    const roster = await getRoster();
    expect(roster).toHaveLength(1);
  });

  it("表示名が取れない起動でも、IDで一覧に出る", async () => {
    await recordStudentLaunch({ id: "lti-sub-noname" });
    const roster = await getRoster();
    expect(roster[0].displayName).toBe("lti-sub-noname");
  });

  it("退会者データ削除で名簿から消える（S6のタイルに残さない）", async () => {
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "受講生A" });
    expect(await purgeStudentFromRoster("lti-sub-aaa")).toBe(1);
    // 全員消えたので架空名簿へ戻る
    expect(await getRoster()).toEqual(STUDENTS);
  });
});

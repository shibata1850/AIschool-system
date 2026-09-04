import { beforeEach, describe, expect, it } from "vitest";
import {
  getDeviceAssignments,
  purgeStudentData,
  resetStore,
  setDeviceStudent,
} from "@/lib/f3/store";
import { getRoster, recordStudentLaunch } from "../roster";

/**
 * 座席への受講生割当（2026-09-04追加）。
 *
 * **解決している問題**: 名簿をLTI起動の記録から作るようにした（0007）あとも、
 * 座席の割当表は初期データの架空ID（s02 など）のままだった。実際にLTIで起動した
 * 受講生はどの座席にも紐づかず、講師画面で**座席番号 0** と表示された。
 *
 * ここで固定する性質:
 * 1. 割り当てると名簿の座席番号に反映される
 * 2. **同じ受講生は2席に居ない**（席を移すと前の席が空く）
 * 3. 空席に戻せる
 * 4. 退会者データ削除で座席が空く（IDを割当表に残さない）
 */
describe("座席への受講生割当", () => {
  beforeEach(async () => {
    await resetStore();
  });

  it("割り当てると名簿の座席番号に反映される", async () => {
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "受講生A" });

    const result = await setDeviceStudent(3, "lti-sub-aaa");
    expect(result?.row.studentId).toBe("lti-sub-aaa");

    const roster = await getRoster();
    expect(roster[0]).toMatchObject({ id: "lti-sub-aaa", seatNo: 3 });
  });

  it("**席を移すと前の席が空く**（同じ受講生が2席に居ない）", async () => {
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "受講生A" });
    await setDeviceStudent(3, "lti-sub-aaa");
    await setDeviceStudent(7, "lti-sub-aaa");

    const seats = await getDeviceAssignments();
    const occupied = seats.filter((s) => s.studentId === "lti-sub-aaa");
    expect(occupied).toHaveLength(1);
    expect(occupied[0].seatNo).toBe(7);
    expect(seats.find((s) => s.seatNo === 3)?.studentId).toBeNull();
  });

  it("空席に戻せる（座席番号なし＝0として名簿の末尾へ）", async () => {
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "受講生A" });
    await setDeviceStudent(3, "lti-sub-aaa");
    await setDeviceStudent(3, null);

    const seats = await getDeviceAssignments();
    expect(seats.find((s) => s.seatNo === 3)?.studentId).toBeNull();
    expect((await getRoster())[0].seatNo).toBe(0);
  });

  it("存在しない座席は undefined を返す（APIは404にする）", async () => {
    expect(await setDeviceStudent(99, null)).toBeUndefined();
  });

  it("退会者データ削除で座席が空く（IDを割当表に残さない）", async () => {
    await recordStudentLaunch({ id: "lti-sub-aaa", displayName: "受講生A" });
    await setDeviceStudent(3, "lti-sub-aaa");

    const result = await purgeStudentData("lti-sub-aaa");
    expect(result.releasedSeats).toBe(1);

    const seats = await getDeviceAssignments();
    // 席の行自体は残る（座席とNUCは備品であって個人データではない）
    expect(seats.find((s) => s.seatNo === 3)).toBeDefined();
    expect(seats.find((s) => s.seatNo === 3)?.studentId).toBeNull();
  });
});

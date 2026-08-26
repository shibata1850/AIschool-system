import { beforeEach, describe, expect, it } from "vitest";
import { findSubmission, resetStore, updateSubmissionIfVersion } from "../store";

/**
 * 版数一致を条件にした更新（楽観ロック）の直接検証（既知残課題#1の解消）。
 * 旧実装は「同一プロセス内でawaitを挟まない」ことに依存しており複数プロセスの
 * 競合には対応できなかった。DB側のWHERE条件で不可分に判定するため、
 * 複数リクエスト・複数プロセスからの同時書込みでも一方だけが成立することを確認する。
 */
describe("updateSubmissionIfVersion（楽観ロック）", () => {
  beforeEach(async () => {
    await resetStore();
  });

  it("版数が一致する場合は更新が成立する", async () => {
    const base = await findSubmission("a1", "student-demo");
    expect(base).toBeDefined();
    const updated = await updateSubmissionIfVersion(
      { ...base!, promptText: "更新後" },
      base!.version,
    );
    expect(updated).not.toBeNull();
    expect(updated?.promptText).toBe("更新後");
  });

  it("版数が一致しない場合はnullを返し、既存データを変更しない（別端末が先に更新済み）", async () => {
    const base = await findSubmission("a1", "student-demo");
    // 先に別の更新が成立して版数が進んだ状況を再現
    await updateSubmissionIfVersion(
      { ...base!, promptText: "先の更新", version: base!.version + 1 },
      base!.version,
    );

    // 古い版数のまま更新しようとすると失敗する
    const conflicted = await updateSubmissionIfVersion(
      { ...base!, promptText: "競合した更新" },
      base!.version,
    );
    expect(conflicted).toBeNull();

    const current = await findSubmission("a1", "student-demo");
    expect(current?.promptText).toBe("先の更新");
  });

  it("同時に2件の更新が競合しても一方だけが成立する（真の並行実行）", async () => {
    const base = await findSubmission("a1", "student-demo");
    const [a, b] = await Promise.all([
      updateSubmissionIfVersion(
        { ...base!, promptText: "A", version: base!.version + 1 },
        base!.version,
      ),
      updateSubmissionIfVersion(
        { ...base!, promptText: "B", version: base!.version + 1 },
        base!.version,
      ),
    ]);
    const succeeded = [a, b].filter((r) => r !== null);
    expect(succeeded).toHaveLength(1);
  });
});

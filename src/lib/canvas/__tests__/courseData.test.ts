import { describe, expect, it } from "vitest";
import { CanvasApiError, type CanvasClient } from "../client";
import { resolveCourseData, stripHtml, toDomainAssignment } from "../courseData";

function stubClient(overrides: Partial<CanvasClient>): CanvasClient {
  return overrides as CanvasClient;
}

describe("stripHtml", () => {
  it("タグを除去し、改行を保つ", () => {
    expect(stripHtml("<p>あいさつ</p><p>本文</p>")).toBe("あいさつ\n本文");
    expect(stripHtml("行1<br>行2")).toBe("行1\n行2");
  });
  it("実体参照を復元する", () => {
    expect(stripHtml("A&amp;B &lt;タグ&gt;")).toBe("A&B <タグ>");
  });
  it("nullは空文字", () => {
    expect(stripHtml(null)).toBe("");
  });
});

describe("toDomainAssignment", () => {
  it("Canvas課題をドメイン課題へ変換する", () => {
    const a = toDomainAssignment({
      id: 5,
      name: "紹介文をAIに書かせよう",
      description: "<p>説明</p>",
      points_possible: 100,
      due_at: "2026-10-19T14:59:00Z",
      published: true,
    });
    expect(a.id).toBe("5");
    expect(a.title).toBe("紹介文をAIに書かせよう");
    expect(a.description).toBe("説明");
    expect(a.charLimit).toBe(4000);
    expect(a.deadline).toBe("2026-10-19T14:59:00Z");
  });
  it("期限なしは遠い将来に置き換える（期限なし相当）", () => {
    const a = toDomainAssignment({
      id: 1, name: "x", description: null, points_possible: null, due_at: null, published: true,
    });
    expect(a.deadline).toBe("2099-12-31T23:59:00+09:00");
    expect(a.description).toBe("");
  });
});

describe("resolveCourseData", () => {
  it("未設定なら notConfigured", async () => {
    expect((await resolveCourseData(null)).state).toBe("notConfigured");
  });

  it("コースが無ければ empty", async () => {
    const client = stubClient({ listCourses: async () => [] });
    expect((await resolveCourseData(client)).state).toBe("empty");
  });

  it("先頭コースの名簿と公開課題のみを返す", async () => {
    const client = stubClient({
      listCourses: async () => [
        { id: 1, name: "デモコース（架空）" },
        { id: 2, name: "別コース" },
      ],
      listStudents: async (courseId: number) => {
        expect(courseId).toBe(1); // 先頭コースを対象にする
        return [
          { id: 11, name: "デモ生徒01" },
          { id: 12, name: "デモ生徒02" },
        ];
      },
      listAssignments: async () => [
        { id: 1, name: "公開課題", description: "<p>本文</p>", points_possible: 100, due_at: null, published: true },
        { id: 2, name: "下書き課題", description: null, points_possible: null, due_at: null, published: false },
      ],
    });
    const data = await resolveCourseData(client);
    expect(data.state).toBe("ok");
    if (data.state === "ok") {
      expect(data.course.id).toBe(1);
      expect(data.students).toHaveLength(2);
      expect(data.assignments).toHaveLength(1); // 未公開は除外
      expect(data.assignments[0].title).toBe("公開課題");
      expect(data.assignments[0].description).toBe("本文");
    }
  });

  it("APIエラーはメッセージ化して返す（本文は漏らさない）", async () => {
    const client = stubClient({
      listCourses: async () => {
        throw new CanvasApiError(401, "秘匿本文");
      },
    });
    const data = await resolveCourseData(client);
    expect(data.state).toBe("error");
    if (data.state === "error") {
      expect(data.message).toContain("トークン");
      expect(data.message).not.toContain("秘匿");
    }
  });
});

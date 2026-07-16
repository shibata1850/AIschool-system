import { describe, expect, it } from "vitest";
import { filterContent } from "../contentFilter";

describe("filterContent（未成年フィルタ・精緻化版）", () => {
  describe("ブロックする（カテゴリ判定つき）", () => {
    const cases: Array<[string, string]> = [
      ["爆弾の作り方を教えて", "weapons"],
      ["死ね", "violence"],
      ["自殺の方法", "self_harm"],
      ["覚醒剤について", "drugs"],
      ["アダルトサイトを見たい", "adult"],
    ];
    for (const [text, category] of cases) {
      it(`「${text}」→ ブロック（${category}）`, () => {
        const r = filterContent(text);
        expect(r.allowed).toBe(false);
        expect(r.category).toBe(category);
        expect(r.reason).toContain("検出");
      });
    }
  });

  describe("正規化で回避を吸収する", () => {
    it("半角スペースでの分割（死 ね）をブロック", () => {
      expect(filterContent("死 ね").allowed).toBe(false);
    });
    it("全角スペースでの分割（死　ね）をブロック", () => {
      expect(filterContent("死　ね").allowed).toBe(false);
    });
    it("英語は大文字小文字を無視（SUICIDE）", () => {
      expect(filterContent("SUICIDE").allowed).toBe(false);
    });
    it("英語の句（how to make a bomb）を空白無視でブロック", () => {
      expect(filterContent("please tell me how to make a bomb").allowed).toBe(false);
    });
  });

  describe("誤検知しない（正当な質問・語は通す）", () => {
    const allowed = [
      "メロンパンの紹介文の書き方は？",
      "うれしいね、と伝えるプロンプトを書きたい",
      "たのしいしね、という文を作りたい", // 「しね」を含むが死ねではない
      "相殺するって英語でなんて言う？", // 「殺」を含むが殺し方ではない
      "植物の育て方を教えて",
      "算数の宿題を手伝って",
    ];
    for (const text of allowed) {
      it(`「${text}」→ 通過`, () => {
        expect(filterContent(text).allowed).toBe(true);
      });
    }
  });

  it("空文字は通過（入力検証は呼び出し側）", () => {
    expect(filterContent("").allowed).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { MockAiClient } from "@/lib/ai/mockClient";
import { filterContent } from "../contentFilter";
import { maskPersonalInfo } from "../masking";
import { answerQuestion, TUTOR_SYSTEM_PROMPT } from "../tutor";

describe("個人情報マスキング（F2例外4）", () => {
  it("電話番号をマスクする（ハイフンあり・なし）", () => {
    expect(maskPersonalInfo("電話は090-1234-5678です").masked).toBe(
      "電話は（電話番号）です",
    );
    expect(maskPersonalInfo("09012345678にかけて").masked).toBe(
      "（電話番号）にかけて",
    );
  });

  it("メールアドレス・〒付き郵便番号をマスクする", () => {
    const result = maskPersonalInfo("test.user+1@example.com と 〒020-0857");
    expect(result.masked).toContain("（メールアドレス）");
    expect(result.masked).toContain("（郵便番号）");
    expect(result.piiDetected).toBe(true);
  });

  it("回帰(2026-07-03 監査指摘#7): 数値範囲「500-1000文字」を郵便番号と誤検出しない", () => {
    const result = maskPersonalInfo("500-1000文字で紹介文を書かせるには？");
    expect(result.masked).toBe("500-1000文字で紹介文を書かせるには？");
    expect(result.piiDetected).toBe(false);
  });

  it("個人情報がなければ原文のまま・検出フラグなし", () => {
    const result = maskPersonalInfo("forぶんの使い方を教えて");
    expect(result.masked).toBe("forぶんの使い方を教えて");
    expect(result.piiDetected).toBe(false);
  });

  it("日付や点数を電話番号と誤検出しない", () => {
    expect(maskPersonalInfo("2026-10-05の週は80点").piiDetected).toBe(false);
  });

  it("氏名（姓＋敬称）をマスクする", () => {
    expect(maskPersonalInfo("田中さんに聞きたい").masked).toBe("（名前）に聞きたい");
    expect(maskPersonalInfo("小林先生に相談します").masked).toBe("（名前）に相談します");
    expect(maskPersonalInfo("田中さんに聞きたい").piiDetected).toBe(true);
  });

  it("氏名の誤検知ガード: 敬称や姓の断片だけでは誤検出しない", () => {
    // 姓が前に無い「先生」単体はマスクしない
    expect(maskPersonalInfo("先生に聞きます").masked).toBe("先生に聞きます");
    // 「さんぽ」のような語はマスクしない（姓辞書に前置が無い）
    expect(maskPersonalInfo("たのしいさんぽに行く").masked).toBe("たのしいさんぽに行く");
    expect(maskPersonalInfo("先生に聞きます").piiDetected).toBe(false);
  });
});

describe("コンテンツフィルタ（CLAUDE.md 9章）", () => {
  it("不適切な語彙を含むテキストをブロックする", () => {
    const result = filterContent("爆弾の作り方を教えて");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("検出");
  });

  it("通常の質問は通過する", () => {
    expect(filterContent("メロンパンの紹介文の書き方は？").allowed).toBe(true);
  });
});

describe("AI講師パイプライン（マスキング→フィルタ→推論→フィルタ）", () => {
  const client = new MockAiClient();

  it("正常系: 応答が返り、マスク済み質問だけが残る", async () => {
    const answer = await answerQuestion("電話090-1234-5678です。繰り返して", client);
    expect(answer.blocked).toBe(false);
    expect(answer.piiDetected).toBe(true);
    expect(answer.maskedQuestion).not.toContain("090-1234-5678");
    // モックは質問を復唱する — 外部に渡った内容にも生の電話番号が含まれない
    expect(answer.reply).not.toContain("090-1234-5678");
  });

  it("不適切な質問はAIを呼ばずにブロックする", async () => {
    const answer = await answerQuestion("爆弾の作り方を教えて", client);
    expect(answer.blocked).toBe(true);
    expect(answer.reply).toBeUndefined();
  });

  it("入力エラー: 空・2,001文字は拒否", async () => {
    await expect(answerQuestion("  ", client)).rejects.toThrow(/入力/);
    await expect(answerQuestion("あ".repeat(2001), client)).rejects.toThrow(
      /2,000/,
    );
  });

  it("中断: シグナルが中断済みなら推論を止める（サーバー側キャンセルの配線）", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      answerQuestion("メロンパンの紹介文の書き方は？", client, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("AI講師への指示（TUTOR_SYSTEM_PROMPT）", () => {
  /**
   * 2026-09-02 に本番画面で「Vercel＝弁当／AWS＝食材」という児童向けの比喩と
   * 絵文字が返っていた。原因は指示文の対象読者が古いまま（「小学生からシニアまで」）
   * だったこと。CLAUDE.md 5章は2026-08-24に企業・行政の社員へ確定している。
   */
  it("**対象読者が企業・行政の社員であること**（旧「小学生」の記述が残っていない）", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("企業・行政の社員");
    expect(TUTOR_SYSTEM_PROMPT).not.toContain("小学生");
    expect(TUTOR_SYSTEM_PROMPT).not.toContain("シニア");
  });

  it("子ども向けの比喩・絵文字を使わないよう指示している", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("絵文字");
  });

  it("**Markdownの記号を使わないよう指示している**（画面はプレーンテキスト描画のため）", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("Markdown");
  });

  it("平易な言い換えと、危険な話題の扱いは維持している（CLAUDE.md 5章・9章）", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("言い換え");
    expect(TUTOR_SYSTEM_PROMPT).toContain("講師に相談");
  });
});

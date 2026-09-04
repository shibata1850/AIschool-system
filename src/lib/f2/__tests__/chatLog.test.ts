import { beforeEach, describe, expect, it } from "vitest";
import { resetStore } from "@/lib/f3/store";
import {
  listChatLogs,
  listTeacherMessages,
  purgeChatLogs,
  purgeTeacherMessages,
  recordChatLog,
  sendTeacherMessage,
  TeacherMessageError,
} from "../chatLog";
import { TEACHER_MESSAGE_LIMIT } from "../constants";

/**
 * 会話ログ（F2）と講師メッセージ（S6の介入導線）の永続化。
 * **保存するのはマスキング済みの本文だけ**という前提をここで固定する。
 */
describe("会話ログ", () => {
  beforeEach(async () => {
    await resetStore();
  });

  it("記録した会話を新しい順に取り出せる", async () => {
    await recordChatLog({
      studentId: "s1",
      maskedQuestion: "古い質問",
      reply: "古い回答",
      blocked: false,
      piiDetected: false,
    });
    await recordChatLog({
      studentId: "s1",
      maskedQuestion: "新しい質問",
      reply: "新しい回答",
      blocked: false,
      piiDetected: false,
      elapsedMs: 4200,
      model: "claude-haiku-4-5-20251001",
    });

    const logs = await listChatLogs("s1");
    expect(logs).toHaveLength(2);
    expect(logs[0].maskedQuestion).toBe("新しい質問");
    expect(logs[0].elapsedMs).toBe(4200);
  });

  it("ブロックした質問は回答を持たない（記録自体は残す）", async () => {
    await recordChatLog({
      studentId: "s1",
      maskedQuestion: "不適切な質問",
      blocked: true,
      piiDetected: false,
    });
    const [log] = await listChatLogs("s1");
    expect(log.blocked).toBe(true);
    expect(log.reply).toBeNull();
  });

  it("他人の会話は取り出せない（受講生ごとに分かれている）", async () => {
    await recordChatLog({
      studentId: "s1",
      maskedQuestion: "s1の質問",
      blocked: false,
      piiDetected: false,
    });
    expect(await listChatLogs("s2")).toHaveLength(0);
  });

  it("退会者データ削除で消える", async () => {
    await recordChatLog({
      studentId: "s1",
      maskedQuestion: "質問",
      blocked: false,
      piiDetected: false,
    });
    expect(await purgeChatLogs("s1")).toBe(1);
    expect(await listChatLogs("s1")).toHaveLength(0);
  });
});

describe("講師から受講生への一言", () => {
  beforeEach(async () => {
    await resetStore();
  });

  it("送った内容がそのまま取り出せる（改行を保つ）", async () => {
    const body = "次のプロンプトを試してください\nあなたは経理担当です";
    await sendTeacherMessage({ studentId: "s1", body });
    const [message] = await listTeacherMessages("s1");
    // プロンプト本文を渡す用途のため、改行を落としてはいけない
    expect(message.body).toBe(body);
  });

  it("前後の空白は落とすが、中の改行は保つ", async () => {
    await sendTeacherMessage({ studentId: "s1", body: "  1行目\n2行目  " });
    const [message] = await listTeacherMessages("s1");
    expect(message.body).toBe("1行目\n2行目");
  });

  it("入力エラー: 空・空白のみは拒否する", async () => {
    for (const body of ["", "   ", "\n"]) {
      await expect(sendTeacherMessage({ studentId: "s1", body })).rejects.toBeInstanceOf(
        TeacherMessageError,
      );
    }
  });

  it("境界値: 上限ちょうどは送れ、+1文字は拒否する", async () => {
    await expect(
      sendTeacherMessage({ studentId: "s1", body: "あ".repeat(TEACHER_MESSAGE_LIMIT) }),
    ).resolves.toBeDefined();
    await expect(
      sendTeacherMessage({ studentId: "s1", body: "あ".repeat(TEACHER_MESSAGE_LIMIT + 1) }),
    ).rejects.toBeInstanceOf(TeacherMessageError);
  });

  it("入力エラー: 宛先が空なら拒否する", async () => {
    await expect(
      sendTeacherMessage({ studentId: "  ", body: "テスト" }),
    ).rejects.toBeInstanceOf(TeacherMessageError);
  });

  it("退会者データ削除で消える", async () => {
    await sendTeacherMessage({ studentId: "s1", body: "テスト" });
    expect(await purgeTeacherMessages("s1")).toBe(1);
    expect(await listTeacherMessages("s1")).toHaveLength(0);
  });
});

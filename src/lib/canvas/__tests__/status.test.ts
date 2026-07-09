import { describe, expect, it } from "vitest";
import { CanvasApiError, type CanvasClient } from "../client";
import { fetchCanvasStatus } from "../status";

/** CanvasClient の必要メソッドだけを差し替えるスタブ */
function stubClient(overrides: Partial<CanvasClient>): CanvasClient {
  return overrides as CanvasClient;
}

describe("fetchCanvasStatus", () => {
  it("クライアント未設定なら notConfigured（インメモリ動作）", async () => {
    const status = await fetchCanvasStatus(null);
    expect(status.state).toBe("notConfigured");
  });

  it("接続成功なら管理者情報とコース一覧を返す", async () => {
    const client = stubClient({
      getSelf: async () => ({ id: 1, name: "管理者（架空）" }),
      listCourses: async () => [{ id: 10, name: "デモコース（架空）" }],
    });
    const status = await fetchCanvasStatus(client);
    expect(status.state).toBe("ok");
    if (status.state === "ok") {
      expect(status.me.name).toBe("管理者（架空）");
      expect(status.courses).toHaveLength(1);
      expect(status.courses[0].name).toBe("デモコース（架空）");
    }
  });

  it("401はトークン失効の案内メッセージにする", async () => {
    const client = stubClient({
      getSelf: async () => {
        throw new CanvasApiError(401, "秘匿本文");
      },
      listCourses: async () => [],
    });
    const status = await fetchCanvasStatus(client);
    expect(status.state).toBe("error");
    if (status.state === "error") {
      expect(status.message).toContain("トークン");
      expect(status.message).not.toContain("秘匿");
    }
  });

  it("403/429はレート制限・権限の案内にする", async () => {
    const client = stubClient({
      getSelf: async () => {
        throw new CanvasApiError(429, "throttled");
      },
      listCourses: async () => [],
    });
    const status = await fetchCanvasStatus(client);
    expect(status.state).toBe("error");
    if (status.state === "error") {
      expect(status.message).toContain("レート制限");
    }
  });

  it("想定外の例外でも投げずにerror状態を返す", async () => {
    const client = stubClient({
      getSelf: async () => {
        throw new Error("ネットワーク断");
      },
      listCourses: async () => [],
    });
    const status = await fetchCanvasStatus(client);
    expect(status.state).toBe("error");
    if (status.state === "error") {
      expect(status.message).toContain("想定外");
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOutageNotificationBody } from "../notifyOutage";

describe("outage notification guidance", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("directs students to the teacher when no material is configured", () => {
    vi.stubEnv("STATIC_MATERIAL_URL", "");
    vi.stubEnv("STATIC_MATERIAL_TITLE", "");
    const body = buildOutageNotificationBody("2026-09-15T04:00:00Z");
    expect(body).toContain("受講生には口頭で「分からないことは講師に聞いてください」");
    expect(body).not.toContain("教材で先に進めてください");
  });

  it("includes the material guidance only when a material is configured", () => {
    vi.stubEnv("STATIC_MATERIAL_URL", "https://example.com/material");
    vi.stubEnv("STATIC_MATERIAL_TITLE", "確認用教材");
    const body = buildOutageNotificationBody("2026-09-15T04:00:00Z");
    expect(body).toContain("教材「確認用教材」");
    expect(body).toContain("教材で先に進めてください");
    expect(body).toContain("分からないことは講師に聞いてください");
  });

  it("describes request-triggered recovery without promising a background timer", () => {
    vi.stubEnv("STATIC_MATERIAL_URL", "");
    const body = buildOutageNotificationBody("2026-09-15T04:00:00Z");
    expect(body).toContain("質問が送られた際に再試行");
    expect(body).toContain("応答に成功すると自動で元に戻ります");
    expect(body).not.toContain("1分ごとに再試行しています");
  });
});

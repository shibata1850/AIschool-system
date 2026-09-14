import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), get: vi.fn(), student: vi.fn(), backup: vi.fn(), audit: vi.fn(), roster: vi.fn(), config: vi.fn() }));
vi.mock("@/lib/lti/config", () => ({ getLtiConfig: mocks.config }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.actor }));
vi.mock("@/lib/f3/store", () => ({ getDeviceAssignment: mocks.get, setDeviceStudent: mocks.student, setDeviceBackup: mocks.backup }));
vi.mock("@/lib/audit/log", () => ({ recordAudit: mocks.audit }));
vi.mock("@/lib/roster", () => ({ getRoster: mocks.roster }));
import { POST as student } from "../../../../app/api/devices/[seatNo]/student/route";
import { POST as backup } from "../../../../app/api/devices/[seatNo]/backup/route";

describe("device endpoint authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockReturnValue({ toolUrl: "https://test.invalid" });
    mocks.get.mockResolvedValue({ seatNo: 1, studentId: "old", usingBackup: false });
    mocks.student.mockResolvedValue({ before: "old" });
  });
  for (const [name, handler, body] of [
    ["student", student, { studentId: null }],
    ["backup", backup, { usingBackup: true }],
  ] as const) {
    it.each(["student", "guest"])(`${name}: rejects %s before reading or writing`, async role => {
      mocks.actor.mockResolvedValue({ role, userId: "test", viaLti: true });
      const response = await handler(new NextRequest("https://test.invalid/api/devices/1/" + name, { method: "POST", headers: { origin: "https://test.invalid" }, body: JSON.stringify(body) }), { params: Promise.resolve({ seatNo: "1" }) });
      expect(response.status).toBe(403);
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.student).not.toHaveBeenCalled();
      expect(mocks.backup).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    });
    it.each([null, []])(`${name}: rejects non-object payload %j`, async body => {
      mocks.actor.mockResolvedValue({ role: "teacher", userId: "test", viaLti: true });
      const response = await handler(new NextRequest("https://test.invalid/api/devices/1/" + name, { method: "POST", headers: { origin: "https://test.invalid" }, body: JSON.stringify(body) }), { params: Promise.resolve({ seatNo: "1" }) });
      expect(response.status).toBe(400);
      expect(mocks.get).not.toHaveBeenCalled();
    });
    it.each([null, "https://other.invalid", "null"])(`${name}: rejects untrusted origin %s`, async origin => {
      mocks.actor.mockResolvedValue({ role: "teacher", userId: "test", viaLti: true });
      const response = await handler(new NextRequest("https://test.invalid/api/devices/1/" + name, { method: "POST", headers: origin ? { origin } : {}, body: JSON.stringify(body) }), { params: Promise.resolve({ seatNo: "1" }) });
      expect(response.status).toBe(403);
      expect(mocks.get).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    });
    it(`${name}: rejects missing trusted configuration`, async () => {
      mocks.config.mockReturnValue(null);
      mocks.actor.mockResolvedValue({ role: "admin", userId: "test", viaLti: true });
      const response = await handler(new NextRequest("https://test.invalid/api/devices/1/" + name, { method: "POST", headers: { origin: "https://test.invalid" }, body: JSON.stringify(body) }), { params: Promise.resolve({ seatNo: "1" }) });
      expect(response.status).toBe(403);
      expect(mocks.get).not.toHaveBeenCalled();
    });
    it.each(["teacher", "admin"])(`${name}: allows trusted %s and records the actor`, async role => {
      mocks.actor.mockResolvedValue({ role, userId: "test", viaLti: true });
      const response = await handler(new NextRequest("https://test.invalid/api/devices/1/" + name, { method: "POST", headers: { origin: "https://test.invalid" }, body: JSON.stringify(body) }), { params: Promise.resolve({ seatNo: "1" }) });
      expect(response.status).toBe(200);
      expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ actorRole: role, actorId: "test", entityId: "seat-1" }));
    });
  }
});

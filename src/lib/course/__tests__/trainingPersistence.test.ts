import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { CurrentUser } from "@/lib/auth";
import { readTrainingSettings, saveTrainingSettings } from "../trainingStore";

// Explicit opt-in keeps this destructive fault simulation confined to the isolated harness.
describe("training persistence on isolated PostgreSQL", () => {
  it("saves atomically, detects concurrent edits and preserves other courses", async () => {
    if (process.env.TRAINING_DB_TEST !== "1") throw new Error("Run via the isolated training DB harness (TRAINING_DB_TEST=1)");
    const url = new URL(process.env.DATABASE_ADMIN_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aischool_test") throw new Error("Isolated DB required");
    const admin = new Pool({ connectionString: url.href });
    const actor: CurrentUser = { role: "teacher", userId: "fictional-training-teacher", viaLti: true, courseId: "training-a" };
    const policy = { materialUrls: [], quizUrls: [] };
    const input = { courseId: "training-a", mode: "btob", currentDay: 1, revision: 0,
      days: [{ day: 1, title: "授業1", materialUrl: null, quizUrl: null }] };
    try {
      const results = await Promise.allSettled([
        saveTrainingSettings(actor, input, policy), saveTrainingSettings(actor, input, policy),
      ]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason.status).toBe(409);
      expect(await readTrainingSettings(actor, "training-a")).toEqual({ ...input, revision: 1 });
      await saveTrainingSettings({ ...actor, courseId: "training-b" }, { ...input, courseId: "training-b" }, policy);
      const next = { ...input, revision: 1, currentDay: null, days: [] };
      expect(await saveTrainingSettings(actor, next, policy)).toEqual({ ...next, revision: 2 });
      expect((await readTrainingSettings(actor, "training-b"))?.days).toHaveLength(1);
      const audit = await admin.query("SELECT action FROM audit_log WHERE entity = 'course_training_settings' AND entity_id = 'training-a' ORDER BY id");
      expect(audit.rows.map(row => row.action)).toEqual(["create", "update"]);
      // Failure at the last write must also undo the setting/day writes.
      await admin.query("REVOKE INSERT ON audit_log FROM aischool_app");
      try {
        await expect(saveTrainingSettings(actor, { ...input, revision: 2 }, policy)).rejects.toThrow();
        expect(await readTrainingSettings(actor, "training-a")).toEqual({ ...next, revision: 2 });
      } finally { await admin.query("GRANT INSERT ON audit_log TO aischool_app"); }
    } finally { await admin.end(); }
  });
});

afterAll(async () => {
  if (process.env.TRAINING_DB_TEST === "1" && globalThis.__dbPool) {
    await globalThis.__dbPool.end();
    globalThis.__dbPool = undefined;
  }
});

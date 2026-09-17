import { request, type FullConfig } from "@playwright/test";

export default async function setup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  if (process.env.TRAINING_DB_TEST !== "1" || new URL(baseURL).hostname !== "localhost") throw new Error("Local test only");
  const client = await request.newContext({ baseURL });
  try {
    const response = await client.post("/api/dev/reset", { headers: { cookie: "role=teacher" } });
    if (!response.ok()) throw new Error(`Local fixture initialization failed: ${response.status()}`);
    // Compile the development chat route before browser response-time assertions.
    // Empty input is rejected before mock inference and does not create a chat log.
    const chat = await client.post("/api/chat", {
      headers: { cookie: "role=student" }, data: { question: "" },
    });
    if (chat.status() !== 400) throw new Error(`Local chat readiness failed: ${chat.status()}`);
    // Invalid type is rejected before any submission mutation or mock grading.
    const submission = await client.post("/api/exercises/a1/submit", {
      headers: { cookie: "role=student" }, data: { promptText: null },
    });
    if (submission.status() !== 400) throw new Error(`Local submission readiness failed: ${submission.status()}`);
    const review = await client.post("/api/submissions/s1/review", {
      headers: { cookie: "role=teacher" }, data: { action: "invalid-readiness-probe" },
    });
    if (review.status() !== 400) throw new Error(`Local review readiness failed: ${review.status()}`);
    // Multi-tab outage tests must not overlap first-time route compilation/HMR.
    for (const [path, role] of [["/chat", "student"], ["/teacher/monitor", "teacher"], ["/admin/audit", "admin"]]) {
      const page = await client.get(path, { headers: { cookie: `role=${role}` } });
      if (page.status() !== 200) throw new Error(`Local page readiness failed: ${path} (${page.status()})`);
    }
  } finally { await client.dispose(); }
}

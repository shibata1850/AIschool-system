import { expect, test } from "@playwright/test";
import pg from "pg";
import { setRole } from "../helpers";

test("監査ログの長いIDと変更前後JSONが画面幅に収まり全文を保持する", async ({ page, baseURL }, info) => {
  const url = new URL(process.env.DATABASE_ADMIN_URL!);
  if (process.env.TRAINING_DB_TEST !== "1" || url.hostname !== "127.0.0.1" ||
      url.pathname !== "/aischool_test" || new URL(baseURL!).hostname !== "localhost") {
    throw new Error("Isolated audit fixture required");
  }
  const entityId = `fictional-audit-${info.project.name}-${"x".repeat(160)}`;
  const before = { days: [{ title: "a".repeat(240), materialUrl: null }], revision: 1 };
  const after = { days: [{ title: "b".repeat(240), materialUrl: null }], revision: 2 };
  const client = new pg.Client({ connectionString: url.href });
  await client.connect();
  try {
    await client.query(`INSERT INTO audit_log
      (at,actor_role,actor_id,action,entity,entity_id,"before","after")
      VALUES (now(),'admin',$1,'update','course_training_settings',$2,$3,$4)`,
    [`fictional-actor-${"z".repeat(120)}`, entityId, JSON.stringify(before), JSON.stringify(after)]);
  } finally { await client.end(); }
  await setRole(page, "admin");
  for (const width of [1366, 390, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const response = await page.goto("/admin/audit");
    expect(response?.status()).toBe(200);
    const row = page.getByRole("row").filter({ hasText: entityId });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").nth(4)).toHaveText(JSON.stringify(before));
    await expect(row.getByRole("cell").nth(5)).toHaveText(JSON.stringify(after));
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cells: Array.from(document.querySelectorAll("td")).some(cell => cell.scrollWidth > cell.clientWidth + 1),
    }));
    expect(overflow.page).toBeLessThanOrEqual(1);
    expect(overflow.cells).toBe(false);
    await page.screenshot({ path: info.outputPath(`audit-${width}.png`), fullPage: true });
  }
});

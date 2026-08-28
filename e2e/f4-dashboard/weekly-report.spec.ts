import { expect, test } from "@playwright/test";
import { resetStore, setRole } from "../helpers";

/**
 * F4-N1（週次レポートの自動生成バッチ）のE2E。
 * docs/テスト計画書.md 3章 F4-N1「月曜7:00相当の実行でレポート生成・通知」に対応。
 * 4パス: 正常系 / 入力エラー系 / 権限系 / 境界値
 *
 * 通常運用は cron（scripts/generate-weekly-report.ts）が実行するが、
 * E2Eからは同じ生成処理を呼ぶ管理者API経由で「月曜7:00相当の実行」を再現する。
 */

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("F4-N1 正常系: バッチ実行でレポートが生成され、画面に生成時刻と内容が出る", async ({
  page,
  request,
}) => {
  // 生成前は未生成であることが明示される
  await setRole(page, "teacher");
  await page.goto("/teacher/report");
  await expect(page.getByLabel("未生成")).toBeVisible();

  // 月曜7:00相当のバッチ実行（対象週を明示）
  const res = await request.post("/api/admin/reports/weekly", {
    data: { weekStart: "2026-10-19" },
    headers: { cookie: "role=admin" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.weekStart).toBe("2026-10-19");
  expect(body.studentCount).toBeGreaterThan(0);

  // 画面に生成結果が反映される
  await page.goto("/teacher/report");
  await expect(page.getByLabel("生成状況")).toContainText("2026-10-19");
  await expect(page.getByLabel("未生成")).toBeHidden();
});

test("F4-N1 正常系: 未提出課題一覧が生成レポートに載る", async ({ page, request }) => {
  await request.post("/api/admin/reports/weekly", {
    data: { weekStart: "2026-10-19" },
    headers: { cookie: "role=admin" },
  });

  await setRole(page, "teacher");
  await page.goto("/teacher/report");
  // 最小シードの student-demo は課題a1が未完了のまま
  await expect(page.getByLabel("未提出課題一覧")).toContainText(
    "お店の紹介文をAIに書かせよう",
  );
});

test("F4-N1 正常系: Canvas未接続のときは未通知の理由が表示される", async ({
  page,
  request,
}) => {
  // E2EはCanvas未接続で動く（playwright.config.ts でCANVAS_BASE_URLを空にしている）
  await request.post("/api/admin/reports/weekly", {
    data: { weekStart: "2026-10-19" },
    headers: { cookie: "role=admin" },
  });

  await setRole(page, "teacher");
  await page.goto("/teacher/report");
  await expect(page.getByLabel("通知状況")).toContainText("未通知");
  await expect(page.getByLabel("通知状況")).toContainText("Canvas未接続");
});

test("F4-N1 正常系: 同じ週の再実行は上書きされ、重複しない", async ({ page, request }) => {
  for (let i = 0; i < 2; i += 1) {
    const res = await request.post("/api/admin/reports/weekly", {
      data: { weekStart: "2026-10-19" },
      headers: { cookie: "role=admin" },
    });
    expect(res.status()).toBe(200);
  }

  await setRole(page, "teacher");
  await page.goto("/teacher/report");
  // 対象週の表示が1件だけ（重複行が増えない）
  await expect(page.getByLabel("生成状況")).toHaveCount(1);
});

test("F4-E1 入力エラー: weekStartの形式が不正なら400", async ({ request }) => {
  const res = await request.post("/api/admin/reports/weekly", {
    data: { weekStart: "2026/10/19" },
    headers: { cookie: "role=admin" },
  });
  expect(res.status()).toBe(400);
});

test("F4-E2 入力エラー: 不正なJSONボディは500ではなく400になる", async ({ request }) => {
  const res = await request.post("/api/admin/reports/weekly", {
    data: "{壊れたJSON",
    headers: { cookie: "role=admin", "content-type": "application/json" },
  });
  expect(res.status()).toBe(400);
});

test("F4-P1 権限系: 講師・受講生・ゲストは生成APIを叩けない（管理者のみ）", async ({
  request,
}) => {
  for (const role of ["teacher", "student", "guest"]) {
    const res = await request.post("/api/admin/reports/weekly", {
      data: { weekStart: "2026-10-19" },
      headers: { cookie: `role=${role}` },
    });
    expect(res.status()).toBe(403);
  }
});

test("F4-B1 境界値: weekStart省略時は実行日の週で生成される", async ({ request }) => {
  const res = await request.post("/api/admin/reports/weekly", {
    data: {},
    headers: { cookie: "role=admin" },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  // 月曜起点のISO日付が返る
  expect(body.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(new Date(`${body.weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
});

test("F4-B1 境界値: 生成が監査ログに記録される（点数は残さない）", async ({
  page,
  request,
}) => {
  await request.post("/api/admin/reports/weekly", {
    data: { weekStart: "2026-10-19" },
    headers: { cookie: "role=admin" },
  });

  await setRole(page, "admin");
  await page.goto("/admin/audit");
  await expect(page.locator("body")).toContainText("weekly_report / 2026-10-19");
});

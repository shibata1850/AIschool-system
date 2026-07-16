import { expect, test } from "@playwright/test";
import { resetStore } from "../helpers";

/**
 * 保持期限による学習データ削除（Pマーク・要件定義書5.3・未決#10・TASK F）。
 * 管理者のみ。退会後の保持期限を過ぎた受講生の学習データを削除し、監査に残す。
 * 4パス: 正常系 / 入力エラー系 / 権限系 / 境界値（保持期限内は削除しない）
 */
const URL = "/api/admin/retention/purge";

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("RET-N 正常系: 保持期限を過ぎた退会者の学習データを削除し、再実行しても安全", async ({
  request,
}) => {
  const res = await request.post(URL, {
    headers: { cookie: "role=admin" },
    data: {
      confirm: true,
      withdrawals: [{ studentId: "student-demo", withdrawnAt: "2000-01-01" }],
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.purgedCount).toBe(1);
  expect(body.purged[0].studentId).toBe("student-demo");
  expect(body.purged[0].hadLessonRecords).toBe(true);
  expect(body.purged[0].deletedSubmissions).toBeGreaterThan(0);

  // 冪等: もう一度実行しても削除対象は残っていない
  const res2 = await request.post(URL, {
    headers: { cookie: "role=admin" },
    data: {
      confirm: true,
      withdrawals: [{ studentId: "student-demo", withdrawnAt: "2000-01-01" }],
    },
  });
  const body2 = await res2.json();
  expect(body2.purged[0].hadLessonRecords).toBe(false);
  expect(body2.purged[0].deletedSubmissions).toBe(0);
});

test("RET-N2 削除は監査ログに記録される（管理者が確認できる）", async ({ request }) => {
  await request.post(URL, {
    headers: { cookie: "role=admin" },
    data: {
      confirm: true,
      withdrawals: [{ studentId: "student-demo", withdrawnAt: "2000-01-01" }],
    },
  });
  const audit = await request.get("/admin/audit", {
    headers: { cookie: "role=admin" },
  });
  expect(audit.status()).toBe(200);
  expect(await audit.text()).toContain("student_data");
});

test("RET-E1 入力エラー: confirm が無いと削除しない（400）", async ({ request }) => {
  const res = await request.post(URL, {
    headers: { cookie: "role=admin" },
    data: { withdrawals: [{ studentId: "student-demo", withdrawnAt: "2000-01-01" }] },
  });
  expect(res.status()).toBe(400);
});

test("RET-E2 入力エラー: 退会日が不正だと400", async ({ request }) => {
  const res = await request.post(URL, {
    headers: { cookie: "role=admin" },
    data: {
      confirm: true,
      withdrawals: [{ studentId: "student-demo", withdrawnAt: "いつか" }],
    },
  });
  expect(res.status()).toBe(400);
});

test("RET-P 権限系: 受講生・講師は削除できない（403）", async ({ request }) => {
  for (const role of ["student", "teacher"]) {
    const res = await request.post(URL, {
      headers: { cookie: `role=${role}` },
      data: {
        confirm: true,
        withdrawals: [{ studentId: "student-demo", withdrawnAt: "2000-01-01" }],
      },
    });
    expect(res.status()).toBe(403);
  }
});

test("RET-B 境界値: 保持期限内（退会直後）の受講生は削除しない", async ({ request }) => {
  const res = await request.post(URL, {
    headers: { cookie: "role=admin" },
    data: {
      confirm: true,
      withdrawals: [
        { studentId: "student-demo", withdrawnAt: new Date().toISOString() },
      ],
    },
  });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.purgedCount).toBe(0);
});

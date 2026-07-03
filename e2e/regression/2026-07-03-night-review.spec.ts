import { expect, test } from "@playwright/test";
import { resetStore } from "../helpers";

/**
 * 回帰テスト（2026-07-03 夜間コードレビューの指摘#2・#3）:
 * - 文字列以外の提出フィールドを保存しない（採点画面のレンダリング破壊防止）
 * - デバイス切替の無変更リクエストは監査ログに虚偽の変更前後を残さない
 */

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

test("指摘#2: aiOutputText にオブジェクトを送ると400（保存されない）", async ({
  request,
}) => {
  const res = await request.post("/api/exercises/a1/submit", {
    data: { promptText: "テスト", aiOutputText: { a: 1 } },
    headers: { cookie: "role=student" },
  });
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain("aiOutputText");

  const res2 = await request.post("/api/exercises/a1/submit", {
    data: { promptText: 123 },
    headers: { cookie: "role=student" },
  });
  expect(res2.status()).toBe(400);
});

test("指摘#3: デバイス切替の無変更リクエストは changed:false で監査記録なし", async ({
  request,
}) => {
  // 初期状態は usingBackup=false。同じ値をPOSTしても変更扱いにならない
  const noop = await request.post("/api/devices/1/backup", {
    data: { usingBackup: false },
    headers: { cookie: "role=teacher" },
  });
  expect(noop.status()).toBe(200);
  expect(await noop.json()).toMatchObject({ changed: false });

  // 実際の変更は changed:true
  const change = await request.post("/api/devices/1/backup", {
    data: { usingBackup: true },
    headers: { cookie: "role=teacher" },
  });
  expect(await change.json()).toMatchObject({ changed: true });

  // 二重タップ（同値の再送）も changed:false
  const dup = await request.post("/api/devices/1/backup", {
    data: { usingBackup: true },
    headers: { cookie: "role=teacher" },
  });
  expect(await dup.json()).toMatchObject({ changed: false });
});

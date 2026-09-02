import { expect, test } from "@playwright/test";
import { resetStore } from "../helpers";

/**
 * 回帰: **初回提出の同時実行で楽観ロックが効かず、全員の書き込みが成立していた**。
 *
 * 発見経緯: 16クライアント同時操作の負荷試験（`npm run test:load`・CLAUDE.md 7章）を
 * 初めて実施したところ、同時提出16件のうち **14件が受理**された（期待は1件）。
 *
 * 原因: `submit()` は**再提出のときだけ** `version` を増やす（初回提出では据え置き）。
 * そのため `updateSubmissionIfVersion(next, 読んだversion)` が
 * `WHERE version = 1` にマッチしたまま `version = 1` を書き戻し、
 * **行のversionが変わらないので後続の同時リクエストが全部マッチしてしまう**。
 *
 * 単体テスト（optimisticLock.test.ts）は `version: base.version + 1` を手で指定して
 * 部品だけを検証していたため、この経路を通っていなかった。
 *
 * 影響: 同一受講生が2つの端末・タブから同時に提出すると、**先に書いた本文が
 * 黙って上書きされて消える**（要件定義書 F3 の「別の端末で更新されています」が出ない）。
 */

const CLIENTS = 16;

test("REG-2026-09-02: 初回提出を同時に投げても、成立するのは1件だけ", async ({
  playwright,
  request,
  baseURL,
}) => {
  await resetStore(request);

  // 16クライアントが同一の版数を読んだ状態から、一斉に提出する
  const contexts = await Promise.all(
    Array.from({ length: CLIENTS }, () =>
      playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: { cookie: "role=student" },
      }),
    ),
  );

  const results = await Promise.all(
    contexts.map((ctx, i) =>
      ctx.post("/api/exercises/a1/submit", {
        data: {
          promptText: `クライアント${i + 1}のプロンプト`,
          expectedVersion: 1,
        },
      }),
    ),
  );
  const statuses = results.map((r) => r.status());
  await Promise.all(contexts.map((c) => c.dispose()));

  const accepted = statuses.filter((s) => s === 200);
  const conflicted = statuses.filter((s) => s === 409);

  // 受理は1件だけ。残りは「別の端末で更新されています」の409
  expect(accepted).toHaveLength(1);
  expect(conflicted).toHaveLength(CLIENTS - 1);
  // 500等が混ざっていないこと（競合は正しく検知して返すべきで、落ちてはいけない）
  expect(statuses.filter((s) => s !== 200 && s !== 409)).toHaveLength(0);
});

test("REG-2026-09-02: 先に提出した本文が、あとの同時提出に上書きされない", async ({
  playwright,
  request,
  baseURL,
}) => {
  await resetStore(request);

  const contexts = await Promise.all(
    Array.from({ length: CLIENTS }, () =>
      playwright.request.newContext({
        baseURL,
        extraHTTPHeaders: { cookie: "role=student" },
      }),
    ),
  );
  const results = await Promise.all(
    contexts.map((ctx, i) =>
      ctx
        .post("/api/exercises/a1/submit", {
          data: { promptText: `クライアント${i + 1}のプロンプト`, expectedVersion: 1 },
        })
        .then((r) => ({ index: i, status: r.status() })),
    ),
  );
  await Promise.all(contexts.map((c) => c.dispose()));

  const winner = results.find((r) => r.status === 200);
  expect(winner).toBeDefined();

  // 講師の採点画面に、成立した1件の本文がそのまま残っていること
  const review = await request.get("/teacher/review", {
    headers: { cookie: "role=teacher" },
  });
  const html = await review.text();
  expect(html).toContain(`クライアント${winner!.index + 1}のプロンプト`);
});

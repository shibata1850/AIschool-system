import { expect, test } from "@playwright/test";
import { INTEGRATION_TOKEN, integrationHeaders, resetStore, type Role } from "../helpers";

/**
 * SEC-1b APIの権限総当たり（要件定義書 9.2 F5①「全ロール×全画面の総当たり表」のAPI版）。
 *
 * **なぜ画面の総当たり（permissions.spec.ts）と別に要るのか**:
 * 権限昇格が実際に起きるのは画面ではなくAPIである。画面が403でも、その裏のAPIを
 * URL直打ちで叩けてしまえば意味がない。画面側は `permissions.spec.ts` が
 * 15画面×4ロールを網羅しているので、こちらは**全APIエンドポイント×4ロール**を担う。
 *
 * **判定の方針**: このスペックが見るのは「認可を通過したか」だけである。
 * - 非許可ロール → **403ちょうど**（proxy.ts が返す）
 * - 許可ロール   → **403以外**（その先の入力検証で400等になるのは正常。
 *                  ここで200を要求すると、認可ではなく各APIの正常系を
 *                  二重にテストすることになり、壊れやすくなる）
 *
 * 受け入れ時はこの結果表を `permissions.spec.ts` と合わせて添付する。
 */

const ROLES: Role[] = ["student", "teacher", "admin", "guest"];

type Endpoint = {
  name: string;
  method: "GET" | "POST";
  path: string;
  /** 認可を通過できるロール。ここに無いロールは403でなければならない */
  allowed: Role[];
  /** 副作用を最小にする、または認可判定へ到達させるための本文 */
  body?: Record<string, unknown>;
};

/**
 * 期待値の根拠は `proxy.ts` の3つの前方一致リスト:
 * - ADMIN_ONLY_PREFIXES   = /api/admin
 * - TEACHER_ONLY_PREFIXES = /api/submissions, /api/devices, /api/dev, /api/teacher
 * - NO_GUEST_PREFIXES     = /api/chat, /api/exercises
 * どのリストにも入らない経路（/api/integration, /api/lti）は別建てで検証する（後半2節）。
 */
const ENDPOINTS: Endpoint[] = [
  // ---- 管理者のみ ----
  {
    name: "週次レポート生成",
    method: "POST",
    path: "/api/admin/reports/weekly",
    allowed: ["admin"],
  },
  {
    name: "退会者データ削除",
    method: "POST",
    path: "/api/admin/retention/purge",
    // 破壊的操作なので confirm を立てない。管理者でも400で止まる（=認可は通過）
    body: { confirm: false, withdrawals: [] },
    allowed: ["admin"],
  },

  // ---- 講師・管理者のみ ----
  {
    name: "開発用リセット（破壊的）",
    method: "POST",
    path: "/api/dev/reset",
    allowed: ["teacher", "admin"],
  },
  {
    name: "予備機への切替",
    method: "POST",
    path: "/api/devices/1/backup",
    body: { usingBackup: false },
    allowed: ["teacher", "admin"],
  },
  {
    name: "提出物の採点・差戻し",
    method: "POST",
    path: "/api/submissions/s1/review",
    body: {},
    allowed: ["teacher", "admin"],
  },
  {
    name: "出席の記録",
    method: "POST",
    path: "/api/teacher/attendance",
    body: {},
    allowed: ["teacher", "admin"],
  },
  {
    name: "成績のCanvas書き戻し",
    method: "POST",
    path: "/api/teacher/grade",
    body: {},
    allowed: ["teacher", "admin"],
  },

  // ---- ゲスト以外（受講生・講師・管理者） ----
  {
    name: "AI講師への質問",
    method: "POST",
    path: "/api/chat",
    body: {},
    allowed: ["student", "teacher", "admin"],
  },
  {
    name: "演習の提出",
    method: "POST",
    path: "/api/exercises/a1/submit",
    body: {},
    allowed: ["student", "teacher", "admin"],
  },
];

test.beforeEach(async ({ request }) => {
  await resetStore(request);
});

for (const role of ROLES) {
  for (const ep of ENDPOINTS) {
    const permitted = ep.allowed.includes(role);
    const label = permitted ? "403以外（認可通過）" : "403";

    test(`SEC-1b: ${role} が ${ep.name}（${ep.method} ${ep.path}）→ ${label}`, async ({
      request,
    }) => {
      const options = {
        headers: { cookie: `role=${role}` },
        data: ep.body,
        // 認可の検証が目的。リダイレクト先の状態は見ない
        maxRedirects: 0,
      };
      const res =
        ep.method === "GET"
          ? await request.get(ep.path, options)
          : await request.post(ep.path, options);

      if (permitted) {
        expect(res.status()).not.toBe(403);
      } else {
        expect(res.status()).toBe(403);
      }
    });
  }
}

// ---------- 連携API: 人のロールでは絶対に通さない ----------

/**
 * `/api/integration/*` は proxy.ts のどのリストにも入っていない（意図的）。
 * 人のログインとは別系統の専用トークンで認証するため、**どのロールで来ても
 * トークンが無ければ401**でなければならない。ロールCookieで通ってしまうと、
 * 受講生が他人の到達度を書き換えられることになる。
 */
const INTEGRATION_ENDPOINTS: Endpoint[] = [
  { name: "単元マスタ参照", method: "GET", path: "/api/integration/units", allowed: [] },
  {
    name: "到達度の受信",
    method: "POST",
    path: "/api/integration/mastery",
    body: { items: [] },
    allowed: [],
  },
];

for (const role of ROLES) {
  for (const ep of INTEGRATION_ENDPOINTS) {
    test(`SEC-1b: ${role} のロールCookieでは ${ep.name}（${ep.path}）を通過できない → 401`, async ({
      request,
    }) => {
      const options = { headers: { cookie: `role=${role}` }, data: ep.body };
      const res =
        ep.method === "GET"
          ? await request.get(ep.path, options)
          : await request.post(ep.path, options);
      expect(res.status()).toBe(401);
    });
  }
}

test("SEC-1b: 連携トークンがあってもロールCookieの権限は増えない（管理者APIは403のまま）", async ({
  request,
}) => {
  // 連携トークンは /api/integration/* 専用。他のAPIの認可には一切効かない
  const res = await request.post("/api/admin/reports/weekly", {
    headers: { cookie: "role=student", ...integrationHeaders() },
  });
  expect(res.status()).toBe(403);
});

test("SEC-1b: 連携トークンは応答本文にもヘッダーにも現れない", async ({ request }) => {
  const res = await request.get("/api/integration/units", {
    headers: integrationHeaders(),
  });
  expect(res.status()).toBe(200);
  expect(await res.text()).not.toContain(INTEGRATION_TOKEN);
  expect(JSON.stringify(res.headers())).not.toContain(INTEGRATION_TOKEN);
});

// ---------- 本人以外のデータを掴めないこと（IDOR） ----------

/**
 * ロールの総当たりは「その役職で叩けるか」しか見ない。**同じ受講生ロールどうしで
 * 他人のデータを掴めるか**は別の話で、権限事故はむしろこちらで起きる。
 *
 * 現状の提出APIは `findSubmission(課題ID, ログイン中のuserId)` と本人でスコープしており、
 * 本文で誰の提出かを指定する余地が無い。**その性質をここで固定する**
 * （将来 body.studentId を読むように書き換わったら、このテストが落ちる）。
 */
test("SEC-1b: 提出APIは本文の studentId を信用しない（他人の提出を書き換えられない）", async ({
  request,
}) => {
  const res = await request.post("/api/exercises/a1/submit", {
    headers: { cookie: "role=student" },
    data: {
      // 攻撃側が「他人になりすます」ために足しそうな項目を一通り送る
      studentId: "s2",
      userId: "s2",
      promptText: "なりすまし確認用のプロンプト",
      reflectionText: "ふりかえり",
    },
  });
  // 本人の提出として処理される（=なりすまし項目は無視される）
  expect(res.status()).toBe(200);

  // 書き込まれたのは**呼び出した本人の**提出であること。
  // 最小シードの提出は student-demo の1件（id=s1）だけなので、監査ログの
  // entityId が s1 であれば、s2 の行ではなく本人の行が更新されたと言える
  const audit = await request.get("/admin/audit", {
    headers: { cookie: "role=admin" },
  });
  const auditHtml = await audit.text();
  expect(auditHtml).toContain("submission");
  expect(auditHtml).not.toContain("s2");
});

test("SEC-1b: 存在しない課題IDでも他人の提出は掴めない（404で止まる）", async ({ request }) => {
  const res = await request.post("/api/exercises/存在しない課題/submit", {
    headers: { cookie: "role=student" },
    data: { promptText: "x" },
  });
  expect(res.status()).toBe(404);
});

// ---------- LTIエンドポイント: 公開されていること自体が仕様 ----------

/**
 * `/api/lti/*` はCanvas（外部）から未ログイン状態で叩かれる入口なので、
 * ロールで塞いではならない。**403で塞がっていないこと**を明示的に固定する
 * （うっかり TEACHER_ONLY_PREFIXES 等へ追加するとLTI起動が全滅するため）。
 * 不正なリクエストは各ハンドラのid_token検証side で弾かれる。
 */
const LTI_ENDPOINTS: Array<{ name: string; method: "GET" | "POST"; path: string }> = [
  { name: "JWKS公開鍵", method: "GET", path: "/api/lti/jwks" },
  { name: "OIDCログイン", method: "GET", path: "/api/lti/login?iss=x&login_hint=y&target_link_uri=z" },
  { name: "LTI起動", method: "POST", path: "/api/lti/launch" },
];

for (const role of ROLES) {
  for (const ep of LTI_ENDPOINTS) {
    test(`SEC-1b: ${role} でも ${ep.name}（${ep.path.split("?")[0]}）はロールで塞がない → 403以外`, async ({
      request,
    }) => {
      const options = { headers: { cookie: `role=${role}` }, maxRedirects: 0 };
      const res =
        ep.method === "GET"
          ? await request.get(ep.path, options)
          : await request.post(ep.path, options);
      expect(res.status()).not.toBe(403);
    });
  }
}

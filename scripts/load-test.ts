/**
 * 16クライアント同時操作の負荷テスト（CLAUDE.md 7章「負荷要件」・
 * docs/テスト計画書.md 4章「16台負荷試験」・要件定義書 KPI#1）。
 *
 * 受け入れ前に1回実施する。実機16台が搬入される前に、ステージングへ向けて
 * 流しておくためのもの（当日は同じコマンドを実機のURLへ向ける）。
 *
 * 使い方:
 *   npm run test:load
 *   npm run test:load -- --base-url https://app.133-125-225-64.sslip.io --clients 16
 *
 * **測るものを2つに分けている理由**:
 * LTI起動でない環境では、ロールCookieの利用者は全員 `student-damo` ではなく
 * `student-demo`（`src/lib/auth.ts`）になる。つまり16クライアントが**同じ受講生**
 * として動くため、そのまま全員に提出させると楽観ロックの409が大量に出て、
 * 「システム起因の中断」と区別できなくなる。そこで、
 *
 *   フェーズ1（読み取り同時負荷）… サーバーの同時処理能力を測る。ここが本番の
 *                                   16台と同じ負荷形状になる
 *   フェーズ2（書き込み競合）    … 同時提出で楽観ロックが正しく効くかを見る。
 *                                   409は**期待される正しい応答**であって失敗ではない
 *
 * を分けて実施する。フェーズ2は実機16台（全員が別の受講生）より競合が厳しい
 * 条件なので、安全側の確認になる。
 *
 * 合格基準（docs/テスト計画書.md 4章）:
 *   - 画面遷移 3秒以内（90%ile）
 *   - 提出 5秒以内（90%ile）
 *   - システム起因の中断 0件（KPI#1）
 */
import { chromium, type Browser, type BrowserContext } from "@playwright/test";

interface Options {
  baseUrl: string;
  clients: number;
  iterations: number;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string, fallback: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
  };
  const clients = Number(get("clients", "16"));
  const iterations = Number(get("iterations", "3"));
  if (!Number.isInteger(clients) || clients < 1) {
    throw new Error("--clients は1以上の整数で指定してください");
  }
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error("--iterations は1以上の整数で指定してください");
  }
  return {
    baseUrl: get("base-url", "http://localhost:3000").replace(/\/$/, ""),
    clients,
    iterations,
  };
}

/** 90%ile（小さい方から数えて90%の位置）。件数が少なくても破綻しない取り方をする */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

interface Sample {
  label: string;
  ms: number;
  ok: boolean;
  detail?: string;
}

function summarize(samples: Sample[], label: string) {
  const target = samples.filter((s) => s.label === label);
  const ok = target.filter((s) => s.ok).map((s) => s.ms);
  return {
    label,
    count: target.length,
    failures: target.filter((s) => !s.ok),
    p50: Math.round(percentile(ok, 50)),
    p90: Math.round(percentile(ok, 90)),
    max: Math.round(Math.max(0, ...ok)),
  };
}

/** 1クライアント分の授業シナリオ（ホーム→演習→到達度）を iterations 回まわす */
async function runReadScenario(
  context: BrowserContext,
  opts: Options,
  samples: Sample[],
): Promise<void> {
  const page = await context.newPage();
  const steps: Array<{ label: string; path: string }> = [
    { label: "S1 ホーム", path: "/" },
    { label: "S2 演習", path: "/exercises/a1" },
    { label: "S5 到達度", path: "/achievement" },
  ];

  for (let i = 0; i < opts.iterations; i += 1) {
    for (const step of steps) {
      const started = Date.now();
      try {
        const res = await page.goto(`${opts.baseUrl}${step.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const status = res?.status() ?? 0;
        samples.push({
          label: step.label,
          ms: Date.now() - started,
          ok: status >= 200 && status < 400,
          detail: status >= 400 ? `HTTP ${status}` : undefined,
        });
      } catch (e) {
        samples.push({
          label: step.label,
          ms: Date.now() - started,
          ok: false,
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  await page.close();
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `16台負荷試験: ${opts.baseUrl} / ${opts.clients}クライアント / 各${opts.iterations}周\n`,
  );

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    });

    // 事前にストアを初期化する（前回の残りで結果が変わらないようにする）
    const reset = await fetch(`${opts.baseUrl}/api/dev/reset`, {
      method: "POST",
      headers: { cookie: "role=teacher" },
    });
    if (!reset.ok) {
      throw new Error(
        `ストア初期化に失敗しました（HTTP ${reset.status}）。` +
          `本番ビルドでは ALLOW_DEV_RESET=1 が必要です`,
      );
    }

    const contexts = await Promise.all(
      Array.from({ length: opts.clients }, () => browser!.newContext()),
    );
    for (const context of contexts) {
      await context.addCookies([
        {
          name: "role",
          value: "student",
          url: opts.baseUrl,
        },
      ]);
    }

    // ---------- フェーズ1: 読み取り同時負荷 ----------
    console.log("フェーズ1: 読み取り同時負荷（ホーム→演習→到達度）");
    const samples: Sample[] = [];
    const phase1Started = Date.now();
    await Promise.all(contexts.map((c) => runReadScenario(c, opts, samples)));
    const phase1Sec = ((Date.now() - phase1Started) / 1000).toFixed(1);

    const summaries = ["S1 ホーム", "S2 演習", "S5 到達度"].map((l) =>
      summarize(samples, l),
    );
    console.log(`  所要 ${phase1Sec}秒 / 総リクエスト ${samples.length}件\n`);
    console.log("  画面           件数   p50     p90     最大    失敗");
    for (const s of summaries) {
      console.log(
        `  ${s.label.padEnd(12)} ${String(s.count).padStart(5)} ${String(s.p50).padStart(6)}ms ${String(s.p90).padStart(6)}ms ${String(s.max).padStart(6)}ms ${String(s.failures.length).padStart(5)}`,
      );
    }

    // ---------- フェーズ2: 書き込み競合（同時提出） ----------
    console.log("\nフェーズ2: 書き込み競合（全クライアントが同時に提出）");
    const submitStarted = Date.now();
    const submitResults = await Promise.all(
      contexts.map(async (context, i) => {
        const started = Date.now();
        try {
          const res = await context.request.post(
            `${opts.baseUrl}/api/exercises/a1/submit`,
            {
              headers: { cookie: "role=student", "content-type": "application/json" },
              data: {
                promptText: `負荷試験クライアント${i + 1}のプロンプト`,
                reflectionText: "負荷試験",
                expectedVersion: 1,
              },
              timeout: 30_000,
            },
          );
          return { status: res.status(), ms: Date.now() - started };
        } catch (e) {
          return {
            status: 0,
            ms: Date.now() - started,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
    const submitSec = ((Date.now() - submitStarted) / 1000).toFixed(1);

    const accepted = submitResults.filter((r) => r.status === 200);
    const conflicted = submitResults.filter((r) => r.status === 409);
    const submitErrors = submitResults.filter(
      (r) => r.status !== 200 && r.status !== 409,
    );
    const submitMs = submitResults.filter((r) => r.status !== 0).map((r) => r.ms);

    console.log(`  所要 ${submitSec}秒`);
    console.log(`  受理(200): ${accepted.length}件 / 競合(409): ${conflicted.length}件 / その他: ${submitErrors.length}件`);
    console.log(
      `  応答時間 p50 ${Math.round(percentile(submitMs, 50))}ms / p90 ${Math.round(percentile(submitMs, 90))}ms / 最大 ${Math.round(Math.max(0, ...submitMs))}ms`,
    );

    // ---------- 判定 ----------
    console.log("\n判定（docs/テスト計画書.md 4章）");
    const navFailures = samples.filter((s) => !s.ok);
    const navP90 = Math.max(...summaries.map((s) => s.p90));
    const submitP90 = Math.round(percentile(submitMs, 90));

    const checks: Array<{ name: string; pass: boolean; detail: string }> = [
      {
        name: "画面遷移 3秒以内（90%ile）",
        pass: navP90 <= 3000,
        detail: `最も遅い画面の p90 = ${navP90}ms`,
      },
      {
        name: "提出 5秒以内（90%ile）",
        pass: submitP90 <= 5000,
        detail: `p90 = ${submitP90}ms`,
      },
      {
        name: "システム起因の中断 0件（KPI#1）",
        pass: navFailures.length === 0 && submitErrors.length === 0,
        detail: `画面 ${navFailures.length}件 / 提出 ${submitErrors.length}件`,
      },
      {
        name: "同時提出で楽観ロックが効く（受理は1件だけ）",
        // 409は正しい応答。全員が同じ受講生・同じ版数を指すため受理は1件のはず
        pass: accepted.length === 1 && conflicted.length === opts.clients - 1,
        detail: `受理 ${accepted.length}件 / 競合 ${conflicted.length}件（期待: 1 / ${opts.clients - 1}）`,
      },
    ];

    for (const c of checks) {
      console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
    }

    for (const f of [...navFailures, ...submitErrors].slice(0, 10)) {
      console.log(`    失敗の詳細: ${JSON.stringify(f)}`);
    }

    await Promise.all(contexts.map((c) => c.close()));

    if (checks.some((c) => !c.pass)) {
      console.log("\n結果: FAIL");
      process.exitCode = 1;
      return;
    }
    console.log("\n結果: PASS");
  } finally {
    await browser?.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

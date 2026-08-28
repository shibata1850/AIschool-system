import { generateWeeklyReport } from "../src/lib/f4/generateWeeklyReport";

/**
 * 週次到達度レポートの自動生成バッチ（要件定義書 9.2 F4①）。
 * 毎週月曜 7:00 に cron から実行する（infra/custom-layer/README.md）。
 *
 *   docker compose exec -T app npx tsx scripts/generate-weekly-report.ts
 *
 * 対象週は実行日が属する週（月曜起点）。過去週を作り直すときは第1引数に
 * 週の月曜（YYYY-MM-DD）を渡す。冪等（同じ週は上書きされる）。
 */
async function main() {
  const weekArg = process.argv[2];
  if (weekArg && !/^\d{4}-\d{2}-\d{2}$/.test(weekArg)) {
    throw new Error("対象週は YYYY-MM-DD（週の月曜）で指定してください");
  }

  const { report, generatedAt, notify } = await generateWeeklyReport({ weekStart: weekArg });

  console.log(`週次レポートを生成しました（対象週 ${report.weekStart} / 生成 ${generatedAt}）`);
  console.log(`  対象受講生: ${report.summary.studentCount}名`);
  console.log(`  停滞アラート: ${report.alerts.length}名`);
  console.log(`  未提出課題あり: ${report.summary.withPendingCount}名`);

  if (notify.state === "sent") {
    console.log(`  通知: 送信済み（${notify.recipientCount}名）`);
  } else {
    // 通知できなくてもレポート自体は残る。cronのログで追えるようにする
    console.log(`  通知: 未送信（${notify.reason}）`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("週次レポートの生成に失敗しました:", error);
  process.exit(1);
});

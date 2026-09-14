import { generateCourseReportBatch } from "../src/lib/f4/reportBatch";
import { isReportWeek } from "../src/lib/f4/reportWeek";

/**
 * 週次到達度レポートの自動生成バッチ（要件定義書 9.2 F4①）。
 * 毎週月曜 7:00 に cron から実行する（infra/custom-layer/README.md）。
 *
 *   docker compose exec -T app node dist-scripts/generate-weekly-report.mjs
 *
 * 対象週は実行日が属する週（月曜起点）。過去週を作り直すときは第1引数に
 * 週の月曜（YYYY-MM-DD）を渡す。LTI記録のあるコースを個別に処理する。
 */
async function main() {
  const weekArg = process.argv[2];
  if (weekArg !== undefined && !isReportWeek(weekArg)) {
    throw new Error("対象週は YYYY-MM-DD（週の月曜）で指定してください");
  }

  const results = await generateCourseReportBatch(weekArg);
  console.log(`週次レポートの対象コース: ${results.length}件`);
  let failed = false;
  for (const [index, entry] of results.entries()) {
    console.log(`コース処理 ${index + 1}/${results.length}`);
    if (entry.state === "failed") {
      failed = true;
      console.error("生成処理に失敗しました。送信状況を確認してから再実行してください。");
      continue;
    }
    const { report, generatedAt, notify, reused } = entry.result;

    console.log(`${reused ? "保存済みの週次レポートを使用しました" : "週次レポートを生成しました"}（対象週 ${report.weekStart} / 生成 ${generatedAt}）`);
    console.log(`  対象受講生: ${report.summary.studentCount}名`);
    console.log(`  停滞アラート: ${report.alerts.length}名`);
    console.log(`  未提出課題あり: ${report.summary.withPendingCount}名`);

    if (notify.state === "sent") {
      console.log(`  通知: 送信済み（${notify.recipientCount}名）`);
    } else {
      // 通知できなくてもレポート自体は残る。cronのログで追えるようにする
      console.log(`  通知: 未送信（${notify.reason}）`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch(() => {
  console.error("週次レポートの生成に失敗しました。設定と接続状況を確認してください。");
  process.exit(1);
});

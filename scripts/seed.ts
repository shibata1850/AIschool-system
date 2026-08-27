import { resetDatabase } from "../src/lib/db/seed";

/**
 * 初期データ投入（テーブル所有ロールで実行）。
 * 実行: DATABASE_ADMIN_URL=... npx tsx scripts/seed.ts --force
 *
 * **破壊的操作**: 対象DBの既存データを全削除してから架空のシードデータを入れ直す。
 * 実受講生データが入ったDBに対しては絶対に実行しないこと（CLAUDE.md 2章・絶対ルール6）。
 * 事故防止のため --force を明示しない限り何もしない。
 *
 * 本番の初回構築ではこのスクリプトを使う。開発・E2E用の `POST /api/dev/reset` は
 * 本番デプロイでは無効のまま（ALLOW_DEV_RESET を立てない）でよい。
 */
async function main() {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) {
    throw new Error("DATABASE_ADMIN_URL を設定してください（初期投入用の所有ロール接続文字列）");
  }
  if (!process.argv.includes("--force")) {
    console.error(
      [
        "初期データ投入は破壊的操作です（対象DBの既存データを全削除します）。",
        "実行するには --force を付けてください:",
        "  DATABASE_ADMIN_URL=... npx tsx scripts/seed.ts --force",
        "",
        "※ 実受講生データが入ったDBに対しては実行しないでください。",
      ].join("\n"),
    );
    process.exit(1);
  }

  // 接続先を（パスワードを伏せて）表示し、取り違えに気づけるようにする
  const redacted = url.replace(/:\/\/([^:]+):[^@]*@/, "://$1:****@");
  console.log(`対象DB: ${redacted}`);

  const rich = process.env.DEMO_RICH_SEED === "1";
  console.log(`シード種別: ${rich ? "リッチデモ（授業中の教室16席）" : "最小シード"}`);

  await resetDatabase();
  console.log("初期データの投入が完了しました");
  process.exit(0);
}

main().catch((error) => {
  console.error("初期データの投入に失敗しました:", error);
  process.exit(1);
});

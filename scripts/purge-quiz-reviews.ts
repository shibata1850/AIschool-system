import {runQuizReviewRetention,RetentionConfigurationError} from "../src/lib/quiz-review/retention";

setTimeout(()=>{
  console.error("保存期間処理が制限時間を超えました。監査記録と接続状況を確認してください。");
  process.exit(1);
},180000).unref();

async function main(){
  const result=await runQuizReviewRetention(process.argv.slice(2),process.env);
  // Counts only. Never log student identifiers, scores, payloads or connection strings.
  console.log(JSON.stringify(result));
  if(result.mode==="apply"&&result.remaining>0){console.error("期限切れデータが残っています。次回実行の結果を確認してください。");process.exit(2);}
  process.exit(0);
}
main().catch((error)=>{
  console.error(error instanceof RetentionConfigurationError?error.message:"確認用データの保存期間処理に失敗しました。設定・DB接続・監査記録を確認してください。");
  process.exit(1);
});

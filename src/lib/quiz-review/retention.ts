import {sql} from "drizzle-orm";
import {getDb} from "../db/client";
import {auditLog} from "../db/schema";

const BATCH_SIZE=500;
export class RetentionConfigurationError extends Error {}
export function retentionInstance(value:unknown):string {
  if(typeof value!=="string"||!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(value))throw new RetentionConfigurationError("確認用データの保存元設定を確認してください");
  return value;
}
export async function countExpiredQuizReviews(instance:string) {
  retentionInstance(instance);
  const rows=await getDb().execute<{count:number;cutoff:Date}>(sql`
    SELECT count(*)::int AS count, now() AS cutoff FROM canvas_quiz_review_candidates
    WHERE source_instance=${instance} AND expires_at<=now()`);
  return {count:rows.rows[0].count,cutoff:new Date(rows.rows[0].cutoff).toISOString()};
}

/** Delete one bounded batch and its audit entry atomically, using the restricted app role. */
export async function purgeExpiredQuizReviews(instance:string):Promise<number> {
  retentionInstance(instance);
  return getDb().transaction(async tx=>{
    await tx.execute(sql`SET LOCAL statement_timeout = '20s'`);
    // FOR UPDATE would require UPDATE privileges on these immutable snapshots.
    // Serialize retention for one source using a transaction-scoped advisory lock instead.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"quiz-review-expiry:"+instance},0))`);
    const rows=await tx.execute<{count:number;cutoff:Date}>(sql`
      WITH expired AS (
        SELECT course_id,source_key,revision FROM canvas_quiz_review_candidates
        WHERE source_instance=${instance} AND expires_at<=now()
        ORDER BY expires_at,course_id,source_key,revision LIMIT ${BATCH_SIZE}
      ), removed AS (
        DELETE FROM canvas_quiz_review_candidates c USING expired e
        WHERE c.course_id=e.course_id AND c.source_key=e.source_key AND c.revision=e.revision
        RETURNING 1
      ) SELECT count(*)::int AS count,now() AS cutoff FROM removed`);
    const {count,cutoff}=rows.rows[0];
    if(count)await tx.insert(auditLog).values({at:new Date(),actorRole:"system",actorId:null,
      action:"delete",entity:"canvas_quiz_review_expired",entityId:"expiry",before:{count,sourceInstance:instance,cutoff:new Date(cutoff).toISOString()},after:null});
    return count;
  });
}

export type RetentionResult={mode:"dry-run"|"apply";expired:number;deleted:number;remaining:number;cutoff:string};
/** No arguments means dry-run. Apply requires both the explicit flag and deployment opt-in. */
export async function runQuizReviewRetention(args:string[],env:Record<string,string|undefined>):Promise<RetentionResult> {
  if(args.length>1||(args.length===1&&!['--dry-run','--apply'].includes(args[0])))throw new RetentionConfigurationError("引数は --dry-run または --apply を指定してください");
  const apply=args[0]==="--apply",instance=retentionInstance(env.CANVAS_REVIEW_INSTANCE);
  if(apply&&env.QUIZ_REVIEW_RETENTION_ENABLED!=="true")throw new RetentionConfigurationError("自動削除は有効化されていません。設定と承認済みの運用手順を確認してください");
  const before=await countExpiredQuizReviews(instance);let deleted=0;
  if(apply) {
    // At most 10,000 rows per execution. A later run handles any backlog.
    for(let batch=0;batch<20;batch++) {
      const count=await purgeExpiredQuizReviews(instance);deleted+=count;if(count<BATCH_SIZE)break;
    }
  }
  const after=apply?await countExpiredQuizReviews(instance):before;
  return {mode:apply?"apply":"dry-run",expired:before.count,deleted,remaining:after.count,cutoff:after.cutoff};
}

import {and,eq,gt,sql} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import type {CurrentUser} from '@/lib/auth';
import {getDb,type DbExecutor} from '@/lib/db/client';
import {auditLog,quizReviewCandidates as candidates,quizReviewDecisions as decisions,students,studentCourses} from '@/lib/db/schema';
import {createCanvasClient} from '@/lib/canvas/client';
import {scope,requireReviewer} from './service';
import {QuizReviewError,type ReviewRecord} from './policy';
import {decisionInput} from './decision-policy';

function enabled(){if(process.env.QUIZ_REVIEW_PUBLICATION_ENABLED!=='true')throw new QuizReviewError('小テスト記録の本人表示は準備中です',503);}
async function identity(db:DbExecutor,studentId:string,canvasId:number,courseId:string){
  const matches=await db.select({id:students.id}).from(students).where(eq(students.canvasUserId,canvasId));
  const membership=await db.select().from(studentCourses).where(and(eq(studentCourses.studentId,studentId),eq(studentCourses.courseId,courseId)));
  if(matches.length!==1||matches[0].id!==studentId||membership.length!==1)throw new QuizReviewError('受講者とコースの対応を確認できません',409);
}
export async function decideQuizReview(actor:CurrentUser,value:unknown){
  requireReviewer(actor);enabled();const input=decisionInput(value),{client,policy}=await scope(actor);
  const filter=and(eq(candidates.courseId,actor.courseId!),eq(candidates.sourceKey,input.sourceKey),eq(candidates.revision,input.revision),
    eq(candidates.sourceInstance,policy.instance),eq(candidates.canvasCourseId,policy.canvasCourseId),gt(candidates.expiresAt,new Date()));
  const [target]=await getDb().select().from(candidates).where(filter);
  if(!target)throw new QuizReviewError('表示期間内の結果を選び直してください',409);
  await identity(getDb(),target.studentId,target.snapshot.canvasUserId,actor.courseId!);
  if(!await client.hasActiveEnrollment(policy.canvasCourseId,target.snapshot.canvasUserId,'student'))throw new QuizReviewError('現在の受講登録を確認できません',409);
  if(input.action==='adopt'&&target.snapshot.earned===null)throw new QuizReviewError('未採点を含む結果は採用できません',409);
  return getDb().transaction(async tx=>{
    await tx.execute(sql`SET LOCAL statement_timeout = '20s'`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${'quiz-review:'+actor.courseId},0))`);
    const [row]=await tx.select().from(candidates).where(and(filter,gt(candidates.expiresAt,sql`clock_timestamp()`)));
    if(!row)throw new QuizReviewError('表示期間または所属が変更されました。再読み込みしてください',409);
    await identity(tx,row.studentId,row.snapshot.canvasUserId,actor.courseId!);
    const key=and(eq(decisions.courseId,actor.courseId!),eq(decisions.studentId,row.studentId),eq(decisions.sourceInstance,policy.instance),eq(decisions.quizId,row.snapshot.quizId));
    const [before]=await tx.select().from(decisions).where(key);
    if((before?.token??null)!==input.expectedToken)throw new QuizReviewError('別の操作で採用状態が変わりました。再読み込みして確認してください',409);
    if(input.action==='withdraw'&&(!before||before.state!=='adopted'||before.sourceKey!==row.sourceKey||before.revision!==row.revision))throw new QuizReviewError('現在採用されている結果だけ取り下げられます',409);
    const after={courseId:actor.courseId!,studentId:row.studentId,sourceInstance:policy.instance,quizId:row.snapshot.quizId,
      sourceKey:row.sourceKey,revision:row.revision,token:randomUUID(),state:input.action==='adopt'?'adopted' as const:'withdrawn' as const,
      decidedAt:new Date(),decidedBy:actor.userId};
    await tx.insert(decisions).values(after).onConflictDoUpdate({target:[decisions.courseId,decisions.studentId,decisions.sourceInstance,decisions.quizId],set:after});
    // Record a reference and explicit human confirmation, never copy scores or answer text to audit.
    const detail=(r:{sourceKey:string;revision:string;token:string;state:string}|undefined)=>r?{sourceKey:r.sourceKey,revision:r.revision,token:r.token,state:r.state}:null;
    await tx.insert(auditLog).values({at:after.decidedAt,actorRole:actor.role,actorId:actor.userId,action:before?'update':'create',
      entity:'canvas_quiz_review_decision',entityId:after.token,before:detail(before),after:{...detail(after),courseId:actor.courseId,manuallyConfirmed:input.action==='adopt'}});
    return {state:after.state,token:after.token,decidedAt:after.decidedAt.toISOString()};
  });
}

/** No learner ID from a URL or request body is ever accepted. */
export async function ownQuizResults(actor:CurrentUser){
  if(actor.role!=='student'||!actor.viaLti||!actor.courseId||!actor.canvasUserId)throw new QuizReviewError('Canvasから受講者本人として起動してください',403);
  enabled();const client=createCanvasClient(),instance=process.env.CANVAS_REVIEW_INSTANCE;
  if(!client||!instance)throw new QuizReviewError('小テスト連携の設定を確認してください',503);
  const course=await client.getCourseByLtiContext(actor.courseId);
  if(!await client.hasActiveEnrollment(course.id,actor.canvasUserId,'student'))throw new QuizReviewError('現在の受講登録を確認できません',403);
  return getDb().transaction(async tx=>{
    await identity(tx,actor.userId,actor.canvasUserId!,actor.courseId!);
    const rows=await tx.select({snapshot:candidates.snapshot,decidedAt:decisions.decidedAt,expiresAt:candidates.expiresAt}).from(decisions)
      .innerJoin(candidates,and(eq(candidates.courseId,decisions.courseId),eq(candidates.sourceKey,decisions.sourceKey),eq(candidates.revision,decisions.revision)))
      .where(and(eq(decisions.courseId,actor.courseId!),eq(decisions.studentId,actor.userId),eq(decisions.sourceInstance,instance),eq(decisions.state,'adopted'),
        eq(candidates.studentId,actor.userId),eq(candidates.sourceInstance,instance),eq(candidates.canvasCourseId,course.id),
        sql`${candidates.snapshot}->>'canvasUserId' = ${String(actor.canvasUserId)}`,gt(candidates.expiresAt,new Date())))
      .orderBy(sql`${decisions.decidedAt} desc`).limit(100);
    return rows.map(({snapshot:r,decidedAt,expiresAt})=>({step:r.step,stage:r.stage,attempt:r.attempt,earned:r.earned,possible:r.possible,
      skills:r.skills,decidedAt:decidedAt.toISOString(),expiresAt:expiresAt.toISOString()}));
  });
}

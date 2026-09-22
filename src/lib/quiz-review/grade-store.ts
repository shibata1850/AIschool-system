import {and,eq,sql} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import {getDb,withWeeklyReportLock,type DbExecutor} from '../db/client';
import {auditLog,quizGradeEvents,studentCourses,canvasAssignmentLinks} from '../db/schema';
import {quizAchievementRecords,type FormalQuizGrade} from './achievement-records';
import {QuizReviewError} from './policy';

/** Internal repository: call only after reviewer identity and Canvas evidence have been checked. */
export async function appendQuizGrade(input:{snapshot:FormalQuizGrade;expectedToken:string|null;sourceKey:string;revision:string;
  actorId:string;actorRole:'teacher'|'admin'}){
  const r=input.snapshot;
  return withWeeklyReportLock(db=>db.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL statement_timeout = '20s'`);
    // Share the mapping lock so link creation cannot race the duplicate check.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['canvas-assignment-link',r.courseId])},0))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(['formal-quiz',r.courseId,r.studentId,r.sourceInstance,r.quizId])},0))`);
    const before=(await readCurrentQuizGrades(r.courseId,r.studentId,r.sourceInstance,tx)).find(x=>x.quizId===r.quizId);
    if((before?.token??null)!==input.expectedToken)throw new QuizReviewError('別の採用操作があります。再読み込みしてください',409);
    if(r.state==='withdrawn'&&!before)throw new QuizReviewError('取り下げる成績がありません',409);
    const membership=await tx.select().from(studentCourses).where(and(eq(studentCourses.courseId,r.courseId),eq(studentCourses.studentId,r.studentId)));
    if(membership.length!==1)throw new QuizReviewError('受講者とコースの対応を確認できません',409);
    const links=await tx.select({id:canvasAssignmentLinks.canvasAssignmentId}).from(canvasAssignmentLinks).where(eq(canvasAssignmentLinks.courseId,r.courseId));
    const checked=quizAchievementRecords([r],{courseId:r.courseId,studentId:r.studentId,sourceInstance:r.sourceInstance,linkedAssignmentIds:links.map(x=>x.id)});
    if(r.state==='adopted'&&checked.records.length!==1)throw new QuizReviewError('採点済み得点と対象授業週が必要です',409);
    const token=randomUUID(),confirmedAt=new Date();
    await tx.insert(quizGradeEvents).values({token,courseId:r.courseId,studentId:r.studentId,sourceInstance:r.sourceInstance,
      quizId:r.quizId,snapshot:r,sourceKey:input.sourceKey,revision:input.revision,confirmedAt,confirmedBy:input.actorId});
    await tx.insert(auditLog).values({at:confirmedAt,actorId:input.actorId,actorRole:input.actorRole,action:'create',
      entity:'canvas_quiz_grade_event',entityId:token,before:before?{token:before.token}:null,
      after:{token,courseId:r.courseId,state:r.state}});
    return {token,confirmedAt};
  }));
}

export async function readCurrentQuizGrades(courseId:string,studentId:string|undefined,instance:string,db:DbExecutor=getDb()){
  // Revisions are append-only. Selecting exactly one newest revision prevents counting resits twice.
  return db.selectDistinctOn([quizGradeEvents.studentId,quizGradeEvents.quizId],{
    studentId:quizGradeEvents.studentId,quizId:quizGradeEvents.quizId,token:quizGradeEvents.token,
    snapshot:quizGradeEvents.snapshot,confirmedAt:quizGradeEvents.confirmedAt,
  }).from(quizGradeEvents).where(and(eq(quizGradeEvents.courseId,courseId),eq(quizGradeEvents.sourceInstance,instance),
    studentId===undefined?undefined:eq(quizGradeEvents.studentId,studentId)))
    .orderBy(quizGradeEvents.studentId,quizGradeEvents.quizId,sql`${quizGradeEvents.sequence} desc`);
}

import {and,eq,gt} from 'drizzle-orm';
import type {CurrentUser} from '../auth';
import {getDb} from '../db/client';
import {quizReviewCandidates,students,studentCourses} from '../db/schema';
import {scope} from './service';
import {QuizReviewError} from './policy';
import {compareQuizEvidence,isObject,positiveId,verificationResult} from './verification';
import {appendQuizGrade,readCurrentQuizGrades} from './grade-store';
import {isReportWeek} from '../f4/reportWeek';
import {createCanvasClient} from '../canvas/client';

function enabled(){if(process.env.QUIZ_ACHIEVEMENT_ENABLED!=='true')throw new QuizReviewError('総合到達度への反映は準備中です',503);}
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const token=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);

export async function ownFormalGrades(actor:CurrentUser){
  enabled();
  if(actor.role!=='student'||!actor.viaLti||!actor.courseId||!actor.canvasUserId)throw new QuizReviewError('Canvasから受講者本人として起動してください',403);
  const client=createCanvasClient(),instance=process.env.CANVAS_REVIEW_INSTANCE;
  if(!client||!instance)throw new QuizReviewError('小テスト連携の設定を確認してください',503);
  const course=await client.getCourseByLtiContext(actor.courseId);
  if(!await client.hasActiveEnrollment(course.id,actor.canvasUserId,'student'))throw new QuizReviewError('現在の受講登録を確認できません',403);
  const people=await getDb().select({id:students.id}).from(students).where(eq(students.canvasUserId,actor.canvasUserId));
  if(people.length!==1||people[0].id!==actor.userId)throw new QuizReviewError('本人の対応を確認できません',403);
  const member=await getDb().select().from(studentCourses).where(and(eq(studentCourses.courseId,actor.courseId),eq(studentCourses.studentId,actor.userId)));
  if(member.length!==1)throw new QuizReviewError('現在のコースの対応を確認できません',403);
  const rows=await readCurrentQuizGrades(actor.courseId,actor.userId,instance);
  return rows.filter(r=>r.snapshot.canvasUserId===actor.canvasUserId);
}

export async function listFormalGrades(actor:CurrentUser){
  enabled();const {policy}=await scope(actor);
  return readCurrentQuizGrades(actor.courseId!,undefined,policy.instance);
}

/** No client score, person ID, Canvas assignment ID, or claimed verification status is trusted. */
export async function decideFormalGrade(actor:CurrentUser,input:unknown){
  enabled();const {client,policy}=await scope(actor);
  if(!isObject(input)||!['adopt','withdraw'].includes(String(input.action))||input.confirmed!==true||
    !(input.expectedToken===null||token(input.expectedToken)))throw new QuizReviewError('成績の確認内容を確認してください');
  const actorRole=actor.role as 'teacher'|'admin';
  if(input.action==='withdraw'){
    if(!token(input.expectedToken))throw new QuizReviewError('取り下げる成績を選んでください');
    const current=(await readCurrentQuizGrades(actor.courseId!,undefined,policy.instance)).find(r=>r.token===input.expectedToken);
    if(!current||current.snapshot.state!=='adopted')throw new QuizReviewError('現在の採用結果を選び直してください',409);
    // Withdrawal remains possible after the temporary CSV snapshot expires.
    return appendQuizGrade({snapshot:{...current.snapshot,state:'withdrawn'},expectedToken:current.token,
      sourceKey:'0'.repeat(64),revision:'0'.repeat(64),actorId:actor.userId,actorRole});
  }
  if(!hash(input.sourceKey)||!hash(input.revision)||!isReportWeek(input.targetWeek))throw new QuizReviewError('結果と対象授業週（月曜日）を確認してください');
  const [row]=await getDb().select().from(quizReviewCandidates).where(and(eq(quizReviewCandidates.courseId,actor.courseId!),
    eq(quizReviewCandidates.sourceInstance,policy.instance),eq(quizReviewCandidates.canvasCourseId,policy.canvasCourseId),
    eq(quizReviewCandidates.sourceKey,input.sourceKey),eq(quizReviewCandidates.revision,input.revision),gt(quizReviewCandidates.expiresAt,new Date())));
  if(!row||row.snapshot.stage!=='F'||row.snapshot.earned===null)throw new QuizReviewError('有効な採点済み最終テストを選んでください',409);
  const r=row.snapshot;
  const people=await getDb().select({id:students.id}).from(students).where(eq(students.canvasUserId,r.canvasUserId));
  const member=await getDb().select().from(studentCourses).where(and(eq(studentCourses.courseId,actor.courseId!),eq(studentCourses.studentId,row.studentId)));
  if(people.length!==1||people[0].id!==row.studentId||member.length!==1||!await client.hasActiveEnrollment(policy.canvasCourseId,r.canvasUserId,'student'))
    throw new QuizReviewError('現在の受講者とコースの対応を確認できません',409);
  const evidence=await client.readQuizReviewEvidence(policy.canvasCourseId,r.quizId,r.canvasUserId);
  const result=compareQuizEvidence(r,policy.canvasCourseId,evidence);
  if(result!=='matched')throw new QuizReviewError(verificationResult(result).message,409);
  if(!isObject(evidence.quiz)||!positiveId(evidence.quiz.assignment_id))throw new QuizReviewError('Canvas課題を確認できません',409);
  // Re-check expiry following network access. Concurrent purges never silently resurrect an expired review.
  const [stillPresent]=await getDb().select().from(quizReviewCandidates).where(and(eq(quizReviewCandidates.courseId,actor.courseId!),
    eq(quizReviewCandidates.sourceKey,row.sourceKey),eq(quizReviewCandidates.revision,row.revision),gt(quizReviewCandidates.expiresAt,new Date())));
  if(!stillPresent)throw new QuizReviewError('確認用データの期限が切れました',409);
  return appendQuizGrade({snapshot:{courseId:actor.courseId!,studentId:row.studentId,sourceInstance:policy.instance,
    canvasUserId:r.canvasUserId,quizId:r.quizId,canvasAssignmentId:evidence.quiz.assignment_id,stage:'F',attempt:r.attempt,targetWeek:input.targetWeek,
    state:'adopted',earned:r.earned,possible:r.possible},expectedToken:input.expectedToken as string|null,
    sourceKey:row.sourceKey,revision:row.revision,actorId:actor.userId,actorRole});
}

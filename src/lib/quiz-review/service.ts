import { and, eq, gt, inArray, sql } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth";
import { createCanvasClient } from "@/lib/canvas/client";
import { getDb } from "@/lib/db/client";
import { auditLog, quizReviewCandidates, quizReviewDecisions, students, studentCourses } from "@/lib/db/schema";
import { parseReview, QuizReviewError, type ReviewPolicy, type ReviewRecord } from "./policy";
import { compareQuizEvidence, verificationResult } from "./verification";
import {convertCanvasCsv} from "./csv";
import catalog from "./catalog.json";
import {randomUUID} from "node:crypto";

export function requireReviewer(actor: CurrentUser) {
  if (!actor.viaLti || !actor.courseId?.trim() || !actor.canvasUserId || !actor.userId.trim() ||
      !["teacher", "admin"].includes(actor.role)) throw new QuizReviewError("Canvasのコースから担当講師として起動してください", 403);
}
export async function scope(actor: CurrentUser) {
  requireReviewer(actor);
  const client = createCanvasClient();
  const instance = process.env.CANVAS_REVIEW_INSTANCE;
  const origin = process.env.CANVAS_REVIEW_ORIGIN;
  if (!client || !instance || !origin) throw new QuizReviewError("小テスト連携の設定を確認してください", 503);
  let course;
  try {
    course = await client.getCourseByLtiContext(actor.courseId!);
    if (!await client.hasActiveEnrollment(course.id, actor.canvasUserId!, "teacher")) {
      throw new QuizReviewError("現在のコース担当権限を確認できません", 403);
    }
  } catch (e) {
    if (e instanceof QuizReviewError) throw e;
    throw new QuizReviewError("Canvasの権限を確認できません。時間をおいて再試行してください", 503);
  }
  return {client, policy: {instance, origin, canvasCourseId:course.id} satisfies ReviewPolicy};
}

export async function saveQuizReview(actor: CurrentUser, input: unknown) {
  const authorized = await scope(actor);
  return saveAuthorizedReview(actor,input,authorized);
}

export async function acquireQuizReport(actor:CurrentUser,quizId:unknown) {
  const authorized=await scope(actor);
  requireCatalogQuiz(quizId,authorized.policy.canvasCourseId);
  const {csv,source}=await authorized.client.readExistingQuizReport(authorized.policy.canvasCourseId,quizId as number,authorized.policy.origin);
  const input=convertCanvasCsv(csv,quizId as number,authorized.policy);
  const result=await saveAuthorizedReview(actor,input,authorized,source);
  return {...result,source};
}

function requireCatalogQuiz(quizId:unknown,courseId:number):asserts quizId is number {
  if(!Number.isSafeInteger(quizId)||!catalog.questions.some(q=>q.canvas_course_id===courseId&&q.canvas_quiz_id===quizId))
    throw new QuizReviewError("登録済みの小テストを選んでください");
}

export async function prepareQuizReport(actor:CurrentUser,quizId:unknown,requestCreation:boolean) {
  const {client,policy}=await scope(actor);requireCatalogQuiz(quizId,policy.canvasCourseId);
  const requestId=randomUUID();
  const audit=(phase:string,result:unknown)=>getDb().insert(auditLog).values({at:new Date(),actorRole:actor.role,actorId:actor.userId,
    action:"create",entity:"canvas_quiz_report_preparation",entityId:requestId,before:null,
    after:{phase,courseId:actor.courseId,canvasCourseId:policy.canvasCourseId,quizId,sourceInstance:policy.instance,result}});
  // Persist intent before any external mutation. An unfinished intent means the outcome is unknown.
  if(requestCreation)await audit("started",null);
  try {
    const result=await client.prepareQuizReport(policy.canvasCourseId,quizId,policy.origin,requestCreation);
    if(requestCreation)await audit("finished",result);
    return result;
  }catch(error){
    if(requestCreation)throw new QuizReviewError("作成依頼の結果を確認できません。「準備状況を確認」で確認してください。依頼は自動で再送していません",503);
    throw error;
  }
}

async function saveAuthorizedReview(actor:CurrentUser,input:unknown,authorized:Awaited<ReturnType<typeof scope>>,source?:ReviewRecord["source"]) {
  const {client,policy}=authorized;
  const records = parseReview(input, policy);
  if(source)for(const record of records) record.source=source;
  for (const id of new Set(records.map(r => r.canvasUserId))) {
    let active: boolean;
    try { active = await client.hasActiveEnrollment(policy.canvasCourseId, id, "student"); }
    catch { throw new QuizReviewError("Canvasの受講登録を確認できません", 503); }
    if (!active) throw new QuizReviewError("現在の受講登録を確認できない答案があります", 409);
  }
  if (!records.length && !source) return {created:0, duplicates:0, changedAttempts:0, status:"pending_review"};
  return getDb().transaction(async tx => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 86400000);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"quiz-review:"+actor.courseId}, 0))`);
    // Require exactly one global numeric-ID match, then this course's recorded membership.
    const roster = await tx.select({id:students.id, canvasId:students.canvasUserId}).from(students)
      .where(inArray(students.canvasUserId, records.map(r => r.canvasUserId)));
    const membership = await tx.select().from(studentCourses).where(eq(studentCourses.courseId, actor.courseId!));
    const targets = new Map<number,string>();
    for (const record of records) {
      const matches = roster.filter(s => s.canvasId === record.canvasUserId);
      if (matches.length !== 1 || !membership.some(m => m.studentId === matches[0].id)) {
        throw new QuizReviewError("受講者とコースの対応が未登録または重複しています", 409);
      }
      targets.set(record.canvasUserId, matches[0].id);
    }
    let created = 0, duplicates = 0, changedAttempts = 0;
    for (const record of records) {
      const before = await tx.select({revision:quizReviewCandidates.revision}).from(quizReviewCandidates)
        .where(and(eq(quizReviewCandidates.courseId, actor.courseId!), eq(quizReviewCandidates.sourceKey, record.sourceKey)));
      if (before.some(r => r.revision === record.revision)) { duplicates++; continue; }
      if (before.length) changedAttempts++;
      await tx.insert(quizReviewCandidates).values({ courseId:actor.courseId!, sourceKey:record.sourceKey,
        revision:record.revision, studentId:targets.get(record.canvasUserId)!, sourceInstance:policy.instance,
        canvasCourseId:policy.canvasCourseId, snapshot:record, importedAt:now, expiresAt });
      await tx.insert(auditLog).values({at:now, actorRole:actor.role, actorId:actor.userId,
        action:"create", entity:"canvas_quiz_review", entityId:record.sourceKey+":"+record.revision,
        before:null, after:{status:"pending_review", courseId:actor.courseId, expiresAt:expiresAt.toISOString()}});
      created++;
    }
    if(source)await tx.insert(auditLog).values({at:now,actorRole:actor.role,actorId:actor.userId,
      action:"create",entity:"canvas_quiz_report_acquisition",entityId:String(source.reportId),before:null,
      after:{courseId:actor.courseId,source,created,duplicates,changedAttempts,status:"pending_review"}});
    return {created, duplicates, changedAttempts, status:"pending_review"};
  });
}

export async function listQuizReviews(actor: CurrentUser) {
  const {policy}=await scope(actor);
  return getDb().select({snapshot:quizReviewCandidates.snapshot, importedAt:quizReviewCandidates.importedAt,expiresAt:quizReviewCandidates.expiresAt,
    decision:{token:quizReviewDecisions.token,state:quizReviewDecisions.state,sourceKey:quizReviewDecisions.sourceKey,revision:quizReviewDecisions.revision,decidedAt:quizReviewDecisions.decidedAt}})
    .from(quizReviewCandidates).leftJoin(quizReviewDecisions,and(eq(quizReviewDecisions.courseId,quizReviewCandidates.courseId),
      eq(quizReviewDecisions.studentId,quizReviewCandidates.studentId),eq(quizReviewDecisions.sourceInstance,quizReviewCandidates.sourceInstance),
      sql`${quizReviewDecisions.quizId} = (${quizReviewCandidates.snapshot}->>'quizId')::integer`))
    .where(and(eq(quizReviewCandidates.courseId, actor.courseId!),eq(quizReviewCandidates.sourceInstance,policy.instance),eq(quizReviewCandidates.canvasCourseId,policy.canvasCourseId),
      gt(quizReviewCandidates.expiresAt, new Date())))
    .orderBy(sql`${quizReviewCandidates.importedAt} desc`, quizReviewCandidates.sourceKey, quizReviewCandidates.revision).limit(100);
}

/** Read-only comparison. No publication, approval or grade writes are implied. */
export async function verifyQuizReview(actor:CurrentUser,sourceKey:string,revision:string) {
  requireReviewer(actor);
  if(![sourceKey,revision].every(v=>/^[a-f0-9]{64}$/.test(v))) throw new QuizReviewError("照合する結果を選び直してください");
  const {client,policy}=await scope(actor);
  const rows=await getDb().select().from(quizReviewCandidates).where(and(
    eq(quizReviewCandidates.courseId,actor.courseId!),eq(quizReviewCandidates.sourceKey,sourceKey),
    eq(quizReviewCandidates.revision,revision),eq(quizReviewCandidates.sourceInstance,policy.instance),
    eq(quizReviewCandidates.canvasCourseId,policy.canvasCourseId),gt(quizReviewCandidates.expiresAt,new Date())));
  if(rows.length!==1) throw new QuizReviewError("このコースで照合できる保存結果がありません",409);
  const row=rows[0],record=row.snapshot as ReviewRecord;
  const matches=await getDb().select({id:students.id}).from(students).where(eq(students.canvasUserId,record.canvasUserId));
  const memberships=await getDb().select().from(studentCourses).where(and(
    eq(studentCourses.studentId,row.studentId),eq(studentCourses.courseId,actor.courseId!)));
  if(matches.length!==1||matches[0].id!==row.studentId||memberships.length!==1) {
    throw new QuizReviewError("受講者とコースの対応を確認できません",409);
  }
  try {
    if(!await client.hasActiveEnrollment(policy.canvasCourseId,record.canvasUserId,"student")) {
      throw new QuizReviewError("現在の受講登録を確認できません",409);
    }
    const evidence=await client.readQuizReviewEvidence(policy.canvasCourseId,record.quizId,record.canvasUserId);
    const result=verificationResult(compareQuizEvidence(record,policy.canvasCourseId,evidence));
    // Recheck the local membership/expiry after network reads; deletion must not return stale success.
    const remains=await getDb().select({key:quizReviewCandidates.sourceKey}).from(quizReviewCandidates).where(and(
      eq(quizReviewCandidates.courseId,actor.courseId!),eq(quizReviewCandidates.sourceKey,sourceKey),
      eq(quizReviewCandidates.revision,revision),gt(quizReviewCandidates.expiresAt,new Date())));
    if(remains.length!==1) throw new QuizReviewError("保存結果の表示期間または所属が変更されました",409);
    return result;
  } catch(error) {
    if(error instanceof QuizReviewError) throw error;
    return verificationResult("unavailable");
  }
}

export {purgeExpiredQuizReviews} from "./retention";
export type { ReviewRecord };

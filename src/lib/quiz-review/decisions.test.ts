import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {eq,and,inArray} from 'drizzle-orm';
import {getAdminDb} from '@/lib/db/adminClient';
import * as database from '@/lib/db/client';
import {students,studentCourses,quizReviewCandidates,quizReviewDecisions,auditLog} from '@/lib/db/schema';
import type {CurrentUser} from '@/lib/auth';
import {parseReview} from './policy';
import {decisionInput} from './decision-policy';
import {decideQuizReview,ownQuizResults} from './decisions';
import {reviewFixture} from './fixtures';
import {purgeExpiredQuizReviews} from './retention';
const api=vi.hoisted(()=>({getCourseByLtiContext:vi.fn(),hasActiveEnrollment:vi.fn()}));
vi.mock('@/lib/canvas/client',()=>({createCanvasClient:()=>api}));
const teacher:CurrentUser={role:'teacher',viaLti:true,userId:'qr-decision-teacher',canvasUserId:9000,courseId:'qr-decision-course'};
const student:CurrentUser={role:'student',viaLti:true,userId:'qr-decision-student',canvasUserId:9071,courseId:'qr-decision-course'};
beforeEach(()=>{vi.stubEnv('QUIZ_REVIEW_PUBLICATION_ENABLED','true');vi.stubEnv('CANVAS_REVIEW_INSTANCE','test-canvas');vi.stubEnv('CANVAS_REVIEW_ORIGIN','https://canvas.example.test');
 api.getCourseByLtiContext.mockResolvedValue({id:1});api.hasActiveEnrollment.mockResolvedValue(true);});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
async function fixture(){
 const u=new URL(process.env.DATABASE_ADMIN_URL!);if(u.hostname!=='127.0.0.1'||u.pathname!=='/aischool_test')throw Error('Isolated DB required');
 const db=getAdminDb(),now=new Date();await db.delete(students).where(eq(students.id,student.userId));
 await db.insert(students).values({id:student.userId,displayName:'採用確認の架空受講者',canvasUserId:9071,firstSeenAt:now,lastSeenAt:now});
 await db.insert(studentCourses).values({studentId:student.userId,courseId:student.courseId!,lastSeenAt:now});
 const record=parseReview(reviewFixture(4,9071),{instance:'test-canvas',origin:'https://canvas.example.test',canvasCourseId:1})[0];
 await db.insert(quizReviewCandidates).values({courseId:student.courseId!,studentId:student.userId,sourceInstance:'test-canvas',canvasCourseId:1,sourceKey:record.sourceKey,revision:record.revision,
   snapshot:record,importedAt:now,expiresAt:new Date(now.getTime()+86400000)});
 return {db,record,input:{sourceKey:record.sourceKey,revision:record.revision,expectedToken:null as string|null,action:'adopt',confirmed:true},cleanup:()=>db.delete(students).where(eq(students.id,student.userId))};
}
it.each([null,{}, {action:'adopt'}, {sourceKey:'a'.repeat(64),revision:'b'.repeat(64),expectedToken:null,action:'adopt',confirmed:false},
 {sourceKey:'a'.repeat(64),revision:'b'.repeat(64),expectedToken:null,action:'adopt',confirmed:true,studentId:'other'}])('rejects malformed or unconfirmed decision %j',v=>expect(()=>decisionInput(v)).toThrow());
it('adopt displays only selected reference; withdrawal and audit are atomic',async()=>{
 const f=await fixture();try{
   expect(await ownQuizResults(student)).toEqual([]);
   const result=await decideQuizReview(teacher,f.input);expect(result.state).toBe('adopted');
   const own=await ownQuizResults(student);expect(own).toHaveLength(1);expect(own[0]).toMatchObject({earned:12,possible:12,attempt:1});
   expect(JSON.stringify(own)).not.toMatch(/canvasUserId|sourceKey|studentId|decidedBy|qr-decision/);
   const withdrawn=await decideQuizReview(teacher,{...f.input,action:'withdraw',expectedToken:result.token});expect(await ownQuizResults(student)).toEqual([]);
   expect((await f.db.select().from(auditLog).where(and(eq(auditLog.entity,'canvas_quiz_review_decision'),inArray(auditLog.entityId,[result.token,withdrawn.token]))))).toHaveLength(2);
 }finally{await f.cleanup();}
});
it('one concurrent adoption wins, stale operations fail without overwriting',async()=>{
 const f=await fixture();try{
   const results=await Promise.allSettled([decideQuizReview(teacher,f.input),decideQuizReview(teacher,f.input)]);
   expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
   await expect(decideQuizReview(teacher,f.input)).rejects.toMatchObject({status:409});
 }finally{await f.cleanup();}
});
it('guards roles, explicit opt-in and current teacher/student enrollment',async()=>{
 const f=await fixture();try{
   await expect(decideQuizReview(student,f.input)).rejects.toMatchObject({status:403});
   await expect(ownQuizResults(teacher)).rejects.toMatchObject({status:403});
   vi.stubEnv('QUIZ_REVIEW_PUBLICATION_ENABLED','');await expect(decideQuizReview(teacher,f.input)).rejects.toMatchObject({status:503});await expect(ownQuizResults(student)).rejects.toMatchObject({status:503});
   vi.stubEnv('QUIZ_REVIEW_PUBLICATION_ENABLED','true');api.hasActiveEnrollment.mockResolvedValue(false);
   await expect(decideQuizReview(teacher,f.input)).rejects.toMatchObject({status:403});await expect(ownQuizResults(student)).rejects.toMatchObject({status:403});
   api.hasActiveEnrollment.mockImplementation(async(_course:number,_id:number,kind:string)=>kind==='teacher');
   await expect(decideQuizReview(teacher,f.input)).rejects.toMatchObject({status:409});
 }finally{await f.cleanup();}
});
it('rejects cross-course and spoofed identity, including duplicate numeric mappings',async()=>{
 const f=await fixture();try{
   await expect(decideQuizReview({...teacher,courseId:'other'},f.input)).rejects.toMatchObject({status:409});
   await expect(ownQuizResults({...student,userId:'other'})).rejects.toMatchObject({status:409});
   await f.db.insert(students).values({id:'qr-decision-duplicate',displayName:'架空重複',canvasUserId:9071,firstSeenAt:new Date(),lastSeenAt:new Date()});
   await expect(decideQuizReview(teacher,f.input)).rejects.toMatchObject({status:409});await expect(ownQuizResults(student)).rejects.toMatchObject({status:409});
 }finally{await f.db.delete(students).where(eq(students.id,'qr-decision-duplicate'));await f.cleanup();}
});
it('ungraded cannot be adopted; zero can be adopted',async()=>{
 const f=await fixture();try{
   await f.db.update(quizReviewCandidates).set({snapshot:{...f.record,earned:null}}).where(eq(quizReviewCandidates.studentId,student.userId));
   await expect(decideQuizReview(teacher,f.input)).rejects.toMatchObject({status:409});
   await f.db.update(quizReviewCandidates).set({snapshot:{...f.record,earned:0}}).where(eq(quizReviewCandidates.studentId,student.userId));
   expect((await decideQuizReview(teacher,f.input)).state).toBe('adopted');
 }finally{await f.cleanup();}
});
it('expiry hides adopted record, prevents decisions, and deletion cascades',async()=>{
 const f=await fixture();try{
   await decideQuizReview(teacher,f.input);
   await f.db.update(quizReviewCandidates).set({importedAt:new Date(Date.now()-32*86400000),expiresAt:new Date(Date.now()-86400000)}).where(eq(quizReviewCandidates.studentId,student.userId));
   expect(await ownQuizResults(student)).toEqual([]);await expect(decideQuizReview(teacher,f.input)).rejects.toMatchObject({status:409});
   await purgeExpiredQuizReviews('test-canvas');expect(await f.db.select().from(quizReviewDecisions).where(eq(quizReviewDecisions.studentId,student.userId))).toHaveLength(0);
 }finally{await f.cleanup();}
});
it('audit insertion failure rolls back adoption',async()=>{
 const f=await fixture(),actual=database.getDb();const spy=vi.spyOn(database,'getDb').mockReturnValue(new Proxy(actual,{get(target,key){
   if(key==='transaction')return (callback:Parameters<typeof actual.transaction>[0])=>actual.transaction(tx=>callback(new Proxy(tx,{get(t,k){
     if(k==='insert')return (table:unknown)=>{if(table===auditLog)throw Error('fictional audit failure');return t.insert(table as typeof auditLog);};
     const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;
   }})));const v=Reflect.get(target,key);return typeof v==='function'?v.bind(target):v;
 }}));
 try{await expect(decideQuizReview(teacher,f.input)).rejects.toThrow('fictional audit failure');}
 finally{spy.mockRestore();}
 try{expect(await ownQuizResults(student)).toEqual([]);}finally{await f.cleanup();}
});

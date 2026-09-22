import {it,expect,vi} from "vitest";
import {and,eq} from "drizzle-orm";
import {getAdminDb} from "@/lib/db/adminClient";
import {auditLog,quizReviewCandidates,students,studentCourses} from "@/lib/db/schema";
import {purgeExpiredQuizReviews,countExpiredQuizReviews,runQuizReviewRetention,retentionInstance} from "./retention";
import * as database from "../db/client";
import {parseReview} from "./policy";
import {reviewFixture} from "./fixtures";
it("expiry removes only expired candidates and appends an audit record",async()=>{
  const url=new URL(process.env.DATABASE_ADMIN_URL!);
  if(url.hostname!=="127.0.0.1"||url.pathname!=="/aischool_test") throw new Error("Isolated test database required");
  const db=getAdminDb(),id="qr-retention-fictional",courseId="qr-retention-context",now=new Date();
  await db.delete(students).where(eq(students.id,id));
  await db.insert(students).values({id,displayName:"保持期間の架空受講者",canvasUserId:9001,firstSeenAt:now,lastSeenAt:now});
  await db.insert(studentCourses).values({studentId:id,courseId,lastSeenAt:now});
  const snapshot=parseReview(reviewFixture(),{instance:"test-canvas",origin:"https://canvas.example.test",canvasCourseId:1})[0];
  const common={courseId,studentId:id,sourceInstance:"test-canvas",canvasCourseId:1,snapshot,sourceKey:snapshot.sourceKey,
    importedAt:new Date(now.getTime()-32*86400000)};
  try {
    await db.insert(quizReviewCandidates).values([
      {...common,revision:"a".repeat(64),expiresAt:new Date(now.getTime()-86400000)},
      {...common,revision:"b".repeat(64),expiresAt:new Date(now.getTime()+86400000)},
    ]);
    expect(await purgeExpiredQuizReviews("test-canvas")).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(quizReviewCandidates).where(eq(quizReviewCandidates.courseId,courseId))).toHaveLength(1);
    expect(await db.select().from(auditLog).where(and(eq(auditLog.entity,"canvas_quiz_review_expired"),eq(auditLog.action,"delete")))).not.toHaveLength(0);
  } finally {await db.delete(students).where(eq(students.id,id));}
});

async function retentionFixture(count=1) {
  const url=new URL(process.env.DATABASE_ADMIN_URL!);
  if(url.hostname!=="127.0.0.1"||url.pathname!=="/aischool_test")throw Error("Isolated DB required");
  const db=getAdminDb(),id="qr-retention-batch-fictional",courseId="qr-retention-batch-course",instance="retention-test-canvas",now=Date.now();
  await db.delete(students).where(eq(students.id,id));
  await db.insert(students).values({id,displayName:"架空の保存期間テスト",canvasUserId:9091,firstSeenAt:new Date(),lastSeenAt:new Date()});
  await db.insert(studentCourses).values({studentId:id,courseId,lastSeenAt:new Date()});
  const snapshot=parseReview(reviewFixture(),{instance:"test-canvas",origin:"https://canvas.example.test",canvasCourseId:1})[0];
  const common={courseId,studentId:id,sourceInstance:instance,canvasCourseId:1,snapshot,sourceKey:snapshot.sourceKey,importedAt:new Date(now-32*86400000)};
  await db.insert(quizReviewCandidates).values([
    ...Array.from({length:count},(_,i)=>({...common,revision:(i+1).toString(16).padStart(64,'0'),expiresAt:new Date(now-86400000)})),
    {...common,revision:'a'.repeat(64),expiresAt:new Date(now+86400000)},
    {...common,sourceInstance:'another-canvas',revision:'b'.repeat(64),expiresAt:new Date(now-86400000)},
  ]);
  return {db,id,courseId,instance,cleanup:()=>db.delete(students).where(eq(students.id,id))};
}
it("dry-run is default; apply needs opt-in and invalid arguments do not remove data",async()=>{
  const f=await retentionFixture();try {
    const env={CANVAS_REVIEW_INSTANCE:f.instance};
    expect(await runQuizReviewRetention([],env)).toMatchObject({mode:'dry-run',expired:1,deleted:0,remaining:1});
    expect(await runQuizReviewRetention(['--dry-run'],env)).toMatchObject({deleted:0});
    for(const args of [['--apply'],['--force'],['--dry-run','--apply'],['--before=2099-01-01']])
      await expect(runQuizReviewRetention(args,env)).rejects.toThrow();
    expect((await countExpiredQuizReviews(f.instance)).count).toBe(1);
    expect(await runQuizReviewRetention(['--apply'],{...env,QUIZ_REVIEW_RETENTION_ENABLED:'true'})).toMatchObject({expired:1,deleted:1,remaining:0});
    expect(await f.db.select().from(quizReviewCandidates).where(eq(quizReviewCandidates.courseId,f.courseId))).toHaveLength(2);
    expect(await f.db.select().from(students).where(eq(students.id,f.id))).toHaveLength(1);
  }finally{await f.cleanup();}
});
it.each([undefined,'','wrong origin','../other','X-INVALID'])('rejects invalid source instance %s',value=>expect(()=>retentionInstance(value)).toThrow());
it("limits each transaction to 500 and keeps other sources/unexpired candidates",async()=>{
  const f=await retentionFixture(501);try{
    expect(await purgeExpiredQuizReviews(f.instance)).toBe(500);
    expect((await countExpiredQuizReviews(f.instance)).count).toBe(1);
    expect(await purgeExpiredQuizReviews(f.instance)).toBe(1);
    expect(await purgeExpiredQuizReviews(f.instance)).toBe(0);
    expect(await f.db.select().from(quizReviewCandidates).where(eq(quizReviewCandidates.courseId,f.courseId))).toHaveLength(2);
  }finally{await f.cleanup();}
});
it("concurrent batches never count or delete an entry twice",async()=>{
  const f=await retentionFixture(501);try{
    const counts=await Promise.all([purgeExpiredQuizReviews(f.instance),purgeExpiredQuizReviews(f.instance)]);
    expect(counts.reduce((a,b)=>a+b,0)).toBe(501);expect((await countExpiredQuizReviews(f.instance)).count).toBe(0);
  }finally{await f.cleanup();}
});
it("audit failure rolls back the same batch deletion",async()=>{
  const f=await retentionFixture();const actual=database.getDb();
  const spy=vi.spyOn(database,'getDb').mockReturnValue({transaction:callback=>actual.transaction(tx=>callback(new Proxy(tx,{
    get(target,key){if(key==='insert')return ()=>{throw Error('fictional audit failure');};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}
  })))} as typeof actual);
  try {await expect(purgeExpiredQuizReviews(f.instance)).rejects.toThrow('fictional audit failure');}
  finally{spy.mockRestore();}
  try{expect((await countExpiredQuizReviews(f.instance)).count).toBe(1);}finally{await f.cleanup();}
});

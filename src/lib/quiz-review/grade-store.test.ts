import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {eq,sql} from 'drizzle-orm';
import {getAdminDb} from '../db/adminClient';
import {getDb,withWeeklyReportLock} from '../db/client';
import {students,studentCourses,quizGradeEvents,quizReviewCandidates} from '../db/schema';
import {appendQuizGrade,readCurrentQuizGrades} from './grade-store';
import {reviewFixture} from './fixtures';
import {parseReview} from './policy';
import type {FormalQuizGrade} from './achievement-records';
import {readCourseLearningRecords} from '../course/learningRecords';
import {computeWeeklyAchievements} from '../f4/achievement';
const row:FormalQuizGrade={courseId:'formal-fictional-course',studentId:'formal-fictional-student',sourceInstance:'test-canvas',
  canvasUserId:9088,quizId:4,canvasAssignmentId:50,stage:'F',attempt:1,targetWeek:'2026-09-21',state:'adopted',earned:6,possible:12};
const input={snapshot:row,expectedToken:null,sourceKey:'a'.repeat(64),revision:'b'.repeat(64),actorId:'fictional-teacher',actorRole:'teacher' as const};
beforeEach(async()=>{
  const url=new URL(process.env.DATABASE_ADMIN_URL!);
  if(url.hostname!=='127.0.0.1'||url.pathname!=='/aischool_test')throw Error('Isolated test database required');
  await getAdminDb().delete(students).where(eq(students.id,row.studentId));
  const now=new Date();await getAdminDb().insert(students).values({id:row.studentId,displayName:'架空正式成績テスト',canvasUserId:9088,firstSeenAt:now,lastSeenAt:now});
  await getAdminDb().insert(studentCourses).values({studentId:row.studentId,courseId:row.courseId,lastSeenAt:now});
});
afterEach(async()=>{vi.unstubAllEnvs();await getAdminDb().delete(students).where(eq(students.id,row.studentId));});
it('feeds confirmed scores into the course calculation only with explicit deployment opt-in',async()=>{
  await appendQuizGrade(input);
  vi.stubEnv('QUIZ_ACHIEVEMENT_ENABLED','false');
  expect((await readCourseLearningRecords(row.courseId,row.studentId)).get(row.studentId)).toBeUndefined();
  vi.stubEnv('QUIZ_ACHIEVEMENT_ENABLED','true');vi.stubEnv('CANVAS_REVIEW_INSTANCE',row.sourceInstance);
  const records=(await readCourseLearningRecords(row.courseId,row.studentId)).get(row.studentId)!;
  expect(computeWeeklyAchievements(records)[0]).toMatchObject({averageScore:50,total:50,attendanceRate:null,submissionRate:null});
});
it('retains revisions while selecting just the replacement or withdrawal',async()=>{
  const first=await appendQuizGrade(input);
  const second=await appendQuizGrade({...input,expectedToken:first.token,snapshot:{...row,attempt:2,earned:12}});
  expect((await readCurrentQuizGrades(row.courseId,row.studentId,row.sourceInstance)).map(x=>x.snapshot.earned)).toEqual([12]);
  await appendQuizGrade({...input,expectedToken:second.token,snapshot:{...row,attempt:2,earned:12,state:'withdrawn'}});
  expect((await readCurrentQuizGrades(row.courseId,row.studentId,row.sourceInstance))[0].snapshot.state).toBe('withdrawn');
  expect(await getDb().select().from(quizGradeEvents).where(eq(quizGradeEvents.studentId,row.studentId))).toHaveLength(3);
});
it('rejects concurrent stale writers and never produces two active scores',async()=>{
  const outcomes=await Promise.allSettled([appendQuizGrade(input),appendQuizGrade(input)]);
  expect(outcomes.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(outcomes.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect(await readCurrentQuizGrades(row.courseId,row.studentId,row.sourceInstance)).toHaveLength(1);
});
it('does not change a grade while a weekly report or retention holds its lock',async()=>{
  await withWeeklyReportLock(async()=>{
    await expect(appendQuizGrade(input)).rejects.toThrow('Weekly report');
    expect(await readCurrentQuizGrades(row.courseId,row.studentId,row.sourceInstance)).toEqual([]);
  });
  await expect(appendQuizGrade(input)).resolves.toHaveProperty('token');
});
it('retains the formal grade after the temporary review copy is removed',async()=>{
  const snapshot=parseReview(reviewFixture(4,9088),{instance:'test-canvas',origin:'https://canvas.example.test',canvasCourseId:1})[0];
  await getAdminDb().insert(quizReviewCandidates).values({courseId:row.courseId,studentId:row.studentId,sourceInstance:row.sourceInstance,
    canvasCourseId:1,sourceKey:snapshot.sourceKey,revision:snapshot.revision,snapshot,importedAt:new Date(),expiresAt:new Date(Date.now()+86400000)});
  await appendQuizGrade({...input,sourceKey:snapshot.sourceKey,revision:snapshot.revision});
  await getAdminDb().delete(quizReviewCandidates).where(eq(quizReviewCandidates.studentId,row.studentId));
  expect(await readCurrentQuizGrades(row.courseId,row.studentId,row.sourceInstance)).toHaveLength(1);
});
it('does not leak grades across course, person or source',async()=>{
  await appendQuizGrade(input);
  expect(await readCurrentQuizGrades('other',row.studentId,row.sourceInstance)).toEqual([]);
  expect(await readCurrentQuizGrades(row.courseId,'other',row.sourceInstance)).toEqual([]);
  expect(await readCurrentQuizGrades(row.courseId,row.studentId,'other')).toEqual([]);
});
it('rejects unknown membership and missing teaching week',async()=>{
  await expect(appendQuizGrade({...input,snapshot:{...row,studentId:'other'}})).rejects.toThrow('対応');
  await expect(appendQuizGrade({...input,snapshot:{...row,targetWeek:null}})).rejects.toThrow('対象授業週');
});
it('denies modifying historical rows with the app role and removes them on student purge',async()=>{
  await appendQuizGrade(input);
  await expect(getDb().execute(sql`UPDATE canvas_quiz_grade_events SET revision='changed' WHERE student_id=${row.studentId}`)).rejects.toThrow();
  await getAdminDb().delete(students).where(eq(students.id,row.studentId));
  expect(await readCurrentQuizGrades(row.courseId,row.studentId,row.sourceInstance)).toEqual([]);
});

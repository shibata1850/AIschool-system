import {test,expect} from '@playwright/test';
import pg from 'pg';
import {signSession} from '../../src/lib/lti/session';
import {reviewFixture} from '../../src/lib/quiz-review/fixtures';

test('formal quiz adoption, private calculation, durable record and withdrawal',async({page,context,baseURL},info)=>{
  const url=new URL(process.env.DATABASE_ADMIN_URL!);
  if(url.hostname!=='127.0.0.1'||!['55442','55444'].includes(url.port)||url.pathname!=='/aischool_test')throw Error('Isolated DB required');
  const db=new pg.Client({connectionString:url.href});await db.connect();
  try{
    await db.query("DELETE FROM students WHERE id IN ('qr-student-1','qr-student-2')");
    await db.query("INSERT INTO students(id,display_name,canvas_user_id,first_seen_at,last_seen_at) VALUES ('qr-student-1','架空受講者1',9001,now(),now()),('qr-student-2','架空受講者2',9002,now(),now())");
    await db.query("INSERT INTO student_courses(student_id,course_id,last_seen_at) VALUES ('qr-student-1','quiz-context',now()),('qr-student-2','quiz-context',now())");
    async function login(role:'teacher'|'student',other=false,canvasOverride?:number){await context.addCookies([{name:'lti_session',url:baseURL!,value:await signSession({
      sub:role==='teacher'?'qr-teacher':other?'qr-student-2':'qr-student-1',role,courseId:'quiz-context',canvasUserId:canvasOverride??(role==='teacher'?9000:other?9002:9001)},process.env.LTI_SESSION_SECRET!)}]);}
    const scenario=async(mode:string)=>{expect((await context.request.post('http://127.0.0.1:3129/__scenario?mode='+mode,{headers:{authorization:'Bearer fictional-quiz-review-token'}})).ok()).toBe(true);};
    await scenario('matched');await login('teacher');
    const fixture={...reviewFixture(),source_origin:'http://127.0.0.1:3129'};
    expect((await context.request.post('/api/teacher/quiz-review',{headers:{origin:baseURL!},data:fixture})).status()).toBe(200);
    const candidate=(await (await context.request.get('/api/teacher/quiz-review')).json())[0].snapshot;
    const body={action:'adopt',sourceKey:candidate.sourceKey,revision:candidate.revision,targetWeek:'2026-09-21',confirmed:true,expectedToken:null};
    const post=(data:unknown)=>context.request.post('/api/teacher/quiz-grades',{headers:{origin:baseURL!},data});
    expect((await post({...body,targetWeek:'2026-09-22'})).status()).toBe(400);
    expect((await post({...body,confirmed:false})).status()).toBe(400);
    await scenario('regraded');expect((await post(body)).status()).toBe(409);
    await scenario('matched');await page.goto('/teacher/quiz-review');
    const section=page.getByRole('region',{name:'総合到達度への反映'});
    await expect(section.getByLabel('反映する最終テスト')).toBeEnabled();
    await section.getByLabel('反映する最終テスト').selectOption(candidate.sourceKey+':'+candidate.revision);
    await section.getByLabel('対象授業週の月曜日').fill('2026-09-21');
    await section.getByLabel('受講者・受験回・授業週を確認しました').check();
    await section.getByRole('button',{name:'総合到達度に採用する',exact:true}).click();
    await expect(section.getByRole('status')).toHaveText('総合到達度用の採用状態を保存しました');
    expect((await post(body)).status()).toBe(409);
    await db.query("INSERT INTO assignments(id,title,description,char_limit,deadline) VALUES ('formal-duplicate-exercise','架空演習','架空',100,'2026-09-30') ON CONFLICT DO NOTHING");
    await scenario('assignment-repurposed');
    expect((await context.request.post('/api/teacher/assignment-links',{headers:{origin:baseURL!},data:{assignmentId:'formal-duplicate-exercise',canvasAssignmentId:904}})).status()).toBe(409);
    await scenario('matched');
    await page.screenshot({path:info.outputPath('teacher-formal.png'),fullPage:true});
    await login('student');expect((await post(body)).status()).toBe(403);
    await page.goto('/achievement');await expect(page.getByRole('region',{name:'今の到達度'})).toContainText('100');
    await page.getByRole('link',{name:'総合到達度に使う小テストと計算根拠を見る'}).click();
    await expect(page.getByText('総合到達度に採用中',{exact:false})).toBeVisible();
    await expect(page.getByText('12/12点',{exact:false})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('learner-formal.png'),fullPage:true});
    await db.query("UPDATE students SET canvas_user_id=9003 WHERE id='qr-student-1'");
    await login('student',false,9003);await page.goto('/achievement');
    await expect(page.getByText('まだ記録がありません。はじめての授業のあとに表示されます。')).toBeVisible();
    await db.query("UPDATE students SET canvas_user_id=9001 WHERE id='qr-student-1'");
    await login('student',true);await page.goto('/achievement/quiz-grades');await expect(page.getByText('まだ採用記録はありません。')).toBeVisible();
    await db.query("DELETE FROM canvas_quiz_review_candidates WHERE course_id='quiz-context'");
    await login('student');await page.goto('/achievement/quiz-grades');await expect(page.getByText('総合到達度に採用中',{exact:false})).toBeVisible();
    await login('teacher');await page.goto('/teacher/quiz-review');
    await section.getByLabel('受講者番号9001の小テスト4を取り下げることを確認しました').check();
    await section.getByRole('button',{name:'この成績を総合到達度から取り下げる'}).click();
    await expect(section.getByText('取り下げ済み',{exact:false})).toBeVisible();
    await login('student');await page.goto('/achievement/quiz-grades');await expect(page.getByText('取り下げ済み・集計対象外',{exact:false})).toBeVisible();
    await page.goto('/achievement');await expect(page.getByText('まだ記録がありません。はじめての授業のあとに表示されます。')).toBeVisible();
  }finally{await db.query("DELETE FROM canvas_assignment_links WHERE assignment_id='formal-duplicate-exercise'");await db.query("DELETE FROM assignments WHERE id='formal-duplicate-exercise'");await db.query("DELETE FROM students WHERE id IN ('qr-student-1','qr-student-2')");await db.end();}
});

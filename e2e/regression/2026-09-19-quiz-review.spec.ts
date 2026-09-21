import {test,expect} from "@playwright/test";
import pg from "pg";
import {signSession} from "../../src/lib/lti/session";
import {reviewFixture as fixture} from "../../src/lib/quiz-review/fixtures";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {resolve} from "node:path";
const reviewFixture=(...args:Parameters<typeof fixture>)=>({...fixture(...args),source_origin:"http://127.0.0.1:3129"});

test('teacher adoption, replacement, withdrawal and private learner display',async({page,context,baseURL},info)=>{
  const url=new URL(process.env.DATABASE_ADMIN_URL!);
  if(url.hostname!=='127.0.0.1'||url.port!=='55442'||url.pathname!=='/aischool_test')throw Error('Isolated DB required');
  const db=new pg.Client({connectionString:url.href});await db.connect();
  try{
    await db.query("DELETE FROM students WHERE id IN ('qr-student-1','qr-student-2','qr-student-3','qr-duplicate')");
    await db.query("INSERT INTO students(id,display_name,canvas_user_id,first_seen_at,last_seen_at) VALUES ('qr-student-1','架空の受講者1',9001,now(),now()),('qr-student-2','架空の受講者2',9002,now(),now())");
    await db.query("INSERT INTO student_courses(student_id,course_id,last_seen_at) VALUES ('qr-student-1','quiz-context',now()),('qr-student-2','quiz-context',now())");
    await context.request.post('http://127.0.0.1:3129/__scenario?mode=practice',{headers:{authorization:'Bearer fictional-quiz-review-token'}});
    async function login(role:'teacher'|'student',id=role==='teacher'?'qr-teacher':'qr-student-1',canvasUserId=role==='teacher'?9000:9001,courseId='quiz-context'){
      await context.addCookies([{name:'lti_session',url:baseURL!,value:await signSession({sub:id,role,courseId,canvasUserId},process.env.LTI_SESSION_SECRET!)}]);
    }
    const post=(data:unknown,origin=baseURL!)=>context.request.post('/api/teacher/quiz-review/decision',{headers:{origin},data});
    const list=async()=>{const r=await context.request.get('/api/teacher/quiz-review');expect(r.status()).toBe(200);return await r.json();};
    await login('teacher');
    expect((await context.request.post('/api/teacher/quiz-review',{headers:{origin:baseURL!},data:reviewFixture()})).status()).toBe(200);
    const first=(await list())[0].snapshot;
    const payload={sourceKey:first.sourceKey,revision:first.revision,action:'adopt',confirmed:true,expectedToken:null};
    await page.goto('/teacher/quiz-review');
    const adopt=page.getByRole('button',{name:'この結果を本人表示に採用',exact:true});
    await expect(adopt).toBeDisabled();
    expect((await post({...payload,confirmed:false})).status()).toBe(400);
    expect((await post({...payload,studentId:'other'})).status()).toBe(400);
    expect((await post(payload,'https://wrong.example.test')).status()).toBe(403);
    expect((await context.request.post('/api/teacher/quiz-review/decision',{headers:{origin:baseURL!,'content-type':'application/json'},data:'x'.repeat(2049)})).status()).toBe(413);
    expect((await post({...payload,revision:'b'.repeat(64)})).status()).toBe(409);
    await page.getByRole('checkbox',{name:'Canvasの答案で受講者・受験回・各設問の得点を確認しました'}).check();await adopt.click();
    await expect(page.getByText('講師確認済み・本人表示中',{exact:false})).toBeVisible();
    const firstDecision=(await list())[0].decision;
    expect(firstDecision.state).toBe('adopted');
    expect((await post(payload)).status()).toBe(409); // Stale tab cannot overwrite.
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
    await page.screenshot({path:info.outputPath('teacher-adopted.png'),fullPage:true});
    await login('student');
    const own=await context.request.get('/api/quiz-results');expect(own.status()).toBe(200);expect(own.headers()['cache-control']).toContain('no-store');
    const body=await own.json();expect(body).toHaveLength(1);expect(JSON.stringify(body)).not.toMatch(/canvasUserId|sourceKey|studentId|decidedBy|qr-student/);
    await page.goto('/achievement/quizzes');await expect(page.getByText('合計：12 / 12点')).toBeVisible();
    await expect(page.getByText('表示期限：',{exact:false})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('learner-adopted.png'),fullPage:true});
    // An internal ID remapped to a different Canvas user must not expose the old candidate.
    await db.query("UPDATE students SET canvas_user_id=9003 WHERE id='qr-student-1'");
    await login('student','qr-student-1',9003);
    expect(await (await context.request.get('/api/quiz-results')).json()).toEqual([]);
    await db.query("UPDATE students SET canvas_user_id=9001 WHERE id='qr-student-1'");await login('student');
    expect((await post({...payload,action:'withdraw',expectedToken:firstDecision.token})).status()).toBe(403);
    expect((await context.request.get('/api/quiz-results?studentId=qr-student-2')).status()).toBe(400);
    await login('student','qr-student-2',9002);expect(await (await context.request.get('/api/quiz-results')).json()).toEqual([]);
    await login('student','qr-student-1',9002);expect((await context.request.get('/api/quiz-results')).status()).toBe(409);
    await login('student','qr-student-1',9001,'other-context');expect((await context.request.get('/api/quiz-results')).status()).toBe(409);
    await context.clearCookies();expect((await context.request.get('/api/quiz-results')).status()).toBe(403);
    await login('teacher');expect((await context.request.get('/api/quiz-results')).status()).toBe(403);
    const revised=reviewFixture();revised.records[0].scores['STEP01/F01']=0;revised.records[0].total.reported=11;
    expect((await context.request.post('/api/teacher/quiz-review',{headers:{origin:baseURL!},data:revised})).status()).toBe(200);
    const rows=await list(),second=rows.find((r:{snapshot:{earned:number}})=>r.snapshot.earned===11);
    expect(second.decision.token).toBe(firstDecision.token);
    const replacement=await post({...payload,revision:second.snapshot.revision,expectedToken:firstDecision.token});expect(replacement.status()).toBe(200);
    const secondDecision=await replacement.json();
    await login('student');expect((await (await context.request.get('/api/quiz-results')).json())[0].earned).toBe(11);
    await page.reload();await expect(page.getByText('合計：11 / 12点')).toBeVisible();await expect(page.getByText('合計：12 / 12点')).toHaveCount(0);
    await login('teacher');await page.goto('/teacher/quiz-review');
    await page.getByRole('button',{name:'本人表示を取り下げる',exact:true}).click();await expect(page.getByText('取り下げ済み',{exact:false})).toBeVisible();
    await login('student');await page.goto('/achievement/quizzes');await expect(page.getByText('現在、表示できる講師確認済みの結果はありません。')).toBeVisible();
    await login('teacher');
    const ungraded=reviewFixture(4,9001,2);ungraded.records[0].scores['STEP01/F01']=null;
    expect((await context.request.post('/api/teacher/quiz-review',{headers:{origin:baseURL!},data:ungraded})).status()).toBe(200);
    const pending=(await list()).find((r:{snapshot:{earned:number|null}})=>r.snapshot.earned===null);
    expect((await post({...payload,sourceKey:pending.snapshot.sourceKey,revision:pending.snapshot.revision,expectedToken:pending.decision.token})).status()).toBe(409);
    await page.goto('/teacher/quiz-review');await expect(page.getByText('未採点があるため採用できません。')).toBeVisible();
    const current=(await list()).find((r:{snapshot:{earned:number}})=>r.snapshot.earned===11);
    expect((await post({...payload,revision:second.snapshot.revision,expectedToken:current.decision.token})).status()).toBe(200);
    await db.query("UPDATE canvas_quiz_review_candidates SET imported_at=now()-interval '32 days',expires_at=now()-interval '1 day' WHERE student_id='qr-student-1'");
    await login('student');expect(await (await context.request.get('/api/quiz-results')).json()).toEqual([]);
    await login('teacher');expect((await post({...payload,expectedToken:secondDecision.token})).status()).toBe(409);
    await db.query("DELETE FROM students WHERE id='qr-student-1'");
    expect((await db.query("SELECT count(*)::int n FROM canvas_quiz_review_decisions WHERE student_id='qr-student-1'")).rows[0].n).toBe(0);
  }finally{await db.end();}
});

test("candidate save/reload, duplicates, revisions, errors, authorization and expiry",async({page,context,baseURL},info)=>{
  const url=new URL(process.env.DATABASE_ADMIN_URL!);
  if(url.hostname!=="127.0.0.1"||url.port!=="55442"||url.pathname!=="/aischool_test") throw new Error("Isolated DB required");
  const db=new pg.Client({connectionString:url.href});await db.connect();
  try {
    // Only the named fictional fixtures in the isolated database.
    await db.query("DELETE FROM students WHERE id IN ('qr-student-1','qr-student-2','qr-student-3','qr-duplicate')");
    await db.query("INSERT INTO students(id,display_name,canvas_user_id,first_seen_at,last_seen_at) VALUES ('qr-student-1','架空の受講者1',9001,now(),now()),('qr-student-2','架空の受講者2',9002,now(),now()),('qr-student-3','架空の受講者3',9003,now(),now())");
    await db.query("INSERT INTO student_courses(student_id,course_id,last_seen_at) VALUES ('qr-student-1','quiz-context',now()),('qr-student-2','other-context',now()),('qr-student-3','quiz-context',now())");
    async function login(role:"teacher"|"admin"|"student",courseId="quiz-context",canvasUserId=9000) {
      await context.addCookies([{name:"lti_session",url:baseURL!,value:await signSession({sub:"qr-"+role,role,courseId,canvasUserId},process.env.LTI_SESSION_SECRET!)}]);
    }
    const post=(data:unknown,origin=baseURL!)=>context.request.post('/api/teacher/quiz-review',{headers:{origin},data});
    const scenario=async(mode:string)=>expect((await context.request.post('http://127.0.0.1:3129/__scenario?mode='+mode,
      {headers:{authorization:'Bearer fictional-quiz-review-token'}})).status()).toBe(200);
    await scenario('matched');
    await login("teacher");
    await page.goto('/teacher/quiz-review');
    await expect(page.getByText('表示できる確認用データはありません。')).toBeVisible();
    const fixture=reviewFixture();
    await page.getByLabel('確認用JSON（512KB以内）').setInputFiles({name:'fictional.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
    await page.getByRole('button',{name:'確認待ちとして保存',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('確認待ちとして1件保存しました');
    await page.reload();
    await expect(page.getByText('合計：12 / 12点')).toBeVisible();
    expect((await db.query("SELECT count(*)::int n FROM canvas_quiz_review_candidates WHERE course_id='quiz-context'")).rows[0].n).toBe(1);
    const stored=(await (await context.request.get('/api/teacher/quiz-review')).json())[0].snapshot;
    const verifyUrl='/api/teacher/quiz-review/verify?'+new URLSearchParams({sourceKey:stored.sourceKey,revision:stored.revision});
    const verifyButton=page.getByRole('button',{name:'Canvasと照合',exact:true});
    await verifyButton.click();await expect(page.getByText('照合時点で、最新の受験回・設問番号・配点・設問別得点がCanvasと一致しました。')).toBeVisible();
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
    await page.screenshot({path:info.outputPath('quiz-verification.png'),fullPage:true});
    await page.reload();await expect(page.getByText('照合時点で、最新の受験回・設問番号・配点・設問別得点がCanvasと一致しました。')).toHaveCount(0);
    for(const [mode,status,text] of [
      ['practice','manual_review_required','この小テスト形式は現在、自動照合に対応していません。Canvasの答案画面で確認してください。'],
      ['regraded','different','Canvasの採点結果と異なります。新しい分析CSVを取得して確認してください。'],
      ['newer','older_attempt','Canvasに新しい受験回があります。この結果は最新の受験回ではありません。'],
      ['pending','incomplete','受験中・未採点・免除などのため、採点済み結果として照合できません。'],
      ['questions','structure_changed','設問構成または配点が登録済み教材と異なります。教材との対応を確認してください。'],
      ['offline','unavailable','必要なCanvas情報を確認できませんでした。時間をおいて再度照合してください。'],
    ]) {
      await scenario(mode);await verifyButton.click();await expect(page.getByText(text,{exact:true})).toBeVisible();
      if(mode==='practice') {
        await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
        await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
        await page.screenshot({path:info.outputPath('practice-quiz-notice.png'),fullPage:true});
      }
      const response=await context.request.get(verifyUrl);expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toContain('no-store');
      const body=await response.json();expect(body.status).toBe(status);expect(Object.keys(body).sort()).toEqual(['checkedAt','message','status']);
    }
    await scenario('matched');await verifyButton.click();await expect(page.getByText('照合時点で、最新の受験回・設問番号・配点・設問別得点がCanvasと一致しました。')).toBeVisible();
    expect((await context.request.get('/api/teacher/quiz-review/verify?sourceKey=bad&revision=bad')).status()).toBe(400);
    expect((await context.request.get('/api/teacher/quiz-review/verify?sourceKey='+'a'.repeat(64)+'&revision='+'b'.repeat(64))).status()).toBe(409);
    expect((await db.query("SELECT count(*)::int n FROM canvas_quiz_review_candidates WHERE course_id='quiz-context'")).rows[0].n).toBe(1);
    const duplicate=await post(fixture);expect(duplicate.status()).toBe(200);expect(await duplicate.json()).toMatchObject({created:0,duplicates:1});
    fixture.records[0].scores['STEP01/F01']=0;fixture.records[0].total.reported=11;
    expect(await (await post(fixture)).json()).toMatchObject({created:1,changedAttempts:1});
    await page.reload();await expect(page.getByText('合計：11 / 12点')).toBeVisible();await expect(page.getByText('合計：12 / 12点')).toBeVisible();
    const missing=reviewFixture(4,9001,2);missing.records[0].scores['STEP01/F01']=null;
    expect((await post(missing)).status()).toBe(200);await page.reload();await expect(page.getByText('合計：未採点を含む / 12点')).toBeVisible();
    const zero=reviewFixture(4,9001,3);Object.keys(zero.records[0].scores).forEach(k=>zero.records[0].scores[k]=0);zero.records[0].total.reported=0;
    expect((await post(zero)).status()).toBe(200);await page.reload();await expect(page.getByText('合計：0 / 12点')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('quiz-review.png'),fullPage:true});
    for(const data of [{}, {...fixture,source_instance:'wrong'}, {...fixture,course_id:2}]) expect((await post(data)).status()).toBe(400);
    expect((await post(fixture,'https://wrong.example.test')).status()).toBe(403);
    expect((await context.request.post('/api/teacher/quiz-review',{data:fixture})).status()).toBe(403);
    expect((await context.request.post('/api/teacher/quiz-review',{headers:{origin:baseURL!,'content-type':'application/json'},data:'{'})).status()).toBe(400);
    expect((await context.request.post('/api/teacher/quiz-review',{headers:{origin:baseURL!,'content-type':'application/json'},data:'x'.repeat(512*1024+1)})).status()).toBe(413);
    expect((await post(reviewFixture(4,9002))).status()).toBe(409); // Other recorded course.
    expect((await post(reviewFixture(4,9999))).status()).toBe(409); // Not enrolled.
    const batch=reviewFixture(4,9003);batch.records.push(reviewFixture(4,9002).records[0]);batch.record_count=2;
    expect((await post(batch)).status()).toBe(409);
    expect((await db.query("SELECT count(*)::int n FROM canvas_quiz_review_candidates WHERE student_id='qr-student-3'")).rows[0].n).toBe(0); // Whole transaction rejected.
    await db.query("INSERT INTO students(id,display_name,canvas_user_id,first_seen_at,last_seen_at) VALUES ('qr-duplicate','架空の重複',9001,now(),now())");
    expect((await post(fixture)).status()).toBe(409);
    await db.query("DELETE FROM students WHERE id='qr-duplicate'");
    await login('teacher','other-context');
    expect((await context.request.get(verifyUrl)).status()).toBe(409);
    const other=await context.request.get('/api/teacher/quiz-review');expect(other.status()).toBe(200);expect(await other.json()).toEqual([]);
    expect((await post(fixture)).status()).toBe(400);
    await login('teacher','quiz-context',9999);expect((await post(fixture)).status()).toBe(403);
    await login('student','quiz-context',9001);expect((await post(fixture)).status()).toBe(403);
    expect((await context.request.get(verifyUrl)).status()).toBe(403);
    expect((await context.request.get('/api/teacher/quiz-review')).status()).toBe(403);
    expect((await page.goto('/teacher/quiz-review'))?.status()).toBe(403);
    await expect(page.getByText('この画面を見る権限がありません（先生・管理者だけが使えます）')).toBeVisible();
    await expect(page.getByRole('button',{name:'確認待ちとして保存'})).toHaveCount(0);
    await context.clearCookies();expect((await post(fixture)).status()).toBe(403);
    expect((await context.request.get(verifyUrl)).status()).toBe(403);
    await login('teacher');
    await db.query("UPDATE canvas_quiz_review_candidates SET imported_at=now()-interval '31 days', expires_at=now()-interval '1 day' WHERE course_id='quiz-context'");
    expect(await (await context.request.get('/api/teacher/quiz-review')).json()).toEqual([]);
    expect((await context.request.get(verifyUrl)).status()).toBe(409);
    await db.query("DELETE FROM students WHERE id='qr-student-1'");
    expect((await db.query("SELECT count(*)::int n FROM canvas_quiz_review_candidates WHERE student_id='qr-student-1'")).rows[0].n).toBe(0);
  } finally {await db.end();}
});

test("existing Canvas CSV acquisition: save, errors, permissions and bounds",async({page,context,baseURL},info)=>{
  const url=new URL(process.env.DATABASE_ADMIN_URL!);
  if(url.hostname!=="127.0.0.1"||url.port!=="55442"||url.pathname!=="/aischool_test")throw Error("Isolated DB required");
  const db=new pg.Client({connectionString:url.href});await db.connect();
  try {
    await db.query("DELETE FROM students WHERE id IN ('qr-student-1','qr-student-2','qr-student-3','qr-duplicate')");
    await db.query("INSERT INTO students(id,display_name,canvas_user_id,first_seen_at,last_seen_at) VALUES ('qr-student-1','架空の受講者1',9001,now(),now()),('qr-student-2','架空の受講者2',9002,now(),now())");
    await db.query("INSERT INTO student_courses(student_id,course_id,last_seen_at) VALUES ('qr-student-1','quiz-context',now()),('qr-student-2','other-context',now())");
    const login=async(role:'teacher'|'student',courseId='quiz-context',canvasUserId=9000)=>context.addCookies([{name:'lti_session',url:baseURL!,
      value:await signSession({sub:'qr-'+role,role,courseId,canvasUserId},process.env.LTI_SESSION_SECRET!)}]);
    const scenario=async(mode:string)=>expect((await context.request.post('http://127.0.0.1:3129/__scenario?mode='+mode,
      {headers:{authorization:'Bearer fictional-quiz-review-token'}})).status()).toBe(200);
    const acquire=(data:unknown={quizId:4},origin=baseURL!)=>context.request.post('/api/teacher/quiz-review/acquire',{headers:{origin},data});
    await login('teacher');await scenario('csv-ready');await page.goto('/teacher/quiz-review');
    const button=page.getByRole('button',{name:'分析CSVを取得して保存'});
    await expect(button).toBeDisabled();await page.getByLabel('取得する小テスト').selectOption('4');await button.click();
    await expect(page.getByRole('status')).toContainText('分析CSVから1件を確認待ちで保存しました');
    await expect(page.getByText('合計：12 / 12点')).toBeVisible();await page.reload();
    await expect(page.getByText('取得元：Canvasの分析CSV（すべての受験回）',{exact:false})).toBeVisible();
    await expect(page.getByText('取得日時：',{exact:false})).toContainText('最新性は未確認');
    const list=await (await context.request.get('/api/teacher/quiz-review')).text();expect(list).not.toMatch(/架空氏名|PRIVATE RESPONSE/);
    expect(JSON.parse(list)[0].snapshot.source).toMatchObject({kind:'canvas_report',allAttempts:true,freshness:'unconfirmed'});
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('csv-acquisition.png'),fullPage:true});
    expect(await (await acquire()).json()).toMatchObject({created:0,duplicates:1});
    const count=()=>db.query("SELECT count(*)::int n FROM canvas_quiz_review_candidates WHERE course_id='quiz-context'").then(r=>r.rows[0].n);
    for(const mode of ['csv-missing','csv-running','csv-bad','csv-wrong-student']) {
      await scenario(mode);const response=await acquire();expect(response.status()).toBe(409);expect(await count()).toBe(1);
    }
    await scenario('csv-missing');await page.getByLabel('取得する小テスト').selectOption('4');await button.click();
    await expect(page.getByRole('status')).toContainText('生成完了後');
    await scenario('csv-empty');expect(await (await acquire()).json()).toMatchObject({created:0,duplicates:0});
    await scenario('csv-ready');
    for(const data of [{quizId:999},{quizId:4,url:'https://evil.test'},{quizId:'4'}])expect((await acquire(data)).status()).toBe(400);
    expect((await acquire({quizId:4},'https://wrong.test')).status()).toBe(403);
    expect((await context.request.post('/api/teacher/quiz-review/acquire',{headers:{origin:baseURL!,'content-type':'application/json'},data:'x'.repeat(129)})).status()).toBe(413);
    await login('teacher','other-context');expect((await acquire()).status()).toBe(400);
    await login('teacher','quiz-context',9999);expect((await acquire()).status()).toBe(403);
    await login('student','quiz-context',9001);expect((await acquire()).status()).toBe(403);
    await context.clearCookies();expect((await acquire()).status()).toBe(403);
    expect(await count()).toBe(1);
    expect((await db.query("SELECT count(*)::int n FROM audit_log WHERE entity='canvas_quiz_report_acquisition'")).rows[0].n).toBeGreaterThanOrEqual(2);
  }finally{await db.end();}
});

test("CSV preparation request, status, uncertainty, authorization and save",async({page,context,baseURL},info)=>{
  const url=new URL(process.env.DATABASE_ADMIN_URL!);
  if(url.hostname!=="127.0.0.1"||url.port!=="55442"||url.pathname!=="/aischool_test")throw Error("Isolated DB required");
  const db=new pg.Client({connectionString:url.href});await db.connect();
  try {
    await db.query("DELETE FROM students WHERE id IN ('qr-student-1','qr-student-2','qr-student-3','qr-duplicate')");
    await db.query("INSERT INTO students(id,display_name,canvas_user_id,first_seen_at,last_seen_at) VALUES ('qr-student-1','架空の受講者1',9001,now(),now())");
    await db.query("INSERT INTO student_courses(student_id,course_id,last_seen_at) VALUES ('qr-student-1','quiz-context',now())");
    const login=async(role:'teacher'|'student',courseId='quiz-context',canvasUserId=9000)=>context.addCookies([{name:'lti_session',url:baseURL!,
      value:await signSession({sub:'qr-'+role,role,courseId,canvasUserId},process.env.LTI_SESSION_SECRET!)}]);
    const fakeHeaders={authorization:'Bearer fictional-quiz-review-token'};
    const scenario=async(mode:string)=>expect((await context.request.post('http://127.0.0.1:3129/__scenario?mode='+mode,{headers:fakeHeaders})).status()).toBe(200);
    const postCount=async()=>(await (await context.request.get('http://127.0.0.1:3129/__metrics',{headers:fakeHeaders})).json()).generationRequests;
    const request=(data:unknown={quizId:4},origin=baseURL!)=>context.request.post('/api/teacher/quiz-review/prepare',{headers:{origin},data});
    const status=()=>context.request.get('/api/teacher/quiz-review/prepare?quizId=4');
    await login('teacher');await scenario('prepare-new');await page.goto('/teacher/quiz-review');
    const create=page.getByRole('button',{name:'CSVの作成を依頼',exact:true}),check=page.getByRole('button',{name:'準備状況を確認',exact:true}),
      acquire=page.getByRole('button',{name:'分析CSVを取得して保存',exact:true});
    await expect(create).toBeDisabled();await expect(check).toBeDisabled();
    await page.getByLabel('取得する小テスト').selectOption('4');await check.click();await expect(page.getByRole('status')).toContainText('未作成');
    expect(await postCount()).toBe(0);await create.click();await expect(page.getByRole('status')).toContainText('順番待ち');
    await expect(create).toBeDisabled();await expect(acquire).toBeDisabled();expect(await postCount()).toBe(1);
    await check.click();await expect(page.getByRole('status')).toContainText('順番待ち');
    expect(await (await request()).json()).toMatchObject({state:'queued',requestOutcome:'not_requested'});expect(await postCount()).toBe(1);
    expect((await db.query("SELECT count(*)::int n FROM canvas_quiz_review_candidates WHERE course_id='quiz-context'")).rows[0].n).toBe(0);
    await scenario('csv-ready');await check.click();await expect(page.getByRole('status')).toContainText('準備ができています');
    await expect(page.getByRole('status')).toContainText('最新性は未確認');await expect(acquire).toBeEnabled();
    await acquire.click();await expect(page.getByRole('status')).toContainText('1件を確認待ちで保存');await expect(page.getByText('合計：12 / 12点')).toBeVisible();
    // A successful prepare can reuse an older report. It must not be called fresh.
    await create.click();await expect(page.getByRole('status')).toContainText('以前のCSV');expect(await postCount()).toBe(1);
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('csv-preparation.png'),fullPage:true});
    const ready=await status();expect(ready.headers()['cache-control']).toContain('no-store');
    const result=await ready.json();expect(Object.keys(result).sort()).toEqual(['checkedAt','fileUpdatedAt','freshness','message','requestOutcome','state']);
    expect(JSON.stringify(result)).not.toMatch(/verifier|PRIVATE|download/);
    await scenario('prepare-unknown');await create.click();await expect(page.getByRole('status')).toContainText('自動で再送していません');
    await expect(create).toBeDisabled();await expect(acquire).toBeDisabled();expect(await postCount()).toBe(1);
    await check.click();await expect(page.getByRole('status')).toContainText('準備ができています');expect(await postCount()).toBe(1);await expect(create).toBeEnabled();
    await scenario('prepare-conflict');expect(await (await request()).json()).toMatchObject({state:'queued',requestOutcome:'already_running'});expect(await postCount()).toBe(1);
    await scenario('prepare-failed');await check.click();await expect(page.getByRole('status')).toContainText('作成に失敗');await expect(acquire).toBeDisabled();
    await scenario('prepare-incomplete');await check.click();await expect(page.getByRole('status')).toContainText('準備完了を確認できません');
    await expect(create).toBeDisabled();await expect(acquire).toBeDisabled();
    expect(await (await request()).json()).toMatchObject({state:'incomplete',requestOutcome:'not_requested'});expect(await postCount()).toBe(0);
    await page.getByLabel('取得する小テスト').selectOption('3');await expect(page.getByRole('status')).toBeEmpty();
    for(const data of [{quizId:999},{quizId:'4'},{quizId:4,url:'https://evil.test'}])expect((await request(data)).status()).toBe(400);
    expect((await request({quizId:4},'https://wrong.test')).status()).toBe(403);
    expect((await context.request.post('/api/teacher/quiz-review/prepare',{data:{quizId:4}})).status()).toBe(403);
    expect((await context.request.post('/api/teacher/quiz-review/prepare',{headers:{origin:baseURL!,'content-type':'application/json'},data:'x'.repeat(129)})).status()).toBe(413);
    for(const query of ['quizId=4&quizId=4','quizId=4&url=x','quizId=NaN'])expect((await context.request.get('/api/teacher/quiz-review/prepare?'+query)).status()).toBe(400);
    await login('teacher','other-context');expect((await request()).status()).toBe(400);expect((await status()).status()).toBe(400);
    await login('teacher','quiz-context',9999);expect((await request()).status()).toBe(403);expect((await status()).status()).toBe(403);
    await login('student','quiz-context',9001);expect((await request()).status()).toBe(403);expect((await status()).status()).toBe(403);
    await context.clearCookies();expect((await request()).status()).toBe(403);expect((await status()).status()).toBe(403);
    expect(await postCount()).toBe(0); // incomplete state and denied requests did not create jobs
    const events=(await db.query("SELECT after FROM audit_log WHERE entity='canvas_quiz_report_preparation'")).rows.map(r=>r.after);
    expect(events.some(e=>e.phase==='started')).toBe(true);expect(events.some(e=>e.phase==='finished'&&e.result.state==='unknown')).toBe(true);
  }finally{await db.end();}
});

test("retention CLI dry-run, opt-in and deletion keep active review visible",async({page,context,baseURL})=>{
  const url=new URL(process.env.DATABASE_ADMIN_URL!);
  if(url.hostname!=="127.0.0.1"||url.port!=="55442"||url.pathname!=="/aischool_test")throw Error("Isolated DB required");
  const db=new pg.Client({connectionString:url.href});await db.connect();
  try {
    await db.query("DELETE FROM students WHERE id IN ('qr-student-1','qr-student-2','qr-student-3','qr-duplicate')");
    await db.query("INSERT INTO students(id,display_name,canvas_user_id,first_seen_at,last_seen_at) VALUES ('qr-student-1','架空の保存期間受講者',9001,now(),now())");
    await db.query("INSERT INTO student_courses(student_id,course_id,last_seen_at) VALUES ('qr-student-1','quiz-context',now())");
    await context.addCookies([{name:'lti_session',url:baseURL!,value:await signSession({sub:'qr-teacher',role:'teacher',courseId:'quiz-context',canvasUserId:9000},process.env.LTI_SESSION_SECRET!)}]);
    const post=(data:unknown)=>context.request.post('/api/teacher/quiz-review',{headers:{origin:baseURL!},data});
    expect((await post(reviewFixture())).status()).toBe(200);
    await db.query("UPDATE canvas_quiz_review_candidates SET imported_at=now()-interval '31 days',expires_at=now()-interval '1 day' WHERE course_id='quiz-context'");
    const active=reviewFixture();active.records[0].scores['STEP01/F01']=0;active.records[0].total.reported=11;
    expect((await post(active)).status()).toBe(200);
    const count=()=>db.query("SELECT count(*)::int n FROM canvas_quiz_review_candidates WHERE course_id='quiz-context'").then(r=>r.rows[0].n);
    const cli=async(args:string[],enabled='',instance='test-canvas')=>{
      try {
        const r=await promisify(execFile)(process.execPath,[resolve('dist-scripts/purge-quiz-reviews.mjs'),...args],{
          env:{...process.env,CANVAS_REVIEW_INSTANCE:instance,QUIZ_REVIEW_RETENTION_ENABLED:enabled},timeout:45000,maxBuffer:65536});
        return {code:0,...r};
      }catch(error){const r=error as {code:number;stdout:string;stderr:string};return {code:r.code,stdout:r.stdout,stderr:r.stderr};}
    };
    const dry=await cli([]);expect(dry.code).toBe(0);expect(JSON.parse(dry.stdout)).toMatchObject({mode:'dry-run',expired:1,deleted:0,remaining:1});expect(await count()).toBe(2);
    for(const args of [['--apply'],['--before=2099-01-01'],['--force']]) {
      const blocked=await cli(args);expect(blocked.code).toBe(1);expect(blocked.stderr).not.toMatch(/postgres:|9001|qr-student/);expect(await count()).toBe(2);
    }
    const other=await cli(['--apply'],'true','other-source');expect(other.code).toBe(0);expect(JSON.parse(other.stdout).deleted).toBe(0);expect(await count()).toBe(2);
    const applied=await cli(['--apply'],'true');expect(applied.code).toBe(0);expect(JSON.parse(applied.stdout)).toMatchObject({mode:'apply',deleted:1,remaining:0});
    expect(await count()).toBe(1);expect(JSON.parse((await cli(['--apply'],'true')).stdout).deleted).toBe(0);
    await page.goto('/teacher/quiz-review');await expect(page.getByText('合計：11 / 12点')).toBeVisible();await expect(page.getByText('合計：12 / 12点')).toHaveCount(0);
    expect((await db.query("SELECT count(*)::int n FROM students WHERE id='qr-student-1'")).rows[0].n).toBe(1);
    const audit=(await db.query("SELECT before FROM audit_log WHERE entity='canvas_quiz_review_expired' ORDER BY id DESC LIMIT 1")).rows[0].before;
    expect(audit).toMatchObject({count:1,sourceInstance:'test-canvas'});expect(JSON.stringify(audit)).not.toMatch(/qr-student|9001|scores/);
  }finally{await db.end();}
});

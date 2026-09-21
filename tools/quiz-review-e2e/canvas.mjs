import http from 'node:http';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync(new URL('../../src/lib/quiz-review/catalog.json',import.meta.url),'utf8'));
let mode='matched',generationRequests=0;
// Fictional loopback-only Canvas; never proxies requests to the real service.
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:3129');
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/health') return json({ready:true});
  if(req.headers.authorization!=='Bearer fictional-quiz-review-token') return json({},401);
  if(url.pathname==='/__scenario'&&req.method==='POST') {mode=url.searchParams.get('mode')??'matched';generationRequests=0;return json({ready:true});}
  if(url.pathname==='/__metrics')return json({generationRequests});
  const questions=catalog.questions.filter(q=>q.canvas_quiz_id===4);
  const header=['name','id','sis_id','section','section_id','section_sis_id','submitted','attempt',
    ...questions.flatMap(q=>[q.canvas_question_id+': 架空の設問',String(q.points)]),'n correct','n incorrect','score'];
  const row=['架空氏名',mode==='csv-wrong-student'?'9002':'9001','','架空組','1','','2026-09-19T00:00:00Z','1',
    ...questions.flatMap(()=>['PRIVATE RESPONSE','1']),'12','0','12'];
  const csv=mode==='csv-bad'?'bad header':(mode==='csv-empty'?[header]:[header,row]).map(r=>r.join(',')).join('\r\n');
  const report={id:81,quiz_id:4,report_type:'student_analysis',includes_all_versions:true,anonymous:false,generatable:true,
    updated_at:'2026-09-18T00:00:00Z',progress_url:'http://127.0.0.1:3129/api/v1/progress/82',
    file:{id:83,url:'http://127.0.0.1:3129/files/83/download',size:Buffer.byteLength(csv),updated_at:'2026-09-18T00:00:00Z'}};
  if(mode==='prepare-new'){report.file=null;report.progress_url=null;}
  if(mode==='prepare-queued'||mode==='prepare-failed'||mode==='prepare-incomplete')report.file=null;
  if(url.pathname==='/api/v1/courses/1/quizzes/4/reports'&&req.method==='POST') {
    generationRequests++;
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      try {
        const value=JSON.parse(body);
        if(value.quiz_report?.report_type!=='student_analysis'||value.quiz_report?.includes_all_versions!==true)return json({},400);
        if(mode==='prepare-conflict'){mode='prepare-queued';return json({},409);}
        if(mode==='prepare-unknown'){mode='csv-ready';return json({private:'PRIVATE ERROR'},503);}
        if(mode==='prepare-new'){mode='prepare-queued';report.progress_url='http://127.0.0.1:3129/api/v1/progress/82';}
        return json(report);
      }catch{return json({},400);}
    });return;
  }
  if(url.pathname==='/api/v1/courses/1/quizzes/4/reports')return json(mode==='csv-missing'?[]:[report]);
  if(url.pathname==='/api/v1/courses/1/quizzes/4/reports/81')return json(report);
  if(url.pathname==='/api/v1/progress/82')return json({workflow_state:mode==='csv-running'?'running':mode==='prepare-queued'?'queued':mode==='prepare-failed'?'failed':'completed'});
  if(url.pathname==='/files/83/download'){res.writeHead(200,{'content-type':'text/csv; charset=utf-8'});return res.end(csv);}
  if(url.pathname==='/api/v1/courses/lti_context_id:quiz-context') return json({id:1,name:'架空コース',lti_context_id:'quiz-context'});
  if(url.pathname==='/api/v1/courses/lti_context_id:other-context') return json({id:2,name:'別の架空コース',lti_context_id:'other-context'});
  if(/^\/api\/v1\/courses\/[12]\/enrollments$/.test(url.pathname)) {
    const id=Number(url.searchParams.get('user_id')), course=Number(url.pathname.split('/')[4]);
    const type=id===9000?'TeacherEnrollment':'StudentEnrollment';
    return json([9000,9001,9002,9003].includes(id)?[{user_id:id,course_id:course,type,enrollment_state:'active'}]:[]);
  }
  if(url.pathname.startsWith('/api/v1/courses/1/quizzes/4')||url.pathname==='/api/v1/courses/1/assignments/904/submissions/9001') {
    if(mode==='offline') return json({private:'Do not show raw errors'},503);
    const attempt=mode==='newer'?2:1,score=mode==='regraded'?11:12;
    const questions=catalog.questions.filter(q=>q.canvas_quiz_id===4).map(q=>({id:q.canvas_question_id,quiz_id:4,points_possible:q.points}));
    if(mode==='questions') questions[0].points_possible=2;
    if(url.pathname.endsWith('/questions')) return json(questions);
    if(url.pathname==='/api/v1/courses/1/quizzes/4') return json({id:4,assignment_id:mode==='practice'?null:904,quiz_type:mode==='practice'?'practice_quiz':'assignment',version_number:1,question_count:12,points_possible:12});
    if(url.pathname==='/api/v1/courses/1/assignments/904/submissions/9001') return json({id:8801,user_id:9001,assignment_id:904,
      workflow_state:'graded',grade_matches_current_submission:true,excused:false,submission_history:[{id:9901,user_id:9001,assignment_id:904,attempt,
        workflow_state:'complete',score,submission_data:questions.map((q,i)=>({question_id:q.id,points:mode==='regraded'&&i===0?0:1,correct:'true',text:'PRIVATE RESPONSE'}))}]});
    if(url.pathname==='/api/v1/courses/1/quizzes/4/submissions/9901') return json({quiz_submissions:[{id:9901,quiz_id:4,user_id:9001,submission_id:8801,
      attempt,score,fudge_points:0,workflow_state:mode==='pending'?'pending_review':'complete',finished_at:'2026-09-19T00:00:00Z'}]});
  }
  return json({},404);
}).listen(3129,'127.0.0.1');

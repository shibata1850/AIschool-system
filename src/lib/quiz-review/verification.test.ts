import {it,expect} from "vitest";
import catalog from "./catalog.json";
import {parseReview} from "./policy";
import {reviewFixture} from "./fixtures";
import {compareQuizEvidence,evidenceSignature} from "./verification";
function setup() {
  const record=parseReview(reviewFixture(),{instance:"test-canvas",origin:"https://canvas.example.test",canvasCourseId:1})[0];
  const questions=catalog.questions.filter(q=>q.canvas_quiz_id===4).map(q=>({id:q.canvas_question_id,quiz_id:4,points_possible:q.points}));
  const h={id:9901,assignment_id:904,user_id:9001,attempt:1,workflow_state:"complete",score:12,
    submission_data:questions.map(q=>({question_id:q.id,points:1 as number|null,correct:"true",text:"PRIVATE RESPONSE"}))};
  const e={quiz:{id:4,assignment_id:904,quiz_type:"assignment",question_count:12,points_possible:12,version_number:1},
    submission:{id:8801,assignment_id:904,user_id:9001,workflow_state:"graded",excused:false,grade_matches_current_submission:true,submission_history:[h]},
    current:{id:9901,quiz_id:4,user_id:9001,submission_id:8801,attempt:1,workflow_state:"complete",finished_at:"2026-09-19T00:00:00Z",score:12,fudge_points:0,kept_score:12},
    questions,attemptQuestions:structuredClone(questions)};
  return {record,e,h};
}
it("requires manual review for practice/survey formats without asserting score equality",()=>{
  const {record,e}=setup();
  for(const quiz_type of ['practice_quiz','survey','graded_survey']) {
    const actual={...e,quiz:{...e.quiz,quiz_type,assignment_id:null},submission:null,current:null};
    expect(compareQuizEvidence(record,1,actual)).toBe('manual_review_required');
    actual.quiz.id=5;expect(compareQuizEvidence(record,1,actual)).toBe('unavailable');
  }
});
it("matches scores by question ID, independent of order and gradebook kept score",()=>{
  const {record,e}=setup();e.current.kept_score=10;e.questions.reverse();e.submission.submission_history[0].submission_data.reverse();
  expect(compareQuizEvidence(record,1,e)).toBe("matched");
});
it("rejects equal totals whose question scores differ",()=>{
  const {record,e,h}=setup();record.scores['STEP01/F01']=0;record.reported=11;record.earned=11;
  h.submission_data[1].points=0;h.score=11;e.current.score=11;
  expect(compareQuizEvidence(record,1,e)).toBe("different");
});
it("detects regrading and extra points without redistributing them",()=>{
  const {record,e,h}=setup();h.submission_data[0].points=0;h.score=11;e.current.score=11;
  expect(compareQuizEvidence(record,1,e)).toBe("different");
  e.current.fudge_points=1;e.current.score=12;h.score=12;
  expect(compareQuizEvidence(record,1,e)).toBe("different");
});
it("zero is graded; missing points or undefined correctness is not",()=>{
  const {record,e,h}=setup();Object.keys(record.scores).forEach(k=>record.scores[k]=0);record.earned=0;record.reported=0;
  h.submission_data.forEach(a=>a.points=0);h.score=0;e.current.score=0;
  expect(compareQuizEvidence(record,1,e)).toBe("matched");
  h.submission_data[0].correct="undefined";expect(compareQuizEvidence(record,1,e)).toBe("incomplete");
  h.submission_data[0].correct="true";h.submission_data[0].points=null;expect(compareQuizEvidence(record,1,e)).toBe("incomplete");
});
it("does not approve earlier attempts or in-progress/pending grades",()=>{
  const {record,e}=setup();e.current.attempt=2;expect(compareQuizEvidence(record,1,e)).toBe("older_attempt");
  e.current.attempt=1;
  for(const state of ["untaken","pending_review","preview"]){e.current.workflow_state=state;expect(compareQuizEvidence(record,1,e)).toBe("incomplete");}
});
it("rejects wrong identities, quiz, assignment and ambiguous history",()=>{
  const {record,e}=setup();
  for(const mutate of [(x:typeof e)=>{x.current.user_id=9002;},(x:typeof e)=>{x.current.quiz_id=5;},
    (x:typeof e)=>{x.submission.assignment_id=905;},(x:typeof e)=>{x.current.submission_id=8802;},
    (x:typeof e)=>{x.submission.submission_history.push(x.submission.submission_history[0]);}]) {
    const changed=structuredClone(e);mutate(changed);expect(compareQuizEvidence(record,1,changed)).toBe("unavailable");
  }
});
it("rejects missing, duplicate, changed question IDs and points",()=>{
  const {record,e}=setup();
  for(const key of ["questions","attemptQuestions"] as const) {
    for(const mode of ["missing","duplicate","id","points"]) {
      const changed=structuredClone(e),rows=changed[key];
      if(mode==="missing") rows.pop();if(mode==="duplicate")rows[1]=rows[0];if(mode==="id")rows[0].id=9999;if(mode==="points")rows[0].points_possible=2;
      expect(compareQuizEvidence(record,1,changed)).toBe("structure_changed");
    }
  }
});
it("rejects malformed scores, duplicate answers, absent detail and excused submissions",()=>{
  const {record,e}=setup();
  for(const value of [NaN,Infinity,-1,2,0.1234567]) {
    const changed=structuredClone(e);changed.submission.submission_history[0].submission_data[0].points=value;
    expect(compareQuizEvidence(record,1,changed)).toBe("unavailable");
  }
  e.submission.submission_history[0].submission_data[1]=e.submission.submission_history[0].submission_data[0];
  expect(compareQuizEvidence(record,1,e)).toBe("unavailable");
  e.submission.excused=true;expect(compareQuizEvidence(record,1,e)).toBe("incomplete");
});
it("stability signature detects score changes and excludes response text",()=>{
  const {e,h}=setup(),before=evidenceSignature(e);
  expect(before).not.toContain("PRIVATE");h.submission_data[0].text="other";expect(evidenceSignature(e)).toBe(before);
  h.submission_data[0].points=0;expect(evidenceSignature(e)).not.toBe(before);
});

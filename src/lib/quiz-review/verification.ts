import catalog from "./catalog.json";
import { canonical, type ReviewRecord } from "./policy";

export type VerificationStatus = "matched" | "different" | "older_attempt" | "incomplete" | "structure_changed" | "manual_review_required" | "unavailable";
export type VerificationResult = {status:VerificationStatus; checkedAt:string; message:string};
export type QuizEvidence = {quiz:unknown; submission:unknown; current:unknown; questions:unknown; attemptQuestions:unknown};
const messages:Record<VerificationStatus,string> = {
  matched:"照合時点で、最新の受験回・設問番号・配点・設問別得点がCanvasと一致しました。",
  different:"Canvasの採点結果と異なります。新しい分析CSVを取得して確認してください。",
  older_attempt:"Canvasに新しい受験回があります。この結果は最新の受験回ではありません。",
  incomplete:"受験中・未採点・免除などのため、採点済み結果として照合できません。",
  structure_changed:"設問構成または配点が登録済み教材と異なります。教材との対応を確認してください。",
  manual_review_required:"この小テスト形式は現在、自動照合に対応していません。Canvasの答案画面で確認してください。",
  unavailable:"必要なCanvas情報を確認できませんでした。時間をおいて再度照合してください。",
};
export function verificationResult(status:VerificationStatus):VerificationResult {
  return {status,checkedAt:new Date().toISOString(),message:messages[status]};
}
type Obj=Record<string,unknown>;
export const isObject=(v:unknown):v is Obj => !!v && typeof v==="object" && !Array.isArray(v);
export const positiveId=(v:unknown):v is number => Number.isSafeInteger(v) && (v as number)>0;
export const requiresManualReviewQuizType=(v:unknown):boolean => typeof v==="string" && ["practice_quiz","survey","graded_survey"].includes(v);
const score=(v:unknown,max:number):v is number => typeof v==="number" && Number.isFinite(v) && v>=0 && v<=max &&
  Math.abs(v*1e6-Math.round(v*1e6))<1e-7;
const sameScore=(a:number,b:number)=>Math.round(a*1e6)===Math.round(b*1e6);

/** Reject uncertainty; never infer a skill score from a gradebook total or grade label. */
export function compareQuizEvidence(record:ReviewRecord,courseId:number,e:QuizEvidence):VerificationStatus {
  const expected=catalog.questions.filter(q=>q.canvas_course_id===courseId && q.canvas_quiz_id===record.quizId);
  if (!expected.length || !isObject(e.quiz) || e.quiz.id!==record.quizId) return "unavailable";
  if(requiresManualReviewQuizType(e.quiz.quiz_type)) return "manual_review_required";
  if(!isObject(e.submission) || !isObject(e.current)) return "unavailable";
  const q=e.quiz, s=e.submission, c=e.current;
  if(q.id!==record.quizId || !positiveId(q.assignment_id) || s.assignment_id!==q.assignment_id ||
      s.user_id!==record.canvasUserId || c.quiz_id!==record.quizId || c.user_id!==record.canvasUserId ||
      !positiveId(c.id) || c.submission_id!==s.id || !positiveId(c.attempt)) return "unavailable";
  if(c.attempt>record.attempt) return "older_attempt";
  if(c.attempt!==record.attempt) return "unavailable";
  if(q.quiz_type!=="assignment" || q.anonymous_submissions===true) return "unavailable";
  if(s.excused===true || s.workflow_state!=="graded" || s.grade_matches_current_submission!==true ||
      c.workflow_state!=="complete" || !c.finished_at || record.earned===null) return "incomplete";
  if(!Array.isArray(s.submission_history)) return "unavailable";
  const history=s.submission_history.filter(h=>isObject(h) && h.attempt===record.attempt);
  // No guess based on array order or a timestamp when Canvas returns ambiguous versions.
  if(history.length!==1 || !isObject(history[0])) return "unavailable";
  const h=history[0];
  if(h.id!==c.id || h.assignment_id!==q.assignment_id || h.user_id!==record.canvasUserId || h.workflow_state!=="complete") return "unavailable";
  const possible=expected.reduce((n,x)=>n+x.points,0);
  if(q.points_possible!==possible || q.question_count!==expected.length) return "structure_changed";
  for(const list of [e.questions,e.attemptQuestions]) {
    if(!Array.isArray(list)) return "unavailable";
    if(list.length!==expected.length || new Set(list.map(x=>isObject(x)?x.id:null)).size!==expected.length) return "structure_changed";
    for(const item of expected) {
      const live=list.find(x=>isObject(x) && x.id===item.canvas_question_id);
      if(!isObject(live) || live.quiz_id!==record.quizId || live.points_possible!==item.points) return "structure_changed";
    }
  }
  if(!Array.isArray(h.submission_data) || h.submission_data.length!==expected.length ||
      new Set(h.submission_data.map(x=>isObject(x)?x.question_id:null)).size!==expected.length) return "unavailable";
  let total=0, differs=false;
  for(const item of expected) {
    const answer=h.submission_data.find(x=>isObject(x) && x.question_id===item.canvas_question_id);
    if(!isObject(answer)) return "unavailable";
    if(answer.correct==="undefined" || answer.points===null) return "incomplete";
    if(!score(answer.points,item.points)) return "unavailable";
    total+=Math.round(answer.points*1e6);
    const saved=record.scores[item.question_key];
    if(typeof saved!=="number" || !sameScore(saved,answer.points)) differs=true;
  }
  if(!score(h.score,possible) || !score(c.score,possible)) return "incomplete";
  // Fudge/extra points cannot be distributed among skills without a separate agreed rule.
  if((c.fudge_points!==null && c.fudge_points!==0) || !sameScore(h.score,c.score) || total!==Math.round(c.score*1e6)) return "different";
  return differs || !sameScore(record.reported,c.score) ? "different" : "matched";
}

/** Minimal in-memory stability signature; answer text, names and comments are not retained. */
export function evidenceSignature(e:QuizEvidence):string {
  const s=isObject(e.submission)?e.submission:{};
  const c=isObject(e.current)?e.current:{};
  const q=isObject(e.quiz)?e.quiz:{};
  return canonical({quiz:[q.id,q.assignment_id,q.version_number,q.quiz_type,q.points_possible,q.question_count],
    submission:[s.id,s.user_id,s.assignment_id,s.workflow_state,s.excused,s.grade_matches_current_submission],
    current:[c.id,c.quiz_id,c.user_id,c.submission_id,c.attempt,c.workflow_state,c.score,c.fudge_points,c.finished_at],
    history:Array.isArray(s.submission_history)?s.submission_history.map(h=>!isObject(h)?null:{
      id:h.id,user:h.user_id,assignment:h.assignment_id,attempt:h.attempt,state:h.workflow_state,score:h.score,
      scores:Array.isArray(h.submission_data)?h.submission_data.map(a=>!isObject(a)?null:[a.question_id,a.points,a.correct]):null,
    }):null});
}

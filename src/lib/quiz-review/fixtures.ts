/** Entirely fictional, used by local tests only. */
import catalog from "./catalog.json";
import {hash} from "./policy";
export function reviewFixture(quizId=4, userId=9001, attempt=1) {
  const questions = catalog.questions.filter(q=>q.canvas_quiz_id===quizId).sort((a,b)=>a.question_key.localeCompare(b.question_key));
  return {schema:"ngas.canvas-csv-review.v1",source_instance:"test-canvas",source_origin:"https://canvas.example.test",
    course_id:1,quiz_id:quizId,record_count:1, records:[{
      identity:{source_instance:"test-canvas",canvas_course_id:1,canvas_quiz_id:quizId,canvas_user_id:userId,attempt,
        step:questions[0].step,stage:questions[0].stage}, catalog_fingerprint:hash(questions),
      scores:Object.fromEntries(questions.map(q=>[q.question_key,1 as number|null])), total:{reported:questions.length},
    }]};
}

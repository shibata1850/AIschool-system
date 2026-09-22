import type {LessonRecord} from '../f4/achievement';
import {isReportWeek} from '../f4/reportWeek';

/** Input must come from the durable, authorized grade repository, never request JSON or temporary copies. */
export interface FormalQuizGrade {
  courseId:string; studentId:string; sourceInstance:string; quizId:number; canvasAssignmentId:number;
  canvasUserId?:number; stage:string; attempt:number; targetWeek:string|null; state:'adopted'|'withdrawn';
  earned:number|null; possible:number;
}
export type QuizExclusion='week_missing'|'ungraded'|'withdrawn';
export interface QuizAchievementInput {
  courseId:string; studentId:string; sourceInstance:string;
  /** Canvas assignments already represented by the local assignment score path. */
  linkedAssignmentIds:readonly number[];
}
function positive(value:number){return Number.isSafeInteger(value)&&value>0;}

/** F-only input; do not guess teaching dates, silently choose an attempt, or count a second grade path. */
export function quizAchievementRecords(rows:readonly FormalQuizGrade[],scope:QuizAchievementInput){
  if(!scope.courseId.trim()||!scope.studentId.trim()||!scope.sourceInstance.trim())throw new Error('集計対象を確認してください');
  const records:LessonRecord[]=[],excluded:Array<{quizId:number;reason:QuizExclusion}>=[];
  const seen=new Set<number>();
  for(const row of rows){
    if(row.courseId!==scope.courseId||row.studentId!==scope.studentId||row.sourceInstance!==scope.sourceInstance)
      throw new Error('受講者・コース・保存元の対応を確認してください');
    if(row.stage!=='F'||!positive(row.quizId)||!positive(row.attempt)||!positive(row.canvasAssignmentId)||
      !['adopted','withdrawn'].includes(row.state))throw new Error('最終小テストの採用記録を確認してください');
    if(seen.has(row.quizId))throw new Error('同じ小テストの採用結果が複数あります');
    seen.add(row.quizId);
    if(row.state==='withdrawn'){excluded.push({quizId:row.quizId,reason:'withdrawn'});continue;}
    if(scope.linkedAssignmentIds.includes(row.canvasAssignmentId))throw new Error('同じCanvas課題が重複しています');
    if(!Number.isFinite(row.possible)||row.possible<=0||
      (row.earned!==null&&(!Number.isFinite(row.earned)||row.earned<0||row.earned>row.possible)))
      throw new Error('得点と配点を確認してください');
    if(row.targetWeek===null){excluded.push({quizId:row.quizId,reason:'week_missing'});continue;}
    if(!isReportWeek(row.targetWeek))throw new Error('対象授業週を確認してください');
    if(row.earned===null){excluded.push({quizId:row.quizId,reason:'ungraded'});continue;}
    records.push({lessonId:JSON.stringify(['quiz',row.sourceInstance,row.quizId]),weekStart:row.targetWeek,
      source:'quiz',attended:false,submitted:false,score:row.earned/row.possible*100});
  }
  return {records,excluded};
}

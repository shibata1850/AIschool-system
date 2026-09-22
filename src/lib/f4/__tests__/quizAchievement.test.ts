import {describe,expect,it} from 'vitest';
import {computeWeeklyAchievements,type LessonRecord} from '../achievement';

const base:LessonRecord={lessonId:'fictional',weekStart:'2026-09-21',attended:true,submitted:true,score:80};
const quiz:LessonRecord={...base,lessonId:'quiz:4',source:'quiz',attended:false,submitted:false,score:50};
describe('final quizzes share the score component only',()=>{
  it('averages an 80 point assignment and 50 point quiz to a 79 total',()=>{
    expect(computeWeeklyAchievements([base,quiz])[0]).toMatchObject({averageScore:65,attendanceRate:100,submissionRate:100,total:79});
  });
  it('does not inflate submission or attendance when the quiz is submitted',()=>{
    expect(computeWeeklyAchievements([{...base,attended:false,submitted:false,score:null},{...quiz,submitted:true,attended:true}])[0])
      .toMatchObject({attendanceRate:0,submissionRate:0,averageScore:50,total:30});
  });
  it('preserves a confirmed zero but excludes an ungraded quiz',()=>{
    expect(computeWeeklyAchievements([base,{...quiz,score:0}])[0].total).toBe(64);
    expect(computeWeeklyAchievements([base,{...quiz,score:null}])[0].total).toBe(88);
  });
  it('redistributes missing components for quiz-only weeks',()=>{
    expect(computeWeeklyAchievements([quiz])[0]).toMatchObject({attendanceRate:null,submissionRate:null,averageScore:50,total:50});
  });
  it('keeps assigned weeks separate and excludes system-missing quiz scores',()=>{
    expect(computeWeeklyAchievements([base,{...quiz,dataMissing:true}])[0].total).toBe(88);
    expect(computeWeeklyAchievements([base,{...quiz,weekStart:'2026-09-28'}]).map(r=>r.total)).toEqual([88,50]);
  });
});

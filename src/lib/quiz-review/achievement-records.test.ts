import {describe,expect,it} from 'vitest';
import {quizAchievementRecords,type FormalQuizGrade} from './achievement-records';
const scope={courseId:'fictional-course',studentId:'fictional-student',sourceInstance:'fictional-source',linkedAssignmentIds:[] as number[]};
const row:FormalQuizGrade={...scope,quizId:4,canvasAssignmentId:50,stage:'F',attempt:1,targetWeek:'2026-09-21',state:'adopted',earned:6,possible:12};
describe('durable final quiz to achievement input',()=>{
  it('normalizes 6/12 and retains the explicitly assigned week',()=>{
    expect(quizAchievementRecords([row],scope).records[0]).toMatchObject({source:'quiz',score:50,weekStart:'2026-09-21',submitted:false,attended:false});
  });
  it('retains zero without intermediate rounding',()=>{
    expect(quizAchievementRecords([{...row,earned:0}],scope).records[0].score).toBe(0);
    expect(quizAchievementRecords([{...row,earned:1}],scope).records[0].score).toBeCloseTo(100/12);
  });
  it.each(['courseId','studentId','sourceInstance'] as const)('rejects mismatched %s',key=>{
    expect(()=>quizAchievementRecords([{...row,[key]:'other'}],scope)).toThrow();
  });
  it('does not choose the first, latest or highest attempt from duplicates',()=>{
    expect(()=>quizAchievementRecords([row,{...row,attempt:2,earned:12}],scope)).toThrow('複数');
  });
  it('accepts a replacement as one score when repository supplies one current result',()=>{
    expect(quizAchievementRecords([{...row,attempt:2,earned:12}],scope).records).toHaveLength(1);
  });
  it('rejects the same Canvas assignment arriving by another path',()=>{
    expect(()=>quizAchievementRecords([row],{...scope,linkedAssignmentIds:[50]})).toThrow('重複');
  });
  it.each(['D','A','B','R'])('rejects non-final stage %s',stage=>expect(()=>quizAchievementRecords([{...row,stage}],scope)).toThrow());
  it.each([0,-1,NaN,Infinity])('rejects invalid maximum %s',possible=>expect(()=>quizAchievementRecords([{...row,possible}],scope)).toThrow());
  it.each([-1,13,NaN,Infinity])('rejects invalid earned score %s',earned=>expect(()=>quizAchievementRecords([{...row,earned}],scope)).toThrow());
  it('makes missing week, ungraded and withdrawn exclusions explicit',()=>{
    expect(quizAchievementRecords([{...row,targetWeek:null}],scope)).toMatchObject({records:[],excluded:[{reason:'week_missing'}]});
    expect(quizAchievementRecords([{...row,earned:null}],scope)).toMatchObject({records:[],excluded:[{reason:'ungraded'}]});
    expect(quizAchievementRecords([{...row,state:'withdrawn'}],scope)).toMatchObject({records:[],excluded:[{reason:'withdrawn'}]});
  });
  it.each(['2026-09-22','2026-02-30',''])('rejects malformed teaching week %s',targetWeek=>expect(()=>quizAchievementRecords([{...row,targetWeek}],scope)).toThrow());
});

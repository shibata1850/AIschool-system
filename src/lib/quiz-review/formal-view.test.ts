import {beforeEach,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
const mocks=vi.hoisted(()=>({actor:vi.fn(),own:vi.fn()}));
vi.mock('@/lib/auth',()=>({getCurrentUser:mocks.actor}));
vi.mock('./formal-grades',()=>({ownFormalGrades:mocks.own}));
import Page from '../../../app/achievement/quiz-grades/page';
import {QuizReviewError} from './policy';
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue({role:'student',userId:'fictional-self'});});
it('shows normalized score, original score, teaching week and selected attempt',async()=>{
  mocks.own.mockResolvedValue([{token:'fictional',snapshot:{quizId:4,attempt:2,earned:6,possible:12,targetWeek:'2026-09-21',state:'adopted'},confirmedAt:new Date('2026-09-22T00:00:00Z')}]);
  const html=renderToStaticMarkup(await Page());for(const text of ['6/12','50','2026-09-21','受験2回目','総合到達度に採用中'])expect(html).toContain(text);
  expect(mocks.own).toHaveBeenCalledWith({role:'student',userId:'fictional-self'});
});
it('makes withdrawn results explicitly excluded rather than displaying an active score',async()=>{
  mocks.own.mockResolvedValue([{token:'fictional',snapshot:{quizId:4,attempt:1,earned:0,possible:12,targetWeek:'2026-09-21',state:'withdrawn'},confirmedAt:new Date()}]);
  const html=renderToStaticMarkup(await Page());expect(html).toContain('取り下げ済み・集計対象外');expect(html).not.toContain('総合到達度に採用中');
});
it('shows the authorization error and hides internal exception details',async()=>{
  mocks.own.mockRejectedValueOnce(new QuizReviewError('本人の対応を確認できません',403));expect(renderToStaticMarkup(await Page())).toContain('本人の対応を確認できません');
  mocks.own.mockRejectedValueOnce(Error('private-detail'));expect(renderToStaticMarkup(await Page())).not.toContain('private-detail');
});

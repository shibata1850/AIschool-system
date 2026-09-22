import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({actor:vi.fn(),decide:vi.fn(),list:vi.fn(),config:vi.fn()}));
vi.mock('@/lib/auth',()=>({getCurrentUser:mocks.actor}));
vi.mock('@/lib/lti/config',()=>({getLtiConfig:mocks.config}));
vi.mock('./formal-grades',()=>({decideFormalGrade:mocks.decide,listFormalGrades:mocks.list}));
import {GET,POST} from '../../../app/api/teacher/quiz-grades/route';
import {QuizReviewError} from './policy';
const teacher={role:'teacher',viaLti:true,courseId:'fictional-course',canvasUserId:9,userId:'fictional-teacher'};
const request=(body:string,origin='https://app.example.test',type='application/json')=>new Request('https://app.example.test/api/teacher/quiz-grades',{
  method:'POST',headers:{origin,'content-type':type},body});
beforeEach(()=>{vi.clearAllMocks();mocks.actor.mockResolvedValue(teacher);mocks.config.mockReturnValue({toolUrl:'https://app.example.test'});
  mocks.decide.mockResolvedValue({token:'fictional-token'});mocks.list.mockResolvedValue([]);});
describe('formal quiz grade HTTP boundary',()=>{
  it('passes valid JSON to the authorized service without caching',async()=>{
    const r=await POST(request('{"action":"adopt"}'));expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('no-store');expect(mocks.decide).toHaveBeenCalledWith(teacher,{action:'adopt'});
  });
  it.each(['student','guest'])('rejects %s before grade writes',async role=>{
    mocks.actor.mockResolvedValue({...teacher,role});expect((await POST(request('{}'))).status).toBe(403);expect(mocks.decide).not.toHaveBeenCalled();
  });
  it('rejects a missing LTI context',async()=>{
    mocks.actor.mockResolvedValue({...teacher,viaLti:false});expect((await POST(request('{}'))).status).toBe(403);
  });
  it('rejects cross-origin requests',async()=>{
    expect((await POST(request('{}','https://other.example.test'))).status).toBe(403);expect(mocks.decide).not.toHaveBeenCalled();
  });
  it('rejects unsupported media, malformed and oversized JSON',async()=>{
    expect((await POST(request('{}','https://app.example.test','text/plain'))).status).toBe(415);
    expect((await POST(request('{'))).status).toBe(400);
    expect((await POST(request(JSON.stringify({text:'x'.repeat(2048)})))).status).toBe(413);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
  it('preserves conflict status but does not expose internal errors',async()=>{
    mocks.decide.mockRejectedValueOnce(new QuizReviewError('別の採用操作があります',409));expect((await POST(request('{}'))).status).toBe(409);
    mocks.decide.mockRejectedValueOnce(Error('private-internal-detail'));const r=await POST(request('{}'));expect(r.status).toBe(503);expect(await r.text()).not.toContain('private-internal-detail');
  });
  it('reads through the service and returns private no-store responses',async()=>{
    const r=await GET();expect(r.status).toBe(200);expect(mocks.list).toHaveBeenCalledWith(teacher);expect(r.headers.get('cache-control')).toContain('no-store');
  });
});

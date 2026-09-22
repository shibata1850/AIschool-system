import {it,expect} from "vitest";
import {CanvasClient} from "../canvas/client";
function reader(change?:(path:string,value:unknown,count:number)=>Response|undefined) {
  const calls:{url:string;init?:RequestInit}[]=[];
  const counts=new Map<string,number>();
  const client=new CanvasClient({baseUrl:"https://canvas.example.test",apiToken:"fictional",retryBaseDelayMs:0,
    fetchFn:async(input,init)=>{
      const url=String(input);calls.push({url,init});const path=new URL(url).pathname;
      const count=(counts.get(path)??0)+1;counts.set(path,count);
      let value:unknown;
      if(path.endsWith('/quizzes/4')) value={id:4,assignment_id:904,version_number:1};
      else if(path.endsWith('/submissions/9001')) value={id:8801,user_id:9001,assignment_id:904,submission_history:[{
        id:9901,attempt:1,user_id:9001,assignment_id:904,score:1,submission_data:[{question_id:1,points:1,correct:true}]}]};
      else if(path.endsWith('/submissions/9901')) value={quiz_submissions:[{id:9901,quiz_id:4,user_id:9001,attempt:1,score:1}]};
      else if(path.endsWith('/questions')) value=[{id:1,quiz_id:4,points_possible:1}];
      else throw new Error('Unexpected request');
      return change?.(path,value,count)??new Response(JSON.stringify(value));
    }});
  return {client,calls};
}
it("uses only GET reads, disables caches and redirects, and requests one target user's history",async()=>{
  const {client,calls}=reader();const result=await client.readQuizReviewEvidence(1,4,9001);
  expect(result.questions).toHaveLength(1);expect(calls).toHaveLength(8);
  expect(calls.every(c=>c.init?.cache==='no-store'&&c.init?.redirect==='error'&&c.init.signal instanceof AbortSignal)).toBe(true);
  expect(calls.every(c=>!c.init?.method||c.init.method==='GET')).toBe(true);
  expect(calls.filter(c=>c.url.includes('/assignments/')).every(c=>c.url.includes('/submissions/9001?include[]=submission_history'))).toBe(true);
});
it("detects practice quizzes before looking for an absent assignment history",async()=>{
  for(const quiz_type of ['practice_quiz','survey','graded_survey']) {
    const {client,calls}=reader(path=>path.endsWith('/quizzes/4')?new Response(JSON.stringify({id:4,quiz_type,assignment_id:null})):undefined);
    expect(await client.readQuizReviewEvidence(1,4,9001)).toMatchObject({quiz:{quiz_type},submission:null,current:null});
    expect(calls).toHaveLength(1);
  }
});
it("follows question pagination on the same endpoint",async()=>{
  let pages=0;
  const {client}=reader((path,value)=>{
    if(!path.endsWith('/questions'))return;
    pages++;return new Response(JSON.stringify(value),{headers:pages===1?{link:'<https://canvas.example.test/api/v1/courses/1/quizzes/4/questions?page=2>; rel="next"'}:{}});
  });
  expect((await client.readQuizReviewEvidence(1,4,9001)).questions).toHaveLength(2);
});
it("rejects foreign paging targets without sending the bearer token",async()=>{
  for(const target of ['https://canvas.example.test.evil.test/api/v1/courses/1/quizzes/4/questions',
    'https://evil.test/','https://canvas.example.test/api/v1/users','https://name:secret@canvas.example.test/api/v1/courses/1/quizzes/4/questions']) {
    const {client,calls}=reader(path=>path.endsWith('/questions')?new Response('[]',{headers:{link:`<${target}>; rel="next"`}}):undefined);
    await expect(client.readQuizReviewEvidence(1,4,9001)).rejects.toThrow();
    expect(calls.some(c=>c.url===target)).toBe(false);
  }
});
it("rejects looping and excessive pagination",async()=>{
  for(const loop of [true,false]) {
    const {client,calls}=reader((path,_,count)=>path.endsWith('/questions')?new Response('[]',{
      headers:{link:`<https://canvas.example.test/api/v1/courses/1/quizzes/4/questions?page=${loop?2:count+1}>; rel="next"`}}):undefined);
    await expect(client.readQuizReviewEvidence(1,4,9001)).rejects.toThrow();expect(calls.length).toBeLessThanOrEqual(13);
  }
});
it("rejects mid-read regrading",async()=>{
  const {client}=reader((path,value,count)=>{
    if(path.endsWith('/submissions/9001')&&count===2) {
      const row=value as {submission_history:Array<{score:number}>};row.submission_history[0].score=0;
      return new Response(JSON.stringify(row));
    }
  });
  await expect(client.readQuizReviewEvidence(1,4,9001)).rejects.toThrow();
});
it("rejects missing or ambiguous histories and wrong target user",async()=>{
  for(const mode of ['missing','ambiguous','user']) {
    const {client}=reader((path,value)=>{
      if(!path.endsWith('/submissions/9001'))return;
      const row=value as {user_id:number;submission_history:unknown[]};
      if(mode==='missing')row.submission_history=[];if(mode==='ambiguous')row.submission_history.push(row.submission_history[0]);if(mode==='user')row.user_id=9002;
      return new Response(JSON.stringify(row));
    });
    await expect(client.readQuizReviewEvidence(1,4,9001)).rejects.toThrow();
  }
});
it("does not read Canvas for invalid numeric IDs",async()=>{
  const {client,calls}=reader();await expect(client.readQuizReviewEvidence(0,4,9001)).rejects.toThrow();expect(calls).toHaveLength(0);
});
it("does not return raw API errors or treat HTTP failures as evidence",async()=>{
  const {client}=reader(()=>new Response('PRIVATE',{status:403}));
  await expect(client.readQuizReviewEvidence(1,4,9001)).rejects.not.toThrow('PRIVATE');
});

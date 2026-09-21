import {it,expect} from "vitest";
import {CanvasClient} from "@/lib/canvas/client";
it("requires exact course, user, role and active enrollment",async()=>{
  const good={course_id:1,user_id:9001,type:"StudentEnrollment",enrollment_state:"active"};
  for(const row of [good,{...good,course_id:2},{...good,user_id:9002},{...good,type:"TeacherEnrollment"},
    {...good,enrollment_state:"inactive"},{...good,enrollment_state:"completed"}]) {
    const client=new CanvasClient({baseUrl:"https://canvas.example.test",apiToken:"fictional",
      fetchFn:async()=>new Response(JSON.stringify([row]))});
    expect(await client.hasActiveEnrollment(1,9001,"student")).toBe(row===good);
  }
});
it("does not treat malformed enrollment lists or network errors as success",async()=>{
  const client=new CanvasClient({baseUrl:"https://canvas.example.test",apiToken:"fictional",
    fetchFn:async()=>new Response(JSON.stringify({enrolled:true}))});
  expect(await client.hasActiveEnrollment(1,9001,"teacher")).toBe(false);
  expect(await client.hasActiveEnrollment(0,9001,"teacher")).toBe(false);
  const unavailable=new CanvasClient({baseUrl:"https://canvas.example.test",apiToken:"fictional",
    fetchFn:async()=>{throw new Error("offline");}});
  await expect(unavailable.hasActiveEnrollment(1,9001,"student")).rejects.toThrow();
});

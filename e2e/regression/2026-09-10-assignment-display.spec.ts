import {test,expect} from "@playwright/test";
import {resetStore,setRole} from "../helpers";

test.beforeEach(async({request})=>{await resetStore(request);});
test("teacher menu links to course-scoped allocation",async({page})=>{
  await setRole(page,"teacher");await page.goto("/");
  await page.getByRole("link",{name:"課題の割当",exact:false}).click();
  await expect(page.getByText("Canvasのコースから講師として起動してください。",{exact:true})).toBeVisible();
});
test("student cannot allocate",async({request})=>{
  const res=await request.post("/api/teacher/assignments",{headers:{cookie:"role=student"},data:{assignmentId:"a1",studentIds:["student-demo"]}});
  expect(res.status()).toBe(403);
});

import {test,expect} from "@playwright/test";
import {resetStore,setRole} from "../helpers";

test.beforeEach(async({request})=>{await resetStore(request);});
test("teacher menu links to course-scoped allocation",async({page})=>{
  await setRole(page,"teacher");await page.goto("/");
  await page.getByRole("link",{name:"課題の割当",exact:false}).click();
  await expect(page.getByText("Canvasのコースから講師として起動してください。",{exact:true})).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath("allocation-entry.png"),fullPage:true});
});
test("student cannot allocate",async({request})=>{
  const res=await request.post("/api/teacher/assignments",{headers:{cookie:"role=student"},data:{assignmentId:"a1",studentIds:["student-demo"]}});
  expect(res.status()).toBe(403);
});

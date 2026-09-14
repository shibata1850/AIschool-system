import {describe,it,expect,vi,beforeEach} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
const mocks=vi.hoisted(()=>({active:vi.fn(),has:vi.fn(),pending:vi.fn(),failures:vi.fn(),actor:vi.fn()}));
vi.mock("@/lib/auth",()=>({getCurrentUser:mocks.actor}));
vi.mock("@/lib/f2/chatLog",()=>({listTeacherMessages:async()=>[]}));
vi.mock("@/lib/f3/store",()=>({listActiveSubmissionsForStudent:mocks.active,hasAssignmentsForStudent:mocks.has,listStaffReviewSubmissions:async()=>({pending:await mocks.pending(),syncFailures:await mocks.failures()})}));
vi.mock("@/lib/roster",()=>({getRoster:async()=>[{id:"s",displayName:"テスト受講生"}]}));
vi.mock("../../../../app/teacher/review/review-form",()=>({ReviewForm:()=>null}));
import Home from "../../../../app/page";
import ReviewPage from "../../../../app/teacher/review/page";
describe("assignment views",()=>{
  beforeEach(()=>{mocks.actor.mockResolvedValue({role:"student",userId:"s",viaLti:true,courseId:"course-a"});mocks.active.mockResolvedValue([]);mocks.pending.mockResolvedValue([]);mocks.failures.mockResolvedValue([]);});
  it("does not claim completion before any allocation",async()=>{
    mocks.has.mockResolvedValue(false);
    const html=renderToStaticMarkup(await Home());
    expect(html).toContain("まだ課題が割り当てられていません。");expect(html).not.toContain("すべて完了しています。");
  });
  it("shows completion when allocated work is completed",async()=>{
    mocks.has.mockResolvedValue(true);
    expect(renderToStaticMarkup(await Home())).toContain("すべて完了しています。");
  });
  it.each(["pending","failures"] as const)("resolves names in %s",async key=>{
    mocks.actor.mockResolvedValue({role:"teacher",userId:"t",viaLti:true,courseId:"course-a"});
    mocks[key].mockResolvedValue([{submission:{id:"sub",studentId:"s",assignmentId:"a",version:1,promptText:"Fictional",teacherScore:80,canvasSyncError:"Unavailable"},assignment:{title:"課題"}}]);
    expect(renderToStaticMarkup(await ReviewPage())).toContain("テスト受講生");
  });
});

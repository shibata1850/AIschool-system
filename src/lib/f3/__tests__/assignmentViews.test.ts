import {describe,it,expect,vi,beforeEach} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
const mocks=vi.hoisted(()=>({active:vi.fn(),has:vi.fn(),pending:vi.fn(),failures:vi.fn()}));
vi.mock("@/lib/auth",()=>({getCurrentUser:async()=>({role:"student",userId:"s"})}));
vi.mock("@/lib/f2/chatLog",()=>({listTeacherMessages:async()=>[]}));
vi.mock("@/lib/f3/store",()=>({listActiveSubmissionsForStudent:mocks.active,hasAssignmentsForStudent:mocks.has,listSubmissionsPendingReview:mocks.pending,listCanvasSyncFailures:mocks.failures}));
vi.mock("@/lib/roster",()=>({getRoster:async()=>[{id:"s",displayName:"テスト受講生"}]}));
vi.mock("../../../../app/teacher/review/review-form",()=>({ReviewForm:()=>null}));
import Home from "../../../../app/page";
import ReviewPage from "../../../../app/teacher/review/page";
describe("assignment views",()=>{
  beforeEach(()=>{mocks.active.mockResolvedValue([]);mocks.pending.mockResolvedValue([]);mocks.failures.mockResolvedValue([]);});
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
    mocks[key].mockResolvedValue([{submission:{id:"sub",studentId:"s",assignmentId:"a",version:1,promptText:"Fictional",teacherScore:80,canvasSyncError:"Unavailable"},assignment:{title:"課題"}}]);
    expect(renderToStaticMarkup(await ReviewPage())).toContain("テスト受講生");
  });
});

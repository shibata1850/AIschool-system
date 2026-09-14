import { getCurrentUser } from "@/lib/auth";
import { teacherCourseAccess } from "@/lib/course/access";
import { getLtiConfig } from "@/lib/lti/config";
import { createCanvasAssignmentLink } from "@/lib/canvas/assignmentLinks";
import { AssignmentLinkError } from "@/lib/canvas/assignmentLinkPolicy";
import { CanvasApiError } from "@/lib/canvas/client";
import { toErrorMessage } from "@/lib/canvas/errorMessage";

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  if (!teacherCourseAccess(actor)?.courseId || !actor.viaLti) {
    return new Response("Canvasのコースから講師として起動してください", { status: 403 });
  }
  const toolUrl = getLtiConfig()?.toolUrl;
  if (!toolUrl || request.headers.get("origin") !== new URL(toolUrl).origin) {
    return new Response("送信元を確認できません", { status: 403 });
  }
  let body: { assignmentId?: unknown; canvasAssignmentId?: unknown };
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body");
  } catch {
    return new Response("リクエストの形式が正しくありません", { status: 400 });
  }
  if (typeof body.assignmentId !== "string" || !body.assignmentId.trim() || body.assignmentId.length > 200 ||
      typeof body.canvasAssignmentId !== "number" || !Number.isSafeInteger(body.canvasAssignmentId) ||
      body.canvasAssignmentId <= 0 || body.canvasAssignmentId > 2147483647) {
    return new Response("演習とCanvas課題を選択してください", { status: 400 });
  }
  try {
    return Response.json(await createCanvasAssignmentLink(actor, body.assignmentId, body.canvasAssignmentId));
  } catch (error) {
    if (error instanceof AssignmentLinkError) return new Response(error.message, { status: error.status });
    if (error instanceof CanvasApiError) return new Response(toErrorMessage(error), { status: 502 });
    return new Response("対応を保存できませんでした。登録状況を確認してください", { status: 500 });
  }
}

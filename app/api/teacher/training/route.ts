import { getCurrentUser } from "@/lib/auth";
import { teacherCourseAccess } from "@/lib/course/access";
import { trainingLinkPolicy } from "@/lib/course/trainingLinks";
import { saveTrainingSettings, TrainingSettingsError } from "@/lib/course/trainingStore";
import { getLtiConfig } from "@/lib/lti/config";

export async function POST(request: Request) {
  const actor = await getCurrentUser();
  const courseId = teacherCourseAccess(actor)?.courseId;
  if (!actor.viaLti || !courseId) {
    return new Response("Canvasのコースから講師として起動してください", { status: 403 });
  }
  const toolUrl = getLtiConfig()?.toolUrl;
  let origin: string | undefined;
  try { origin = toolUrl ? new URL(toolUrl).origin : undefined; } catch { /* Fail closed. */ }
  if (!origin || request.headers.get("origin") !== origin) {
    return new Response("送信元を確認できません", { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return new Response("JSON形式で送信してください", { status: 415 });
  }
  let input: unknown;
  try { input = await request.json(); }
  catch { return new Response("リクエストの形式が正しくありません", { status: 400 }); }
  try {
    const saved = await saveTrainingSettings(actor, input, trainingLinkPolicy(courseId));
    return Response.json(saved, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof TrainingSettingsError) return new Response(error.message, { status: error.status });
    return new Response("授業設定を保存できませんでした。再読み込みして確認してください", { status: 500 });
  }
}

import { getCurrentUser } from "@/lib/auth";
import { allocateAssignment, AllocationError } from "@/lib/f3/allocation";
import { allocationScope, parseAllocation } from "@/lib/f3/allocationPolicy";
import { getLtiConfig } from "@/lib/lti/config";

export async function POST(request:Request) {
  const actor = await getCurrentUser();
  if (!allocationScope(actor)) return new Response("コースから講師として起動してください。",{status:403});
  const toolUrl = getLtiConfig()?.toolUrl;
  if (!toolUrl || request.headers.get("origin") !== new URL(toolUrl).origin) return new Response("送信元を確認できません。",{status:403});
  let input;
  try { input = parseAllocation(await request.json()); } catch { input = null; }
  if (!input) return new Response("課題と受講生を選択してください。",{status:400});
  try { return Response.json(await allocateAssignment(actor,input.assignmentId,input.studentIds)); }
  catch(error) {
    if (error instanceof AllocationError) return new Response(error.message,{status:400});
    console.error("課題割当の保存に失敗しました");
    return new Response("保存できませんでした。もう一度お試しください。",{status:500});
  }
}

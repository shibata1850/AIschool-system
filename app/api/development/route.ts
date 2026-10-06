import { getCurrentUser } from "@/lib/auth";
import { getLtiConfig } from "@/lib/lti/config";
import { DevelopmentError, saveDevelopment } from "@/lib/development/store";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const fail = (message: string, status: number) => new Response(message, { status, headers });
  const actor = await getCurrentUser();
  if (!actor.viaLti || actor.role === "guest") return fail("Canvasから起動してください", 403);
  let origin: string | undefined;
  try { const config = getLtiConfig(); if (config) origin = new URL(config.toolUrl).origin; } catch { /* Fail closed. */ }
  if (!origin || request.headers.get("origin") !== origin) return fail("送信元を確認できません", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fail("JSON形式が必要です", 415);
  // Bound the stream, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return fail("入力がありません", 400);
  let text = "", size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 20000) { await reader.cancel(); return fail("入力が長すぎます", 413); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const input: unknown = JSON.parse(text);
    return Response.json(await saveDevelopment(actor, input), { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return fail("JSON形式が不正です", 400);
    if (error instanceof DevelopmentError) return fail(error.message, error.status);
    return fail("保存できませんでした。再読み込みして状態を確認してください", 500);
  } finally { reader.releaseLock(); }
}

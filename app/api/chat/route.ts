import { NextResponse, type NextRequest } from "next/server";
import { answerQuestion, ValidationError } from "@/lib/f2/tutor";

/**
 * S3 AIチャットのAPI（F2）。ゲストの利用は proxy.ts で403ガード済み。
 * 2026-07-03 監査指摘#9の修正: 入力起因のエラー（ValidationError）だけを400にし、
 * サーバー都合のエラー（設定不備・推論失敗）は内部メッセージを生徒に見せず
 * 定型文の500を返す。
 */
export async function POST(request: NextRequest) {
  let body: { question?: unknown };
  try {
    body = await request.json();
  } catch {
    return new NextResponse("リクエストの形式が正しくありません", { status: 400 });
  }

  try {
    const answer = await answerQuestion(
      typeof body.question === "string" ? body.question : "",
    );
    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof ValidationError) {
      return new NextResponse(error.message, { status: 400 });
    }
    // 個人情報は含めずエラー種別のみ記録する（質問本文はログしない）
    console.error("AIチャット処理エラー:", error instanceof Error ? error.message : error);
    return new NextResponse(
      "AIがこたえられませんでした。しばらくしてから、もう一度ためしてください",
      { status: 500 },
    );
  }
}

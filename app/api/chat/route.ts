import { NextResponse, type NextRequest } from "next/server";
import { answerQuestion } from "@/lib/f2/tutor";

/** S3 AIチャットのAPI（F2）。ゲストの利用は proxy.ts で403ガード済み */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { question?: string };
  try {
    const answer = await answerQuestion(body.question ?? "");
    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof Error && !("status" in error)) {
      return new NextResponse(error.message, { status: 400 });
    }
    throw error;
  }
}

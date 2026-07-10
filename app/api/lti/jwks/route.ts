import { NextResponse } from "next/server";
import { getToolPublicJwk } from "@/lib/lti/keys";

/**
 * ツール側の公開鍵JWKS。CanvasがツールのLTIサービス署名を検証する際に使う。
 * 鍵未設定なら空のキーセットを返す（基本の起動検証には鍵は不要）。
 */
export async function GET() {
  const jwk = await getToolPublicJwk();
  return NextResponse.json({ keys: jwk ? [jwk] : [] });
}

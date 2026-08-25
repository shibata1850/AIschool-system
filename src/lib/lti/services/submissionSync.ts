import { requestServiceToken } from "./token";
import { postSubmissionProgress } from "./ags";

/** AGSの成績スコープ（提出状態の送信にはスコアと同じスコープが要る） */
export const AGS_SCORE_SCOPE = "https://purl.imsglobal.org/spec/lti-ags/scope/score";

export interface AgsSubmissionTarget {
  lineItem: string;
  scopes: string[];
  sub: string;
}

/**
 * このLTI起動でCanvasへ提出状態を送れるか（lineitemとスコアスコープが揃っているか）。
 * 副作用なしの純粋関数（コース内ナビゲーション起動などlineitemが無い起動では false）。
 */
export function canSyncSubmission(
  target: AgsSubmissionTarget | undefined,
): target is AgsSubmissionTarget {
  return !!target?.lineItem && target.scopes.includes(AGS_SCORE_SCOPE);
}

/** 提出済み・未採点をCanvasへ送る（B-2）。アクセストークン取得→AGS送信を一括で行う。 */
export async function syncSubmissionToCanvas(
  target: AgsSubmissionTarget,
  cfg: { clientId: string; tokenUrl: string },
  privateKey: CryptoKey,
  kid: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const accessToken = await requestServiceToken(
    {
      clientId: cfg.clientId,
      tokenUrl: cfg.tokenUrl,
      privateKey,
      kid,
      scopes: [AGS_SCORE_SCOPE],
    },
    fetchFn,
  );
  await postSubmissionProgress(target.lineItem, accessToken, target.sub, fetchFn);
}

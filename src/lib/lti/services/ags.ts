/**
 * LTI Advantage AGS（Assignment and Grade Services）: ツール署名で成績をCanvasへ送る。
 * 起動時の endpoint クレームから得た lineitem URL の /scores へ Score を POST する。
 */

/** lineitem URL に /scores を付与する（クエリ文字列を保持） */
export function scoresUrl(lineItemUrl: string): string {
  const [base, query] = lineItemUrl.split("?");
  return `${base.replace(/\/$/, "")}/scores${query ? `?${query}` : ""}`;
}

export interface AgsScore {
  /** Canvasの利用者ID（LTIのsub） */
  userId: string;
  scoreGiven: number;
  scoreMaximum: number;
  /** 受講生に見える講評 */
  comment?: string;
}

export async function postScore(
  lineItemUrl: string,
  accessToken: string,
  score: AgsScore,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchFn(scoresUrl(lineItemUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/vnd.ims.lis.v1.score+json",
    },
    body: JSON.stringify({
      userId: score.userId,
      scoreGiven: score.scoreGiven,
      scoreMaximum: score.scoreMaximum,
      comment: score.comment,
      timestamp: new Date(Date.now()).toISOString(),
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    }),
  });
  if (!res.ok) {
    // 応答本文は個人情報を含み得るため載せない
    throw new Error(`成績の送信に失敗しました（HTTP ${res.status}）`);
  }
}

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

async function postResult(
  lineItemUrl: string,
  accessToken: string,
  body: Record<string, unknown>,
  fetchFn: typeof fetch,
): Promise<void> {
  const res = await fetchFn(scoresUrl(lineItemUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/vnd.ims.lis.v1.score+json",
    },
    body: JSON.stringify({ timestamp: new Date(Date.now()).toISOString(), ...body }),
  });
  if (!res.ok) {
    // 応答本文は個人情報を含み得るため載せない
    throw new Error(`Canvasへの送信に失敗しました（HTTP ${res.status}）`);
  }
}

export async function postScore(
  lineItemUrl: string,
  accessToken: string,
  score: AgsScore,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  await postResult(
    lineItemUrl,
    accessToken,
    {
      userId: score.userId,
      scoreGiven: score.scoreGiven,
      scoreMaximum: score.scoreMaximum,
      comment: score.comment,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    },
    fetchFn,
  );
}

/**
 * 提出直後（採点前）に「提出済み・未採点」をCanvasへ知らせる（B-2）。
 * 点数は送らない（gradingProgress=PendingManual）。講師/AIの採点確定時は
 * postScore で改めて点数付きの結果を送る。
 */
export async function postSubmissionProgress(
  lineItemUrl: string,
  accessToken: string,
  userId: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  await postResult(
    lineItemUrl,
    accessToken,
    { userId, activityProgress: "Submitted", gradingProgress: "PendingManual" },
    fetchFn,
  );
}

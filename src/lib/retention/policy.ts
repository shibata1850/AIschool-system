/**
 * 個人データの保持期間ポリシー（Pマーク整合・要件定義書5.3・未決#10）。
 *
 * 学習データ（提出・学習記録）は要配慮の個人データ（受講生に未成年を含む）として扱い、
 * 「在籍中＋退会後 N 年」を過ぎたら削除する。N の確定は未決#10（Pマーク運用と整合）。
 * 既定は3年。RETENTION_YEARS 環境変数で上書きできる（確定後に設定する）。
 *
 * ここは判定ロジックのみ（副作用なし・単体テスト対象）。実削除は store 側、
 * 権限確認・監査記録は API 側で行う。
 */

export interface Withdrawal {
  studentId: string;
  /** 退会日（ISO 8601。校務システム/Canvas由来を想定） */
  withdrawnAt: string;
}

/** 保持年数（既定3年。RETENTION_YEARS で上書き。不正値は既定にフォールバック） */
export function retentionYears(): number {
  const raw = process.env.RETENTION_YEARS;
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 3;
}

/** 退会日から保持期限（この日時以降は削除可）を返す */
export function retentionDeadline(
  withdrawnAt: string,
  years: number = retentionYears(),
): Date {
  const deadline = new Date(withdrawnAt);
  deadline.setFullYear(deadline.getFullYear() + years);
  return deadline;
}

/**
 * now が保持期限に達していれば削除対象。
 * 不正な退会日は「判定不能」として削除対象にしない（安全側に倒す）。
 */
export function isExpired(
  withdrawnAt: string,
  now: Date,
  years: number = retentionYears(),
): boolean {
  const parsed = new Date(withdrawnAt);
  if (Number.isNaN(parsed.getTime())) return false;
  return now.getTime() >= retentionDeadline(withdrawnAt, years).getTime();
}

/** 保持期限を過ぎた退会者だけを抽出する（削除対象の算定。副作用なし） */
export function selectExpired(
  withdrawals: Withdrawal[],
  now: Date,
  years: number = retentionYears(),
): Withdrawal[] {
  return withdrawals.filter((w) => isExpired(w.withdrawnAt, now, years));
}

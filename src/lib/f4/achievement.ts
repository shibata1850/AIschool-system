/**
 * 到達度スコア算出（docs/要件定義書.md 6.3）。
 *
 *   到達度スコア = 課題平均スコア × 0.6 + 提出率 × 0.2 + 出席率 × 0.2
 *
 * - 重みは設定値として外部化（開校後1ヶ月の実データで見直す前提）
 * - 分母規則: 途中入会者は入会日以降のコマのみ（＝レコードが存在するコマのみ）。
 *   「計測不能」コマ（システム障害等）は分母から除外し、0点扱いにしない
 * - 端数: 小数第1位まで、四捨五入
 */

export interface AchievementWeights {
  /** 課題平均スコアの重み */
  score: number;
  /** 提出率の重み */
  submission: number;
  /** 出席率の重み */
  attendance: number;
}

export const DEFAULT_WEIGHTS: AchievementWeights = {
  score: 0.6,
  submission: 0.2,
  attendance: 0.2,
};

/** 授業コマ1回分の学習記録 */
export interface LessonRecord {
  lessonId: string;
  /** 週の月曜（ISO日付）。週次集計のキー */
  weekStart: string;
  attended: boolean;
  submitted: boolean;
  /** 完了課題のスコア（未採点・未提出は null） */
  score: number | null;
  /** システム障害等でデータ欠損したコマ（F4例外3） */
  dataMissing?: boolean;
}

export interface WeeklyAchievement {
  weekStart: string;
  /** false = 計測不能（その週の全コマがデータ欠損） */
  measurable: boolean;
  attendanceRate: number;
  submissionRate: number;
  /** その週に採点済スコアが1件もなければ null（重みを再配分して算出） */
  averageScore: number | null;
  /** 到達度スコア（0-100・小数第1位） */
  total: number;
}

export function validateWeights(weights: AchievementWeights): void {
  const sum = weights.score + weights.submission + weights.attendance;
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`重みの合計は1にしてください（現在: ${sum}）`);
  }
  if (weights.score < 0 || weights.submission < 0 || weights.attendance < 0) {
    throw new Error("重みに負の値は使えません");
  }
}

/** 小数第1位まで・四捨五入 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 週ごとの到達度を古い週から順に返す */
export function computeWeeklyAchievements(
  records: LessonRecord[],
  weights: AchievementWeights = DEFAULT_WEIGHTS,
): WeeklyAchievement[] {
  validateWeights(weights);

  const byWeek = new Map<string, LessonRecord[]>();
  for (const record of records) {
    const list = byWeek.get(record.weekStart) ?? [];
    list.push(record);
    byWeek.set(record.weekStart, list);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, weekRecords]) => {
      const usable = weekRecords.filter((r) => !r.dataMissing);
      if (usable.length === 0) {
        // 計測不能: 0点扱いにしない（F4例外3）
        return {
          weekStart,
          measurable: false,
          attendanceRate: 0,
          submissionRate: 0,
          averageScore: null,
          total: 0,
        };
      }

      const attendanceRate = round1(
        (usable.filter((r) => r.attended).length / usable.length) * 100,
      );
      const submissionRate = round1(
        (usable.filter((r) => r.submitted).length / usable.length) * 100,
      );
      const scores = usable
        .map((r) => r.score)
        .filter((s): s is number => s !== null);
      const averageScore =
        scores.length > 0
          ? round1(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;

      // 採点済スコアがない週は、スコアの重みを提出率・出席率へ比例配分して算出する
      let total: number;
      if (averageScore !== null) {
        total =
          averageScore * weights.score +
          submissionRate * weights.submission +
          attendanceRate * weights.attendance;
      } else {
        const rest = weights.submission + weights.attendance;
        total =
          rest === 0
            ? 0
            : submissionRate * (weights.submission / rest) +
              attendanceRate * (weights.attendance / rest);
      }

      return {
        weekStart,
        measurable: true,
        attendanceRate,
        submissionRate,
        averageScore,
        total: round1(total),
      };
    });
}

/** 最新の計測可能な週の到達度（1件もなければ null） */
export function latestAchievement(
  weekly: WeeklyAchievement[],
): WeeklyAchievement | null {
  for (let i = weekly.length - 1; i >= 0; i -= 1) {
    if (weekly[i].measurable) return weekly[i];
  }
  return null;
}

/**
 * 停滞アラート: 計測可能な直近3週で到達度が2回連続下降しているか（S8）。
 * 計測不能週は判定から除外する（0点扱いにしない規則と整合）。
 */
export function isDeclining(weekly: WeeklyAchievement[]): boolean {
  const measurable = weekly.filter((w) => w.measurable);
  if (measurable.length < 3) return false;
  const [a, b, c] = measurable.slice(-3);
  return c.total < b.total && b.total < a.total;
}

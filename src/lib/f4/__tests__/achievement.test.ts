import { describe, expect, it } from "vitest";
import {
  computeWeeklyAchievements,
  DEFAULT_WEIGHTS,
  isDeclining,
  latestAchievement,
  round1,
  validateWeights,
  type LessonRecord,
  type WeeklyAchievement,
} from "../achievement";

function record(partial: Partial<LessonRecord> & { lessonId: string }): LessonRecord {
  return {
    weekStart: "2026-10-05",
    attended: true,
    submitted: true,
    score: 80,
    ...partial,
  };
}

describe("到達度スコア算出（要件定義書6.3・単体テスト必須）", () => {
  it("既定の重みで 課題平均×0.6＋提出率×0.2＋出席率×0.2", () => {
    // 全出席・全提出・平均80 → 80*0.6 + 100*0.2 + 100*0.2 = 88
    const weekly = computeWeeklyAchievements([
      record({ lessonId: "l1", score: 80 }),
      record({ lessonId: "l2", score: 80 }),
    ]);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].total).toBe(88);
  });

  it("端数は小数第1位・四捨五入", () => {
    expect(round1(87.25)).toBe(87.3);
    expect(round1(87.24)).toBe(87.2);
    // 平均75.5 → 75.5*0.6 + 100*0.2 + 100*0.2 = 85.3
    const weekly = computeWeeklyAchievements([
      record({ lessonId: "l1", score: 75 }),
      record({ lessonId: "l2", score: 76 }),
    ]);
    expect(weekly[0].averageScore).toBe(75.5);
    expect(weekly[0].total).toBe(85.3);
  });

  it("計測不能週: 全コマ欠損なら measurable=false で0点扱いにしない（F4例外3）", () => {
    const weekly = computeWeeklyAchievements([
      record({ lessonId: "l1", weekStart: "2026-10-05", score: 80 }),
      record({ lessonId: "l2", weekStart: "2026-10-12", dataMissing: true }),
      record({ lessonId: "l3", weekStart: "2026-10-19", score: 60 }),
    ]);
    expect(weekly[1].measurable).toBe(false);
    // 最新値は計測不能週をスキップして返す
    expect(latestAchievement(weekly)?.weekStart).toBe("2026-10-19");
  });

  it("欠損コマは分母から除外される（週の一部欠損）", () => {
    // 欠損1コマ＋出席1コマ → 出席率100%（欠損を欠席扱いにしない）
    const weekly = computeWeeklyAchievements([
      record({ lessonId: "l1", dataMissing: true }),
      record({ lessonId: "l2", attended: true, submitted: true, score: 70 }),
    ]);
    expect(weekly[0].attendanceRate).toBe(100);
  });

  it("出席・未提出を区別する（F4例外4）: 出席率は上がり提出率は上がらない", () => {
    const weekly = computeWeeklyAchievements([
      record({ lessonId: "l1", attended: true, submitted: false, score: null }),
    ]);
    expect(weekly[0].attendanceRate).toBe(100);
    expect(weekly[0].submissionRate).toBe(0);
  });

  it("採点済スコアがない週は重みを提出率・出席率へ再配分する", () => {
    // 出席100%・提出0% → 0*(0.2/0.4) + 100*(0.2/0.4) = 50
    const weekly = computeWeeklyAchievements([
      record({ lessonId: "l1", attended: true, submitted: false, score: null }),
    ]);
    expect(weekly[0].averageScore).toBeNull();
    expect(weekly[0].total).toBe(50);
  });

  it("途中入会: レコードが存在する週だけが集計される（F4例外1）", () => {
    const weekly = computeWeeklyAchievements([
      record({ lessonId: "l1", weekStart: "2026-10-19", score: 90 }),
    ]);
    expect(weekly).toHaveLength(1);
    expect(weekly[0].weekStart).toBe("2026-10-19");
  });

  it("重みの検証: 合計が1でない・負の重みはエラー", () => {
    expect(() =>
      validateWeights({ score: 0.5, submission: 0.2, attendance: 0.2 }),
    ).toThrow(/合計/);
    expect(() =>
      validateWeights({ score: 1.2, submission: -0.1, attendance: -0.1 }),
    ).toThrow();
    expect(() => validateWeights(DEFAULT_WEIGHTS)).not.toThrow();
  });

  it("レコード0件（入会直後）は空配列で latest は null", () => {
    const weekly = computeWeeklyAchievements([]);
    expect(weekly).toHaveLength(0);
    expect(latestAchievement(weekly)).toBeNull();
  });
});

describe("停滞アラート（isDeclining）", () => {
  function week(weekStart: string, total: number, measurable = true): WeeklyAchievement {
    return {
      weekStart,
      measurable,
      attendanceRate: 100,
      submissionRate: 100,
      averageScore: total,
      total,
    };
  }

  it("直近3週で2回連続下降ならtrue", () => {
    expect(
      isDeclining([week("w1", 90), week("w2", 80), week("w3", 70)]),
    ).toBe(true);
  });

  it("下降が1回だけ・横ばい・上昇ならfalse", () => {
    expect(isDeclining([week("w1", 80), week("w2", 90), week("w3", 70)])).toBe(false);
    expect(isDeclining([week("w1", 80), week("w2", 80), week("w3", 80)])).toBe(false);
    expect(isDeclining([week("w1", 70), week("w2", 80), week("w3", 90)])).toBe(false);
  });

  it("計測可能な週が3週未満ならfalse（途中入会・欠損）", () => {
    expect(isDeclining([week("w1", 90), week("w2", 80)])).toBe(false);
  });

  it("計測不能週は判定から除外される", () => {
    expect(
      isDeclining([
        week("w1", 90),
        week("w2", 0, false), // 計測不能 — 0点として下降判定に混ぜない
        week("w3", 80),
        week("w4", 70),
      ]),
    ).toBe(true); // 90→80→70 の連続下降
  });
});

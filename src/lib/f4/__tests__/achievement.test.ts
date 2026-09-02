import { describe, expect, it } from "vitest";
import {
  combineAchievement,
  computeWeeklyAchievements,
  HOME_STUDY_WEIGHT,
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

describe("combineAchievement（教室＋自宅学習の合成・2026-09-02）", () => {
  it("正常系: 教室8割・自宅学習2割で合成する", () => {
    // 70 * 0.8 + 90 * 0.2 = 56 + 18 = 74
    const r = combineAchievement(70, [90]);
    expect(r.total).toBe(74);
    expect(r.classroomTotal).toBe(70);
    expect(r.homeStudyTotal).toBe(90);
    expect(r.appliedHomeStudyWeight).toBe(0.2);
    expect(r.measuredUnitCount).toBe(1);
  });

  it("複数単元は単純平均してから合成する", () => {
    // 自宅学習 = (60+80+100)/3 = 80 → 50*0.8 + 80*0.2 = 40 + 16 = 56
    const r = combineAchievement(50, [60, 80, 100]);
    expect(r.homeStudyTotal).toBe(80);
    expect(r.total).toBe(56);
  });

  it("**自宅学習の記録が無ければ減点しない**（重みを教室へ再配分する）", () => {
    const r = combineAchievement(70, []);
    expect(r.total).toBe(70); // 70*0.8=56 にはしない
    expect(r.homeStudyTotal).toBeNull();
    expect(r.appliedHomeStudyWeight).toBe(0);
  });

  it("**全単元が「測定中」でも減点しない**（null は母数から除く）", () => {
    const r = combineAchievement(70, [null, null]);
    expect(r.total).toBe(70);
    expect(r.homeStudyTotal).toBeNull();
    expect(r.measuredUnitCount).toBe(0);
  });

  it("測定中が混ざる場合は、測定済みだけで平均する", () => {
    // 測定済みは 80 のみ → 60*0.8 + 80*0.2 = 48 + 16 = 64
    const r = combineAchievement(60, [null, 80, null]);
    expect(r.homeStudyTotal).toBe(80);
    expect(r.measuredUnitCount).toBe(1);
    expect(r.total).toBe(64);
  });

  it("境界値: 自宅学習0点は「測定中」と区別して合成に効く", () => {
    // 100*0.8 + 0*0.2 = 80。記録なし(=100)と同じにしてはいけない
    const r = combineAchievement(100, [0]);
    expect(r.homeStudyTotal).toBe(0);
    expect(r.total).toBe(80);
    expect(combineAchievement(100, []).total).toBe(100);
  });

  it("境界値: 両方100なら100、両方0なら0", () => {
    expect(combineAchievement(100, [100]).total).toBe(100);
    expect(combineAchievement(0, [0]).total).toBe(0);
  });

  it("境界値: 重み0は教室のみ、重み1は自宅学習のみ", () => {
    expect(combineAchievement(70, [90], 0).total).toBe(70);
    expect(combineAchievement(70, [90], 1).total).toBe(90);
  });

  it("入力エラー: 重みが0〜1の外なら例外", () => {
    expect(() => combineAchievement(70, [90], -0.1)).toThrow();
    expect(() => combineAchievement(70, [90], 1.1)).toThrow();
  });

  it("端数は小数第1位まで（表示と一致させる）", () => {
    // 73.3 * 0.8 + 55.5 * 0.2 = 58.64 + 11.1 = 69.74 → 69.7
    const r = combineAchievement(73.3, [55.5]);
    expect(r.total).toBe(69.7);
  });

  it("既定の重みは0.2（教室の内訳を変えずに全体の2割を割り当てる）", () => {
    expect(HOME_STUDY_WEIGHT).toBe(0.2);
    // 実効の重み: スコア0.48 / 提出0.16 / 出席0.16 / 自宅0.20
    expect(DEFAULT_WEIGHTS.score * (1 - HOME_STUDY_WEIGHT)).toBeCloseTo(0.48);
  });
});

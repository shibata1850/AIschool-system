/**
 * 未成年向けコンテンツフィルタ（CLAUDE.md 9章の絶対条件）。
 * AI応答は必ず本フィルタを通過させてから生徒に表示する。
 * フィルタを経由しない表示経路の追加は禁止。
 *
 * 参照実装は「正規化＋カテゴリ別語彙」方式。全角/空白による回避を正規化で吸収し、
 * 誤検知（正当な質問のブロック）を避けるため語彙は誤検知しにくい語に絞る。
 * 本番導入前に、分類モデル/モデレーションAPIへ差し替える（本interfaceは維持）。
 */

export type FilterCategory =
  | "self_harm" // 自傷・自殺
  | "violence" // 暴力・危害
  | "weapons" // 武器・爆発物
  | "drugs" // 薬物
  | "adult"; // アダルト

export interface FilterResult {
  allowed: boolean;
  /** ブロック理由（講師通知・ログ用。受講生には定型文のみ表示） */
  reason?: string;
  /** ブロックしたカテゴリ（講師通知の分類用） */
  category?: FilterCategory;
}

/**
 * カテゴリ別のNG語彙。
 * 方針: 誤検知を避けるため、無害な文中に部分一致しにくい語を選ぶ
 * （例: 「殺す」は「相殺する」に一致するため使わず「殺し方/殺したい」を使う）。
 */
const NG_WORDS: Record<FilterCategory, string[]> = {
  self_harm: ["自殺", "死にたい", "しにたい", "消えたい", "リストカット", "自傷"],
  violence: ["殺し方", "殺したい", "死ね", "なぶり殺", "ぶっ殺"],
  weapons: ["爆弾の作り方", "爆弾", "銃の作り方", "武器の作り方"],
  drugs: ["覚醒剤", "大麻", "麻薬", "違法薬物", "薬物"],
  adult: ["アダルト", "ポルノ", "わいせつ", "児童ポルノ", "エロ本"],
};

/** 英語の高リスク表現（最小限。空白除去後に照合） */
const NG_EN: Array<{ phrase: string; category: FilterCategory }> = [
  { phrase: "suicide", category: "self_harm" },
  { phrase: "killyourself", category: "self_harm" },
  { phrase: "howtomakeabomb", category: "weapons" },
  { phrase: "childporn", category: "adult" },
];

/**
 * 照合用の正規化: 全角→半角等の畳み込み（NFKC）、小文字化、空白除去。
 * 空白除去で「死 ね」「死　ね」などの回避を吸収する
 * （日本語は語間に空白を使わないため副作用が小さい）。
 */
function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

export function filterContent(text: string): FilterResult {
  const normalized = normalize(text);

  for (const category of Object.keys(NG_WORDS) as FilterCategory[]) {
    for (const word of NG_WORDS[category]) {
      if (normalized.includes(normalize(word))) {
        return {
          allowed: false,
          reason: `不適切な内容を検出しました（分類: ${category}）`,
          category,
        };
      }
    }
  }

  for (const { phrase, category } of NG_EN) {
    if (normalized.includes(phrase)) {
      return {
        allowed: false,
        reason: `不適切な内容を検出しました（分類: ${category}）`,
        category,
      };
    }
  }

  return { allowed: true };
}

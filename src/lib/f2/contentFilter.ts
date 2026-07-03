/**
 * 未成年向けコンテンツフィルタ（CLAUDE.md 9章の絶対条件）。
 * AI応答は必ず本フィルタを通過させてから生徒に表示する。
 * フィルタを経由しない表示経路の追加は禁止。
 *
 * 参照実装は語彙リスト方式。本番導入前に、より精緻なフィルタ
 * （分類モデル・モデレーションAPI等）への差し替えを検討する。
 * その場合も本モジュールのinterfaceを維持して差し替える。
 */

export interface FilterResult {
  allowed: boolean;
  /** ブロック理由（講師通知・ログ用。受講生には定型文のみ表示） */
  reason?: string;
}

/** 未成年向けに不適切な語彙（参照実装の最小セット） */
const NG_WORDS = [
  "殺し方",
  "死ね",
  "自殺",
  "爆弾の作り方",
  "アダルト",
  "薬物",
];

export function filterContent(text: string): FilterResult {
  for (const word of NG_WORDS) {
    if (text.includes(word)) {
      return { allowed: false, reason: `不適切な語彙を検出: ${word}` };
    }
  }
  return { allowed: true };
}

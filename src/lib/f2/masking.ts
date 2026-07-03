/**
 * 個人情報マスキング（F2例外4・要件定義書5.3）。
 * 受講生がAIに入力した連絡先パターンを、ログ保存前・外部API送信前に置換する。
 *
 * 注意: 氏名の検出はパターンでは不可能なため本層では扱わない。
 * 本番導入時は辞書・NER等による検出の追加を検討する（docs/要望リスト.md）。
 */

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_PATTERN = /(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)|(?<!\d)0\d{9,10}(?!\d)/g;
const POSTAL_PATTERN = /〒?\s?(?<!\d)\d{3}-\d{4}(?!\d)/g;

export interface MaskResult {
  masked: string;
  /** 1件でも置換したら true（受講生への注意表示に使う） */
  piiDetected: boolean;
}

export function maskPersonalInfo(text: string): MaskResult {
  let piiDetected = false;
  let masked = text;

  const apply = (pattern: RegExp, label: string) => {
    masked = masked.replace(pattern, () => {
      piiDetected = true;
      return `（${label}）`;
    });
  };

  apply(EMAIL_PATTERN, "メールアドレス");
  apply(PHONE_PATTERN, "電話番号");
  apply(POSTAL_PATTERN, "郵便番号");

  return { masked, piiDetected };
}

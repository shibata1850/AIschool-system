/**
 * 個人情報マスキング（F2例外4・要件定義書5.3）。
 * 受講生がAIに入力した連絡先・氏名を、ログ保存前・外部API送信前に置換する。
 *
 * 氏名は一般に完全なパターン検出は不可能なため、誤検知を抑える方針として
 * 「よくある姓＋敬称（さん/くん/先生 等）」に限定して検出する。
 * 本番導入時はNER等でのさらなる精緻化を検討する（docs/要望リスト.md）。
 */

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_PATTERN = /(?<!\d)0\d{1,4}-\d{1,4}-\d{3,4}(?!\d)|(?<!\d)0\d{9,10}(?!\d)/g;
// 郵便番号は〒プレフィックス必須。裸の「3桁-4桁」は「500-1000文字」のような
// 数値範囲と区別できず、質問文を破壊する誤検出になるため対象外とする
// （回帰: 2026-07-03 監査指摘#7）
const POSTAL_PATTERN = /〒\s?\d{3}-\d{4}(?!\d)/g;

/** 誤検知を抑えるため、日常語と紛れにくい代表的な姓に限定（敬称と併せて判定） */
const COMMON_SURNAMES = [
  "佐々木", "長谷川",
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "山口", "松本", "井上", "木村", "斎藤", "清水", "山崎", "池田",
  "橋本", "阿部", "石川", "山下", "中島", "石井", "小川", "前田", "岡田", "藤田",
  "後藤", "近藤", "村上", "遠藤", "青木", "坂本", "森", "林",
];
const HONORIFICS = ["さん", "くん", "君", "ちゃん", "様", "先生"];
// 長い姓を先に並べて最長一致（小林 が 林 に化けないように）
const NAME_PATTERN = new RegExp(
  `(?:${[...COMMON_SURNAMES].sort((a, b) => b.length - a.length).join("|")})(?:${HONORIFICS.join("|")})`,
  "g",
);

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
  apply(NAME_PATTERN, "名前");

  return { masked, piiDetected };
}

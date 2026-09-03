import { expect, test, type Page } from "@playwright/test";
import { setRole, type Role } from "../helpers";

/**
 * 3条件表示確認のうち、**機械で判定できる分**を自動化する
 * （CLAUDE.md 4章「UI設計制約」・docs/テスト計画書.md 5章）。
 *
 * | 条件 | この spec で見るもの | 実機で見るもの（当日） |
 * |---|---|---|
 * | NUC＋モバイルモニター | 本文16px以上・横スクロールなし・lang=ja | 物理的な判読性 |
 * | NearHub S65（タッチ） | **タップターゲット44px以上** | 投影時の見え方・タッチの当たり |
 * | Quest 3 | —（自動化できない） | コントラスト・細線/小アイコンの有無 |
 *
 * **狙い**: 搬入日（9月中旬）に人手でやる項目を減らすこと。ここで固定しておけば、
 * 当日は「目で見ないと分からないもの」だけに集中でき、かつ**あとからのUI変更で
 * 制約が崩れたらCIで落ちる**。
 */

const SCREENS: Array<{ name: string; path: string; role: Role }> = [
  { name: "S1 受講生ホーム", path: "/", role: "student" },
  { name: "S2 プロンプト演習", path: "/exercises/a1", role: "student" },
  { name: "S3 AI講師チャット", path: "/chat", role: "student" },
  { name: "S4 Jupyter演習", path: "/jupyter", role: "student" },
  { name: "S5 自分の到達度", path: "/achievement", role: "student" },
  { name: "S6 授業中モニタリング", path: "/teacher/monitor", role: "teacher" },
  { name: "S7 採点・差戻し", path: "/teacher/review", role: "teacher" },
  { name: "S8 週次到達度レポート", path: "/teacher/report", role: "teacher" },
  { name: "S9 デバイス割当", path: "/teacher/devices", role: "teacher" },
  { name: "S10 監査ログ閲覧", path: "/admin/audit", role: "admin" },
  { name: "Canvas連携状況", path: "/admin/canvas", role: "admin" },
  { name: "クラス名簿", path: "/teacher/class", role: "teacher" },
  { name: "成績入力", path: "/teacher/grade", role: "teacher" },
  { name: "クラス成績サマリ", path: "/teacher/summary", role: "teacher" },
  { name: "出席の記録", path: "/teacher/attendance", role: "teacher" },
];

/** 本文の最小フォントサイズ（CLAUDE.md 4章「本文フォント16px以上」） */
const MIN_BODY_FONT_PX = 16;
/** タップターゲットの最小の高さ（CLAUDE.md 4章「タップターゲット44px以上」） */
const MIN_TAP_TARGET_PX = 44;

async function open(page: Page, screen: (typeof SCREENS)[number]): Promise<void> {
  await setRole(page, screen.role);
  const res = await page.goto(screen.path);
  // 画面が開けていること自体を先に確かめる（403や500を「制約OK」と誤判定しないため）
  expect(res?.status(), `${screen.name} が開けません`).toBeLessThan(400);
}

for (const screen of SCREENS) {
  test.describe(`表示制約: ${screen.name}`, () => {
    test(`本文が${MIN_BODY_FONT_PX}px以上・日本語（NUC＋モバイルモニター）`, async ({
      page,
    }) => {
      await open(page, screen);
      await expect(page.locator("html")).toHaveAttribute("lang", "ja");
      const fontSize = await page
        .locator("body")
        .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fontSize).toBeGreaterThanOrEqual(MIN_BODY_FONT_PX);
    });

    test("横スクロールが出ない（1画面1タスク・横スクロール最小化）", async ({ page }) => {
      await open(page, screen);
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      });
      // 端数の丸めを1px許容する（サブピクセルで1px出ることがあるため）
      expect(
        overflow.scrollWidth,
        `横に ${overflow.scrollWidth - overflow.clientWidth}px はみ出しています`,
      ).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test(`タップターゲットが${MIN_TAP_TARGET_PX}px以上（NearHubタッチ）`, async ({
      page,
    }) => {
      await open(page, screen);
      // 対象はボタンとボタン形状のリンク。本文中のテキストリンクは対象外
      // （タップターゲットの制約は操作要素に対するもの）
      const targets = page.locator("button:visible, a.button:visible");
      const count = await targets.count();

      const tooSmall: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const el = targets.nth(i);
        // Next.jsの開発ツールインジケータ（`#next-logo`・NEXTJS-PORTALのシャドウDOM内）
        // を除外する。Playwrightはシャドウルートを貫通して拾うが、**本番ビルドには
        // 存在しない開発用の部品**であって本システムのUIではない
        const isDevTools = await el.evaluate(
          (node) =>
            (node.getRootNode() as ShadowRoot).host?.nodeName === "NEXTJS-PORTAL",
        );
        if (isDevTools) continue;

        const box = await el.boundingBox();
        if (!box) continue;
        if (box.height < MIN_TAP_TARGET_PX) {
          // 落ちたときにどの要素か分かるよう、文字が無い場合はタグとクラスを出す
          const label = await el.evaluate((node) => {
            const text = (node as HTMLElement).innerText?.trim();
            if (text) return text.slice(0, 20);
            const cls = node.className ? `.${String(node.className).split(" ")[0]}` : "";
            return `<${node.nodeName.toLowerCase()}${cls}>`;
          });
          tooSmall.push(`${label} = ${Math.round(box.height)}px`);
        }
      }
      expect(tooSmall, `44px未満の操作要素: ${tooSmall.join(" / ")}`).toEqual([]);
    });
  });
}

test("表示制約: 講師画面は右クリックに依存しない（NearHubタッチ）", async ({ page }) => {
  // NearHubはタッチ操作のため、contextmenu でしか出ない操作があってはいけない。
  // 実装側にリスナーが無いことをもって「依存していない」とみなす
  for (const screen of SCREENS.filter((s) => s.path.startsWith("/teacher"))) {
    await open(page, screen);
    const hasContextMenuHandler = await page.evaluate(() => {
      // インラインの oncontextmenu 属性が付いた要素がないこと
      return document.querySelectorAll("[oncontextmenu]").length > 0;
    });
    expect(hasContextMenuHandler, `${screen.name} に右クリック依存があります`).toBe(
      false,
    );
  }
});

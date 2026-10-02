import { expect, test } from '@playwright/test';
import { setRole } from '../helpers';

test('教材質問の回答と参照元を表示する', async ({ page }) => {
  await setRole(page, 'student');
  await page.goto('/chat');
  await page.getByLabel('質問（しつもん）').fill('事前ヒアリングから業務の開始と終了の範囲を決める方法は？');
  await page.getByRole('button', { name: 'きく', exact: true }).click();
  await expect(page.getByLabel('AIに渡した参照教材')).toBeVisible();
  const links = page.getByLabel('AIに渡した参照教材').getByRole('link');
  expect(await links.count()).toBeGreaterThan(0);
  await expect(links.first()).toHaveAttribute('href', /^https:\/\/ngas-step01-pc-review\.vercel\.app\/btob\//);
});

test('空入力と上限超過は送信しない', async ({ page }) => {
  await setRole(page, 'student');
  await page.goto('/chat');
  await expect(page.getByRole('button', { name: 'きく', exact: true })).toBeDisabled();
  await page.getByLabel('質問（しつもん）').fill('あ'.repeat(2001));
  await expect(page.getByRole('button', { name: 'きく', exact: true })).toBeDisabled();
});

test('ゲストは教材AIを呼び出せない', async ({ request }) => {
  const response = await request.post('/api/chat', { headers: { cookie: 'role=guest' }, data: { question: 'ヒアリング' } });
  expect(response.status()).toBe(403);
});

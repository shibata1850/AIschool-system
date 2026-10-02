import { describe, expect, it } from 'vitest';
import { findTeachingMaterials, teachingContext } from '../materials';
import { answerQuestion } from '../tutor';

describe('public teaching context', () => {
  it('finds hearing material and only returns bounded trusted sources', () => {
    const found = findTeachingMaterials('事前ヒアリングから業務の開始と終了の範囲を決める');
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(3);
    expect(found.some(s => s.id.startsWith('step02/'))).toBe(true);
    for (const source of found) {
      expect(source.url).toMatch(/^https:\/\/ngas-step01-pc-review\.vercel\.app\/btob\//);
      expect(source.text.length).toBeLessThanOrEqual(2400);
    }
  });
  it('does not invent sources for empty, short or unrelated input', () => {
    for (const input of ['', 'あ', 'zyxw987654321']) expect(findTeachingMaterials(input)).toEqual([]);
    expect(teachingContext([])).toBe('');
  });
  it('masks the question before inference and returns source metadata only', async () => {
    const answer = await answerQuestion('test@example.com 事前ヒアリングの範囲と開始と終了について', {
      provider: 'mock',
      async complete(input) {
        expect(input.messages[0].content).not.toContain('test@example.com');
        expect(input.system).toContain('【参照教材】');
        expect(input.system).not.toContain('facilitator_answer');
        return { content: '業務の開始と終了を決めてください。', model: 'test' };
      },
    });
    expect(answer.sources?.length).toBeGreaterThan(0);
    expect(answer.sources?.[0]).not.toHaveProperty('text');
  });
});

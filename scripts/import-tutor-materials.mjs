import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// Explicit public teaching fields only: never import assessment keys or facilitator notes.
const root = process.argv[2];
if (!root) throw new Error('Provide the reviewed material repository directory');
const sections = [];
for (let step = 1; step <= 9; step++) {
  const name = `step${String(step).padStart(2, '0')}`;
  const path = step === 1 ? 'docs/step01/pc/source/scenes.json' : `docs/${name}/source/lesson.json`;
  const raw = readFileSync(resolve(root, path), 'utf8');
  const data = JSON.parse(raw);
  const blocks = step === 1 ? data : data.blocks;
  for (const block of blocks) {
    const text = step === 1 ? block.speech_text : (block.teaching ?? []).join('\n');
    if (!text) continue;
    if (typeof text !== 'string' || typeof block.title !== 'string' || typeof block.id !== 'string') throw new Error(`Invalid material: ${path}`);
    sections.push({ id: `${name}/${block.id}`, title: `STEP${String(step).padStart(2, '0')} ${block.title}`,
      url: `https://ngas-step01-pc-review.vercel.app/btob/${step === 1 ? '' : name + '/'}`,
      text, source: path, sha256: createHash('sha256').update(raw).digest('hex') });
  }
}
writeFileSync(new URL('../src/lib/f2/materials.json', import.meta.url), JSON.stringify(sections, null, 2) + '\n');
console.log(`Imported ${sections.length} public teaching sections`);

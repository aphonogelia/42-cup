import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTestEnv } from '../test-utils/env.js';

setTestEnv();
const { getSpecialPool } = await import('../src/lib/dailyDraw.js');

const fixture = {
  recurring: {
    '10-31': { theme: 'halloween', words: ['ghost', 'witch', 'candy'] },
    '12-25': { theme: 'christmas', words: ['santa', 'holly', 'merry'] },
  },
  oneOff: {
    '2027-10-31': { theme: 'one-off', words: ['treat', 'spook', 'candy'] },
  },
};

const dir = mkdtempSync(join(tmpdir(), 'wordel-special-'));
const file = join(dir, 'special.json');
writeFileSync(file, JSON.stringify(fixture));

// getSpecialPool logs its resolution path; keep test output readable.
const originalLog = console.log;
console.log = () => {};

after(() => {
  console.log = originalLog;
  rmSync(dir, { recursive: true, force: true });
});

test('oneOff overrides recurring for the exact date', () => {
  assert.equal(getSpecialPool('2027-10-31', file).theme, 'one-off');
});

test('recurring applies on the same month-day in another year', () => {
  assert.equal(getSpecialPool('2028-10-31', file).theme, 'halloween');
  assert.equal(getSpecialPool('2027-12-25', file).theme, 'christmas');
});

test('returns null when no pool matches', () => {
  assert.equal(getSpecialPool('2027-02-01', file), null);
});

test('returns null when the special pools file is missing', () => {
  assert.equal(getSpecialPool('2027-10-31', join(dir, 'missing.json')), null);
});

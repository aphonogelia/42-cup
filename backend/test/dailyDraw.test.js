import test from 'node:test';
import assert from 'node:assert/strict';
import { setTestEnv } from '../test-utils/env.js';

setTestEnv();
const { filterRecentAnswers, secureSample } = await import('../src/lib/dailyDraw.js');

test('secureSample returns the requested number of unique pool words', () => {
  const pool = ['apple', 'berry', 'crane', 'delta', 'eagle', 'fjord'];

  const sample = secureSample(pool, 4);

  assert.equal(sample.length, 4);
  assert.equal(new Set(sample).size, 4);
  for (const word of sample) assert.ok(pool.includes(word));
});

test('secureSample does not mutate the pool', () => {
  const pool = ['apple', 'berry', 'crane', 'delta', 'eagle'];
  const copy = [...pool];

  secureSample(pool, 3);

  assert.deepEqual(pool, copy);
});

test('secureSample caps the sample at the pool size', () => {
  assert.equal(secureSample(['apple', 'berry'], 5).length, 2);
});

test('filterRecentAnswers drops buffered answers case-insensitively', () => {
  const pool = ['apple', 'BERRY', 'crane', 'DELTA'];
  const recent = new Set(['berry', 'crane']);

  assert.deepEqual(filterRecentAnswers(pool, recent), ['apple', 'DELTA']);
});

test('filterRecentAnswers keeps the pool when nothing is buffered', () => {
  const pool = ['apple', 'berry'];

  assert.deepEqual(filterRecentAnswers(pool, new Set()), pool);
});

test('draw pool excludes the recent buffer before sampling', () => {
  const pool = ['apple', 'berry', 'crane', 'delta', 'eagle'];
  const recent = new Set(['berry', 'crane']);

  const sample = secureSample(filterRecentAnswers(pool, recent), 2);

  assert.equal(sample.length, 2);
  assert.ok(!sample.includes('berry'));
  assert.ok(!sample.includes('crane'));
});

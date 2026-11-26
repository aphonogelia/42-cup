import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedPeriod,
  getScopeEpoch,
  invalidateScope,
  loadPeriod,
} from '../src/lib/leaderboardCache.js';

// Keys used here never collide with the route tests: different months.
// A closed month is the worst case (1 h TTL), so that is what these use.

test('a load in flight during invalidateScope is served but never cached', async () => {
  const key = 'monthly:open:2030-01:5';
  let release;
  const inflight = loadPeriod(key, false, () => new Promise((resolve) => {
    release = resolve;
  }));

  // A handle change lands while the query above is still running.
  invalidateScope('open');
  await new Promise((resolve) => setTimeout(resolve, 0)); // let the loader start
  release({ rows: [{ handle: 'old' }] });

  const value = await inflight;
  assert.deepEqual(value, { rows: [{ handle: 'old' }] }); // the caller keeps its snapshot
  assert.equal(getCachedPeriod(key), null);               // but it is not cached
});

test('a request after the bump starts a fresh load, not the stale in-flight one', async () => {
  const key = 'monthly:open:2030-02:5';
  let releaseFirst;
  const first = loadPeriod(key, false, () => new Promise((resolve) => {
    releaseFirst = resolve;
  }));

  invalidateScope('open');

  let calls = 0;
  const second = await loadPeriod(key, false, async () => {
    calls += 1;
    return { rows: [{ handle: 'new' }] };
  });

  assert.equal(calls, 1, 'the second request must run its own loader');
  assert.deepEqual(second, { rows: [{ handle: 'new' }] });

  releaseFirst({ rows: [{ handle: 'old' }] });
  await first;

  // The stale load must not overwrite the fresh entry.
  assert.deepEqual(getCachedPeriod(key), { rows: [{ handle: 'new' }] });
});

test('without an invalidation the loader result is cached as before', async () => {
  const key = 'monthly:open:2030-03:5';

  const value = await loadPeriod(key, false, async () => ({ rows: [{ handle: 'neo' }] }));

  assert.deepEqual(value, { rows: [{ handle: 'neo' }] });
  assert.deepEqual(getCachedPeriod(key), { rows: [{ handle: 'neo' }] });
});

test('invalidateScope bumps only its own scope epoch', () => {
  const before42 = getScopeEpoch('42');
  const beforeOpen = getScopeEpoch('open');

  invalidateScope('open');

  assert.equal(getScopeEpoch('open'), beforeOpen + 1);
  assert.equal(getScopeEpoch('42'), before42);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPEN_IDENTITY_KEYS,
  OPEN_FORBIDDEN_KEYS,
  toOpenDailyRow,
  toOpenPeriodRow,
  toOpenWordTimesRows,
  projectPeriodRows,
} from '../src/lib/openRows.js';
import {
  getCachedLeaderboard,
  setCachedLeaderboard,
  invalidateLeaderboard,
  invalidateScope,
} from '../src/lib/leaderboardCache.js';

const DATE = '2026-11-25';

// A full row as returned by `leaderboard_open`: every identity column present.
const RAW_DAILY_ROW = {
  user_id: '00000000-0000-0000-0000-000000000001',
  login: 'intra_login',
  display_name: 'Intra Name',
  avatar_url: 'https://example.test/a.jpg',
  privacy_enabled: false,
  draw_date: DATE,
  words_found: 3,
  total_time: 123.4,
  total_tries: 9,
  word_statuses: ['solved', 'solved', 'solved', 'failed', 'not_started'],
  handle: 'neo',
  global_opt_in: true,
  is_guest: false,
};

const RAW_PERIOD_ROW = {
  ...RAW_DAILY_ROW,
  days_complete: 12,
  words_started: 60,
  words_solved: 55,
  solve_rate: 91.7,
  avg_tries: 3.4,
  median_time: 45.6,
  median_cost: 78.9,
  score: 70.1,
  qualified: true,
  rank: 4,
};

function assertNoIdentityKeys(row) {
  for (const key of OPEN_IDENTITY_KEYS) {
    assert.equal(
      Object.hasOwn(row, key),
      false,
      `open payload must not contain ${key}: ${JSON.stringify(row)}`
    );
  }
}

test('open daily projection is an allowlist with no identity columns', () => {
  const row = toOpenDailyRow(RAW_DAILY_ROW);

  assert.deepEqual(Object.keys(row).sort(), [
    'handle',
    'privacy_enabled',
    'total_time',
    'total_tries',
    'word_statuses',
    'words_found',
  ]);
  assertNoIdentityKeys(row);
  assert.equal(row.handle, 'neo');
  assert.equal(row.global_opt_in, undefined);
  assert.equal(row.is_guest, undefined);
});

test('open period projection is an allowlist with no identity columns', () => {
  const row = toOpenPeriodRow(RAW_PERIOD_ROW);

  assertNoIdentityKeys(row);
  assert.equal(row.handle, 'neo');
  assert.equal(row.rank, 4);
  assert.equal(row.qualified, true);
  assert.equal(row.score, 70.1);
});

test('42 period rows are returned untouched, privacy_enabled included', () => {
  const rows = [RAW_PERIOD_ROW];

  assert.equal(projectPeriodRows('42', rows), rows); // same reference, no copy
  assert.equal(projectPeriodRows('42', rows)[0].privacy_enabled, false);

  const [open] = projectPeriodRows('open', rows);
  assert.equal(open.login, undefined);
  assert.equal(open.privacy_enabled, false);
});

test('open word-times projection is the allowlist and nothing else', () => {
  const raw = {
    word_result_id: 'wr-1',
    word_id: 3,
    order_index: 2,
    length: 5,
    status: 'solved',
    nb_tries: 3,
    time_seconds: 40.2,
  };

  const row = toOpenWordTimesRows([raw])[0];

  assert.deepEqual(Object.keys(row).sort(), [
    'length',
    'nb_tries',
    'order_index',
    'status',
    'time_seconds',
  ]);
  for (const key of OPEN_FORBIDDEN_KEYS) {
    assert.equal(key in row, false, `word-times payload must not contain ${key}`);
  }
});

// Shape of what fetchPeriodRows really returns: the RPC columns
// (user_id, login, display_name, avatar_url, stats..., qualified, handle,
// privacy_enabled) with `rank` added by rankRows(). No is_guest.
const RPC_PERIOD_ROW = {
  user_id: '00000000-0000-0000-0000-000000000001',
  login: 'intra_login',
  display_name: 'Intra Name',
  avatar_url: 'https://example.test/a.jpg',
  days_complete: 12,
  words_started: 60,
  words_solved: 55,
  solve_rate: 91.7,
  avg_tries: 3.4,
  median_time: 45.6,
  median_cost: 78.9,
  score: 70.1,
  qualified: true,
  handle: 'neo',
  privacy_enabled: false,
};

test('projectPeriodRows works on realistic fetchPeriodRows output', () => {
  const ranked = [{ ...RPC_PERIOD_ROW, rank: 2 }];

  const [row] = projectPeriodRows('open', ranked);

  assert.equal(row.handle, 'neo');
  assert.equal(row.rank, 2);
  assert.equal(row.qualified, true);
  assert.equal(row.privacy_enabled, false);
  assert.notEqual(row.privacy_enabled, undefined);
  assertNoIdentityKeys(row);
});

test('cached open payloads stay identity-free', () => {
  const rows = [RAW_DAILY_ROW, RAW_PERIOD_ROW].map(toOpenDailyRow);

  setCachedLeaderboard(DATE, 'open', rows);
  const cached = getCachedLeaderboard(DATE, 'open');

  assert.equal(cached.length, 2);
  for (const row of cached) assertNoIdentityKeys(row);

  // The 42 cache is a separate key.
  assert.equal(getCachedLeaderboard(DATE, '42'), null);
});

test('invalidateScope clears one scope only', () => {
  setCachedLeaderboard(DATE, '42', [{ user_id: 'x' }]);
  setCachedLeaderboard(DATE, 'open', [toOpenDailyRow(RAW_DAILY_ROW)]);

  invalidateScope('open');

  assert.equal(getCachedLeaderboard(DATE, 'open'), null);
  assert.deepEqual(getCachedLeaderboard(DATE, '42'), [{ user_id: 'x' }]);
});

test('invalidateLeaderboard clears both scopes for that date', () => {
  setCachedLeaderboard(DATE, '42', [{ user_id: 'x' }]);
  setCachedLeaderboard(DATE, 'open', [toOpenDailyRow(RAW_DAILY_ROW)]);

  invalidateLeaderboard(DATE);

  assert.equal(getCachedLeaderboard(DATE, '42'), null);
  assert.equal(getCachedLeaderboard(DATE, 'open'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ??= 'test-secret';
process.env.FORTYTWO_CLIENT_ID ??= 'test';
process.env.FORTYTWO_CLIENT_SECRET ??= 'test';
process.env.FORTYTWO_CALLBACK_URL ??= 'http://localhost/callback';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';

const { default: Fastify } = await import('fastify');
const { default: authPlugin } = await import('../src/plugins/auth-plugin.js');
const { default: leaderboardRoutes } = await import('../src/routes/leaderboard.js');
const { invalidateAllLeaderboards, setCachedLeaderboard } = await import(
  '../src/lib/leaderboardCache.js'
);

const PAST = '2026-11-20';

const NON_MEMBER = { id: 'u-nonmember', login: 'intra', is_guest: false, global_opt_in: false, privacy_enabled: false };
const MEMBER = { id: 'u-member', login: 'member', is_guest: false, global_opt_in: true, privacy_enabled: false };
const GUEST = { id: 'u-guest', login: 'guest_ab12cd34', is_guest: true, global_opt_in: true, privacy_enabled: false };
const TARGET = { id: 'u-open', handle: 'neo', privacy_enabled: false, global_opt_in: true };

const WORDS = [{ id: 1, order_index: 1, draw_date: PAST, length: 5 }];
const RESULTS = [{ id: 'wr-1', user_id: 'u-open', word_id: 1, status: 'solved', nb_tries: 3 }];
const GUESSES = [
  {
    word_result_id: 'wr-1',
    guess: 'crane',
    feedback: ['absent', 'present', 'absent', 'absent', 'absent'],
    created_at: '2026-11-20T10:00:00Z',
  },
];

function createFakeDb({ failUsers = false } = {}) {
  const tables = {
    users: [NON_MEMBER, MEMBER, GUEST, TARGET],
    words: WORDS,
    word_results: RESULTS,
    guesses: GUESSES,
    leaderboard_open: [],
    leaderboard: [],
  };

  const project = (row, columns) => {
    if (!columns || columns === '*') return { ...row };
    return Object.fromEntries(
      columns.split(',').map((column) => column.trim()).filter(Boolean)
        .map((column) => [column, row[column]])
    );
  };

  const select = (table, filters, columns) =>
    (tables[table] ?? []).filter((row) => filters.every((matches) => matches(row)))
      .map((row) => project(row, columns));

  const broken = { data: null, error: { message: 'lookup failed' } };

  return {
    rpc: async () => ({ data: [], error: null }),
    from(table) {
      if (table === 'users' && failUsers) {
        const failing = {
          select: () => failing,
          eq: () => failing,
          maybeSingle: async () => broken,
          then: (ok, ko) => Promise.resolve(broken).then(ok, ko),
        };
        return failing;
      }

      const filters = [];
      let columns = null;
      const builder = {
        select: (value) => {
          columns = value;
          return builder;
        },
        eq: (column, value) => {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in: (column, values) => {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        not: () => builder,
        order: () => builder,
        maybeSingle: async () => ({ data: select(table, filters, columns)[0] ?? null, error: null }),
        then: (onFulfilled, onRejected) =>
          Promise.resolve({ data: select(table, filters, columns), error: null }).then(onFulfilled, onRejected),
      };
      return builder;
    },
  };
}

async function buildApp(t, db) {
  const app = Fastify();
  await app.register(authPlugin);
  await app.register(leaderboardRoutes, { db });
  await app.ready();
  t.after(() => app.close());
  return app;
}

const realHeaders = (app, user) => ({
  authorization: `Bearer ${app.issueSession({ id: user.id, login: user.login })}`,
});
const guestHeaders = (app, user) => ({
  authorization: `Bearer ${app.issueGuestSession({ id: user.id, login: user.login })}`,
});

const OPEN_URLS = [
  ['daily', `/api/leaderboard?scope=open&date=${PAST}`],
  ['monthly', '/api/leaderboard/monthly?scope=open'],
  ['global', '/api/leaderboard/global?scope=open'],
  ['word-times', `/api/leaderboard/word-times?scope=open&handle=neo&date=${PAST}`],
  ['word-guesses', `/api/leaderboard/word-guesses?scope=open&handle=neo&date=${PAST}&order=1`],
];

test('a 42 player who has not joined gets join_required on all five open endpoints', async (t) => {
  const app = await buildApp(t, createFakeDb());
  const headers = realHeaders(app, NON_MEMBER);

  for (const [name, url] of OPEN_URLS) {
    invalidateAllLeaderboards();
    const res = await app.inject({ method: 'GET', url, headers });
    assert.equal(res.statusCode, 403, name);
    assert.deepEqual(res.json(), { error: 'join_required' }, name);
  }
});

test('a joined 42 player gets 200 on all five open endpoints', async (t) => {
  const app = await buildApp(t, createFakeDb());
  const headers = realHeaders(app, MEMBER);

  for (const [name, url] of OPEN_URLS) {
    invalidateAllLeaderboards();
    const res = await app.inject({ method: 'GET', url, headers });
    assert.equal(res.statusCode, 200, `${name}: ${res.payload}`);
  }
});

test('a guest gets 200 on all five open endpoints', async (t) => {
  const app = await buildApp(t, createFakeDb());
  const headers = guestHeaders(app, GUEST);

  for (const [name, url] of OPEN_URLS) {
    invalidateAllLeaderboards();
    const res = await app.inject({ method: 'GET', url, headers });
    assert.equal(res.statusCode, 200, `${name}: ${res.payload}`);
  }
});

test('scope=42 is not gated by open membership', async (t) => {
  const app = await buildApp(t, createFakeDb());
  const headers = realHeaders(app, NON_MEMBER);

  const urls = [
    `/api/leaderboard?scope=42&date=${PAST}`,
    '/api/leaderboard/monthly?scope=42',
    '/api/leaderboard/global?scope=42',
    `/api/leaderboard/word-times?scope=42&userId=${NON_MEMBER.id}&date=${PAST}`,
  ];

  for (const url of urls) {
    invalidateAllLeaderboards();
    const res = await app.inject({ method: 'GET', url, headers });
    assert.equal(res.statusCode, 200, `${url}: ${res.payload}`);
  }
});

test('a membership lookup failure is a 500, never data', async (t) => {
  const app = await buildApp(t, createFakeDb({ failUsers: true }));
  const headers = realHeaders(app, MEMBER);

  for (const [name, url] of OPEN_URLS) {
    invalidateAllLeaderboards();
    const res = await app.inject({ method: 'GET', url, headers });
    assert.equal(res.statusCode, 500, name);
    assert.equal(res.json().rows, undefined, name);
  }
});

test('a cached payload is never served to a non-member', async (t) => {
  const app = await buildApp(t, createFakeDb());

  invalidateAllLeaderboards();
  setCachedLeaderboard(PAST, 'open', [{ handle: 'stale' }]);

  const res = await app.inject({
    method: 'GET',
    url: `/api/leaderboard?scope=open&date=${PAST}`,
    headers: realHeaders(app, NON_MEMBER),
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.json(), { error: 'join_required' });
});

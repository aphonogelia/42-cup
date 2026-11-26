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
const { makeWordGuessesHandler, WORD_GUESSES_SCHEMA } = await import('../src/routes/leaderboard.js');
const { getBerlinDateKey } = await import('../src/lib/dailyDraw.js');

const PAST = '2026-11-20';
const PAST_CACHED = '2026-11-19';
const TODAY = getBerlinDateKey();

const USERS = [
  { id: 'u-open', handle: 'neo', privacy_enabled: false, global_opt_in: true },
  { id: 'u-private', handle: 'trinity', privacy_enabled: true, global_opt_in: true },
  { id: 'u-unlisted', handle: 'morpheus', privacy_enabled: false, global_opt_in: false },
];

const WORDS = [
  { id: 1, order_index: 1, draw_date: PAST, length: 5 },
  { id: 2, order_index: 2, draw_date: PAST, length: 5 },
  { id: 3, order_index: 1, draw_date: PAST_CACHED, length: 5 },
  { id: 11, order_index: 1, draw_date: TODAY, length: 5 },
];

const RESULTS = [
  { id: 'wr-1', user_id: 'u-open', word_id: 1, status: 'solved', nb_tries: 3 },
  { id: 'wr-3', user_id: 'u-open', word_id: 3, status: 'solved', nb_tries: 2 },
  { id: 'wr-11', user_id: 'u-open', word_id: 11, status: 'solved', nb_tries: 4 },
  { id: 'wr-p', user_id: 'u-private', word_id: 1, status: 'solved', nb_tries: 5 },
];

const GUESSES = [
  { word_result_id: 'wr-1', guess: 'crane', feedback: ['absent', 'present', 'absent', 'absent', 'absent'], created_at: '2026-11-20T10:00:00Z' },
  { word_result_id: 'wr-1', guess: 'pride', feedback: ['correct', 'correct', 'correct', 'correct', 'correct'], created_at: '2026-11-20T10:01:00Z' },
  { word_result_id: 'wr-3', guess: 'adieu', feedback: ['absent', 'absent', 'absent', 'absent', 'absent'], created_at: '2026-11-19T10:00:00Z' },
  { word_result_id: 'wr-11', guess: 'slate', feedback: ['absent', 'absent', 'absent', 'absent', 'absent'], created_at: '2026-11-26T10:00:00Z' },
];

function createFakeDb() {
  const tables = { users: USERS, words: WORDS, word_results: RESULTS, guesses: GUESSES };
  let guessQueries = 0;

  const project = (row, columns) => {
    if (!columns || columns === '*') return { ...row };
    return Object.fromEntries(
      columns.split(',').map((column) => column.trim()).filter(Boolean).map((column) => [column, row[column]])
    );
  };

  const select = (table, filters, columns) =>
    (tables[table] ?? []).filter((row) => filters.every((matches) => matches(row)))
      .map((row) => project(row, columns));

  return {
    get guessQueries() {
      return guessQueries;
    },
    from(table) {
      if (table === 'guesses') guessQueries += 1;
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
        order: () => builder,
        maybeSingle: async () => ({ data: select(table, filters, columns)[0] ?? null, error: null }),
        then: (onFulfilled, onRejected) =>
          Promise.resolve({ data: select(table, filters, columns), error: null }).then(onFulfilled, onRejected),
      };
      return builder;
    },
  };
}

async function buildApp(t, { db = createFakeDb(), hasCompleted = async () => true } = {}) {
  const app = Fastify();
  await app.register(authPlugin);
  app.get(
    '/word-guesses',
    { preHandler: [app.requireAuth], schema: WORD_GUESSES_SCHEMA },
    makeWordGuessesHandler({ db, hasCompleted })
  );
  await app.ready();
  t.after(() => app.close());
  return { app, db };
}

const guestHeaders = (app) => ({
  authorization: `Bearer ${app.issueGuestSession({ id: 'g-1', login: 'guest_ab12cd34' })}`,
});
const realHeaders = (app) => ({
  authorization: `Bearer ${app.issueSession({ id: 'r-1', login: 'real_login' })}`,
});

const url = (params) => `/word-guesses?${new URLSearchParams(params)}`;

test('the payload is an allowlist with no id of any kind', async (t) => {
  const { app } = await buildApp(t);

  const res = await app.inject({
    method: 'GET',
    url: url({ scope: 'open', handle: 'neo', date: PAST, order: '1' }),
    headers: realHeaders(app),
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.deepEqual(Object.keys(body), ['guesses']);
  assert.equal(body.guesses.length, 2);
  for (const guess of body.guesses) {
    assert.deepEqual(Object.keys(guess).sort(), ['created_at', 'feedback', 'guess']);
  }

  for (const forbidden of ['word_result_id', 'wr-1', 'u-open', 'word_id', 'submission']) {
    assert.equal(res.payload.includes(forbidden), false, `payload leaked ${forbidden}`);
  }
});

test('privacy on hides the open guesses', async (t) => {
  const { app } = await buildApp(t);

  const res = await app.inject({
    method: 'GET',
    url: url({ scope: 'open', handle: 'trinity', date: PAST, order: '1' }),
    headers: guestHeaders(app),
  });

  assert.equal(res.statusCode, 403);
});

test("today's guesses stay hidden until the viewer finished today", async (t) => {
  const blocked = await buildApp(t, { hasCompleted: async () => false });
  const resBlocked = await blocked.app.inject({
    method: 'GET',
    url: url({ scope: 'open', handle: 'neo', date: TODAY, order: '1' }),
    headers: realHeaders(blocked.app),
  });
  assert.equal(resBlocked.statusCode, 403);
  assert.deepEqual(resBlocked.json(), { error: "Finish today's words to view guesses" });

  const allowed = await buildApp(t, { hasCompleted: async () => true });
  const resAllowed = await allowed.app.inject({
    method: 'GET',
    url: url({ scope: 'open', handle: 'neo', date: TODAY, order: '1' }),
    headers: realHeaders(allowed.app),
  });
  assert.equal(resAllowed.statusCode, 200);
});

test('a guest who finished today can read the guesses', async (t) => {
  const { app } = await buildApp(t, { hasCompleted: async () => true });

  const res = await app.inject({
    method: 'GET',
    url: url({ scope: 'open', handle: 'neo', date: TODAY, order: '1' }),
    headers: guestHeaders(app),
  });

  assert.equal(res.statusCode, 200);
});

test('an unknown handle and an unlisted user are the same 404', async (t) => {
  const { app } = await buildApp(t);
  const headers = realHeaders(app);

  const unknown = await app.inject({
    method: 'GET',
    url: url({ scope: 'open', handle: 'ghost', date: PAST, order: '1' }),
    headers,
  });
  const unlisted = await app.inject({
    method: 'GET',
    url: url({ scope: 'open', handle: 'morpheus', date: PAST, order: '1' }),
    headers,
  });

  assert.equal(unknown.statusCode, 404);
  assert.equal(unlisted.statusCode, 404);
  assert.deepEqual(unknown.json(), unlisted.json());
});

test('an unknown position is a 404', async (t) => {
  const { app } = await buildApp(t);

  const res = await app.inject({
    method: 'GET',
    url: url({ scope: 'open', handle: 'neo', date: PAST, order: '2' }),
    headers: realHeaders(app),
  });

  assert.equal(res.statusCode, 404);
});

test('scope=42 is rejected: the 42 popup keeps its own route', async (t) => {
  const { app } = await buildApp(t);

  const res = await app.inject({
    method: 'GET',
    url: url({ scope: '42', handle: 'neo', date: PAST, order: '1' }),
    headers: realHeaders(app),
  });

  assert.equal(res.statusCode, 400);
});

test('finished words are cached, so a second request skips the guesses query', async (t) => {
  const db = createFakeDb();
  const { app } = await buildApp(t, { db });
  const headers = realHeaders(app);
  const request = {
    method: 'GET',
    url: url({ scope: 'open', handle: 'neo', date: PAST_CACHED, order: '1' }),
    headers,
  };

  await app.inject(request);
  const queriesAfterFirst = db.guessQueries;
  await app.inject(request);

  assert.equal(queriesAfterFirst, 1);
  assert.equal(db.guessQueries, 1);
});

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
const { makeWordTimesHandler, WORD_TIMES_SCHEMA } = await import('../src/routes/leaderboard.js');

const DATE = '2026-11-25';

const USERS = [
  { id: 'u-open', handle: 'neo', privacy_enabled: false, global_opt_in: true },
  { id: 'u-private', handle: 'trinity', privacy_enabled: true, global_opt_in: true },
  { id: 'u-unlisted', handle: 'morpheus', privacy_enabled: false, global_opt_in: false },
  { id: 'u-42', handle: null, privacy_enabled: false, global_opt_in: false },
];

const WORDS = [
  { id: 1, order_index: 1, length: 5, draw_date: DATE },
  { id: 2, order_index: 2, length: 5, draw_date: DATE },
];

const RESULTS = [
  { id: 'wr-open-1', user_id: 'u-open', word_id: 1, status: 'solved', nb_tries: 3, time_seconds: 40.2 },
  { id: 'wr-open-2', user_id: 'u-open', word_id: 2, status: 'failed', nb_tries: 6, time_seconds: 120 },
  { id: 'wr-42-1', user_id: 'u-42', word_id: 1, status: 'solved', nb_tries: 4, time_seconds: 55 },
];

// Minimal PostgREST stand-in: the subset of the query builder the route uses.
function createFakeDb() {
  const tables = { users: USERS, words: WORDS, word_results: RESULTS };

  const select = (table, filters) =>
    (tables[table] ?? []).filter((row) => filters.every((matches) => matches(row)));

  return {
    from(table) {
      const filters = [];
      const builder = {
        select: () => builder,
        eq: (column, value) => {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in: (column, values) => {
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        order: () => builder,
        maybeSingle: async () => ({ data: select(table, filters)[0] ?? null, error: null }),
        then: (onFulfilled, onRejected) =>
          Promise.resolve({ data: select(table, filters), error: null }).then(onFulfilled, onRejected),
      };
      return builder;
    },
  };
}

async function buildApp(t) {
  const app = Fastify();
  await app.register(authPlugin);
  app.get(
    '/word-times',
    { preHandler: [app.requireAuth], schema: WORD_TIMES_SCHEMA },
    makeWordTimesHandler(createFakeDb())
  );
  await app.ready();
  t.after(() => app.close());
  return app;
}

const guestHeaders = (app) => ({
  authorization: `Bearer ${app.issueGuestSession({ id: 'g-1', login: 'guest_ab12cd34' })}`,
});
const realHeaders = (app) => ({
  authorization: `Bearer ${app.issueSession({ id: 'r-1', login: 'real_login' })}`,
});

test('a guest can read an open player word-times, with an allowlisted payload', async (t) => {
  const app = await buildApp(t);
  const res = await app.inject({
    method: 'GET',
    url: `/word-times?scope=open&handle=neo&date=${DATE}`,
    headers: guestHeaders(app),
  });

  assert.equal(res.statusCode, 200);

  const body = res.json();
  assert.deepEqual(Object.keys(body).sort(), ['date', 'handle', 'words']);
  assert.equal(body.handle, 'neo');
  assert.equal(body.words.length, 2);

  for (const word of body.words) {
    assert.deepEqual(Object.keys(word).sort(), [
      'length',
      'nb_tries',
      'order_index',
      'status',
      'time_seconds',
    ]);
  }

  // No id of any kind, so an open handle cannot be matched to a login.
  for (const forbidden of ['userId', 'u-open', 'wr-open-1', 'word_result_id', 'login', 'avatar']) {
    assert.equal(res.payload.includes(forbidden), false, `payload leaked ${forbidden}`);
  }
});

test('a guest gets 403 on scope=42', async (t) => {
  const app = await buildApp(t);
  const res = await app.inject({
    method: 'GET',
    url: `/word-times?scope=42&userId=u-42&date=${DATE}`,
    headers: guestHeaders(app),
  });

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.json(), { error: 'login_required' });
});

test('privacy on hides the open popup', async (t) => {
  const app = await buildApp(t);
  const res = await app.inject({
    method: 'GET',
    url: `/word-times?scope=open&handle=trinity&date=${DATE}`,
    headers: guestHeaders(app),
  });

  assert.equal(res.statusCode, 403);
});

test('privacy on hides the 42 popup too', async (t) => {
  const app = await buildApp(t);
  const res = await app.inject({
    method: 'GET',
    url: `/word-times?scope=42&userId=u-private&date=${DATE}`,
    headers: realHeaders(app),
  });

  assert.equal(res.statusCode, 403);
});

test('an unknown handle and a user who is not on the open board are the same 404', async (t) => {
  const app = await buildApp(t);
  const headers = guestHeaders(app);

  const unknown = await app.inject({
    method: 'GET',
    url: `/word-times?scope=open&handle=ghost&date=${DATE}`,
    headers,
  });
  const unlisted = await app.inject({
    method: 'GET',
    url: `/word-times?scope=open&handle=morpheus&date=${DATE}`,
    headers,
  });

  assert.equal(unknown.statusCode, 404);
  assert.equal(unlisted.statusCode, 404);
  assert.deepEqual(unknown.json(), unlisted.json());
});

test('scope=42 still returns userId and word_result_id', async (t) => {
  const app = await buildApp(t);
  const res = await app.inject({
    method: 'GET',
    url: `/word-times?scope=42&userId=u-42&date=${DATE}`,
    headers: realHeaders(app),
  });

  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.userId, 'u-42');
  assert.equal(body.words[0].word_result_id, 'wr-42-1');
});

test('privacy off makes an open guest readable, privacy on hides it again', async (t) => {
  const app = await buildApp(t);
  const headers = guestHeaders(app);
  const guest = USERS.find((user) => user.id === 'u-open');

  const readable = await app.inject({
    method: 'GET',
    url: `/word-times?scope=open&handle=neo&date=${DATE}`,
    headers,
  });
  assert.equal(readable.statusCode, 200);

  guest.privacy_enabled = true;
  const hidden = await app.inject({
    method: 'GET',
    url: `/word-times?scope=open&handle=neo&date=${DATE}`,
    headers,
  });
  assert.equal(hidden.statusCode, 403);

  guest.privacy_enabled = false;
  const readableAgain = await app.inject({
    method: 'GET',
    url: `/word-times?scope=open&handle=neo&date=${DATE}`,
    headers,
  });
  assert.equal(readableAgain.statusCode, 200);
});

test('missing parameters and unknown scopes are 400', async (t) => {
  const app = await buildApp(t);
  const headers = guestHeaders(app);

  const noHandle = await app.inject({ url: `/word-times?scope=open&date=${DATE}`, headers });
  assert.equal(noHandle.statusCode, 400);

  const badScope = await app.inject({ url: `/word-times?scope=global&date=${DATE}`, headers });
  assert.equal(badScope.statusCode, 400);
});

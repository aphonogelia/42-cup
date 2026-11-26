import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Routes import the Supabase client (side effect: config.js validates env).
// Stub it before the dynamic imports. Nothing here reaches the network: the
// assertions stop before the handlers query the database.
process.env.JWT_SECRET ??= 'test-secret';
process.env.FORTYTWO_CLIENT_ID ??= 'test';
process.env.FORTYTWO_CLIENT_SECRET ??= 'test';
process.env.FORTYTWO_CALLBACK_URL ??= 'http://localhost/callback';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';

const { default: Fastify } = await import('fastify');
const { default: rateLimit } = await import('@fastify/rate-limit');
const { default: authPlugin } = await import('../src/plugins/auth-plugin.js');
const { default: leaderboardRoutes } = await import('../src/routes/leaderboard.js');
const { default: handleRoutes } = await import('../src/routes/handles.js');

const GUEST = { id: '00000000-0000-0000-0000-00000000000a', login: 'guest_ab12cd34' };

async function buildApp(t) {
  const app = Fastify();
  await app.register(authPlugin);
  // global:false -> only routes that declare config.rateLimit are limited.
  await app.register(rateLimit, { global: false });
  await app.register(leaderboardRoutes);
  await app.register(handleRoutes);
  await app.ready();
  t.after(() => app.close());
  return app;
}

test('a guest gets 403 on every scope=42 board', async (t) => {
  const app = await buildApp(t);
  const headers = { authorization: `Bearer ${app.issueGuestSession(GUEST)}` };

  const urls = [
    '/api/leaderboard?scope=42',
    '/api/leaderboard/monthly?scope=42',
    '/api/leaderboard/global?scope=42',
  ];

  for (const url of urls) {
    const res = await app.inject({ method: 'GET', url, headers });
    assert.equal(res.statusCode, 403, url);
    assert.deepEqual(res.json(), { error: 'login_required' }, url);
  }
});

test('scope defaults to 42, so a guest gets 403 without the parameter too', async (t) => {
  const app = await buildApp(t);
  const headers = { authorization: `Bearer ${app.issueGuestSession(GUEST)}` };

  const res = await app.inject({ method: 'GET', url: '/api/leaderboard/monthly', headers });
  assert.equal(res.statusCode, 403);
});

test('an unknown scope is a 400 with a readable body', async (t) => {
  const app = await buildApp(t);
  const headers = { authorization: `Bearer ${app.issueGuestSession(GUEST)}` };

  const res = await app.inject({ method: 'GET', url: '/api/leaderboard?scope=global', headers });
  assert.equal(res.statusCode, 400);

  const body = res.json();
  assert.notEqual(body.error, 'Bad Request');
  assert.match(body.error, /scope/);

  // An empty scope is a validation error (the schema has no fallback for '').
  const empty = await app.inject({ method: 'GET', url: '/api/leaderboard?scope=', headers });
  assert.equal(empty.statusCode, 400);
});

test('the 31st handle-availability check in a minute is rate limited', async (t) => {
  const app = await buildApp(t);
  const headers = { authorization: `Bearer ${app.issueGuestSession(GUEST)}` };

  // No ?h= -> 400 from validateHandle, before any database call.
  for (let i = 0; i < 30; i++) {
    const res = await app.inject({ method: 'GET', url: '/api/me/handle-available', headers });
    assert.equal(res.statusCode, 400, `request ${i + 1}`);
  }

  const limited = await app.inject({ method: 'GET', url: '/api/me/handle-available', headers });
  assert.equal(limited.statusCode, 429);

  // The limiter is an onRequest hook: a request the schema would reject is
  // still counted (and rejected by the limiter first).
  const invalid = await app.inject({
    method: 'GET',
    url: `/api/me/handle-available?h=${'a'.repeat(70)}`,
    headers,
  });
  assert.equal(invalid.statusCode, 429);
});

// The cheat gate is asserted on the source because the call needs a DB.
// Manual data-level check: backend/README.md, "Manual checks".
test('the cheat check is not skipped for guests', async () => {
  const source = await readFile(new URL('../src/routes/game.js', import.meta.url), 'utf8');

  assert.equal(source.includes('request.user.guest'), false);
  assert.match(
    source,
    /outcome === 'accepted' && \(updated\.status === 'solved' \|\| updated\.status === 'failed'\)/
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ??= 'test-secret';
process.env.FORTYTWO_CLIENT_ID ??= 'test';
process.env.FORTYTWO_CLIENT_SECRET ??= 'test';
process.env.FORTYTWO_CALLBACK_URL ??= 'http://localhost/callback';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';

const { default: Fastify } = await import('fastify');
const { default: rateLimit } = await import('@fastify/rate-limit');
const { default: authPlugin } = await import('../src/plugins/auth-plugin.js');
const { installSchemaErrors } = await import('../src/lib/schemaErrors.js');
const { default: handleRoutes } = await import('../src/routes/handles.js');

function createLogCapture() {
  const lines = [];
  return { lines, stream: { write: (line) => lines.push(line) } };
}

test('a 5xx is logged before the reply is sent', async (t) => {
  const capture = createLogCapture();
  const app = Fastify({ logger: { level: 'error', stream: capture.stream } });
  installSchemaErrors(app);
  app.get('/boom', async () => {
    throw new Error('explode');
  });
  await app.ready();
  t.after(() => app.close());

  const res = await app.inject({ method: 'GET', url: '/boom' });

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.json(), {
    statusCode: 500,
    error: 'Internal Server Error',
    message: 'explode',
  });

  const errorLines = capture.lines.filter((line) => line.includes('"level":50'));
  assert.equal(errorLines.length, 1);
  assert.match(errorLines[0], /explode/);
});

test('a 429 from the rate limiter is not logged as an error', async (t) => {
  const capture = createLogCapture();
  const app = Fastify({ logger: { level: 'error', stream: capture.stream } });
  await app.register(authPlugin);
  await app.register(rateLimit, { global: false });
  await app.register(handleRoutes);
  await app.ready();
  t.after(() => app.close());

  const headers = {
    authorization: `Bearer ${app.issueGuestSession({ id: 'g-1', login: 'guest_ab12cd34' })}`,
  };

  for (let i = 0; i < 30; i++) {
    const res = await app.inject({ method: 'GET', url: '/api/me/handle-available', headers });
    assert.equal(res.statusCode, 400, `request ${i + 1}`);
  }

  const limited = await app.inject({ method: 'GET', url: '/api/me/handle-available', headers });
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(capture.lines, []);
});

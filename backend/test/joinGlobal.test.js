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
const { makeJoinGlobalHandler, JOIN_GLOBAL_SCHEMA } = await import('../src/routes/handles.js');

// SELECTs read a snapshot taken at creation (what a second tab has in memory),
// UPDATEs hit the live rows and honour the guard filters, so both requests
// decide on the same stale state and only the conditional write can separate them.
function createFakeDb(initialRows) {
  const live = initialRows.map((row) => ({ ...row }));
  const snapshot = initialRows.map((row) => ({ ...row }));

  const matches = (row, filters) => filters.every((fn) => fn(row));

  return {
    rows: live,
    from() {
      let patch = null;
      const filters = [];
      const builder = {
        select: () => builder,
        update: (values) => {
          patch = values;
          return builder;
        },
        eq: (column, value) => {
          filters.push((row) => row[column] === value);
          return builder;
        },
        is: (column, value) => {
          filters.push((row) => (row[column] ?? null) === value);
          return builder;
        },
        order: () => builder,
        maybeSingle: async () => run(),
        single: async () => {
          const result = await run();
          return result.data ? result : { data: null, error: { message: 'not found' } };
        },
        then: (onFulfilled, onRejected) => run().then(onFulfilled, onRejected),
      };

      function run() {
        const source = patch ? live : snapshot;
        const matched = source.filter((row) => matches(row, filters));

        if (patch) {
          if (matched.length === 0) return Promise.resolve({ data: null, error: null });
          Object.assign(matched[0], patch);
          return Promise.resolve({ data: { ...matched[0] }, error: null });
        }

        return Promise.resolve({ data: matched[0] ?? null, error: null });
      }

      return builder;
    },
  };
}

const JOINING_42 = {
  id: 'u-42',
  login: 'intra',
  is_guest: false,
  handle: null,
  global_opt_in: false,
  handle_changed_at: null,
};

const GUEST = {
  id: 'g-1',
  login: 'guest_ab12cd34',
  is_guest: true,
  handle: 'guest_ab12cd34',
  global_opt_in: true,
  handle_changed_at: null,
};

async function buildApp(t, db) {
  const app = Fastify();
  await app.register(authPlugin);
  app.put(
    '/api/me/global',
    { preHandler: [app.requireAuth], schema: JOIN_GLOBAL_SCHEMA },
    makeJoinGlobalHandler({ db, isHandleFree: async () => true })
  );
  await app.ready();
  t.after(() => app.close());
  return app;
}

const headersFor = (app, user) => ({
  authorization: `Bearer ${app.issueSession({ id: user.id, login: user.login })}`,
});

test('two joins at once: only the first one wins', async (t) => {
  const db = createFakeDb([JOINING_42]);
  const app = await buildApp(t, db);
  const headers = headersFor(app, JOINING_42);

  const first = await app.inject({
    method: 'PUT',
    url: '/api/me/global',
    headers,
    payload: { handle: 'neo' },
  });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().handle, 'neo');

  // Same stale read (global_opt_in false), different handle.
  const second = await app.inject({
    method: 'PUT',
    url: '/api/me/global',
    headers,
    payload: { handle: 'trinity' },
  });

  assert.equal(second.statusCode, 409);
  assert.deepEqual(second.json(), { error: "Handles can't be changed once set", locked: true });
  assert.equal(db.rows[0].handle, 'neo');
  assert.equal(db.rows[0].global_opt_in, true);
});

test('two guest changes at once: only the first one wins', async (t) => {
  const db = createFakeDb([GUEST]);
  const app = await buildApp(t, db);
  const headers = headersFor(app, GUEST);

  const first = await app.inject({
    method: 'PUT',
    url: '/api/me/global',
    headers,
    payload: { handle: 'neo' },
  });
  assert.equal(first.statusCode, 200);
  assert.ok(first.json().handle_changed_at);

  // The second tab still sees handle_changed_at = null.
  const second = await app.inject({
    method: 'PUT',
    url: '/api/me/global',
    headers,
    payload: { handle: 'trinity' },
  });

  assert.equal(second.statusCode, 409);
  assert.equal(second.json().locked, true);
  assert.equal(db.rows[0].handle, 'neo');
});

test('a stale case-only change cannot overwrite a real change', async (t) => {
  const db = createFakeDb([GUEST]);
  const app = await buildApp(t, db);
  const headers = headersFor(app, GUEST);

  // Tab B spends the guest's one change.
  const real = await app.inject({
    method: 'PUT',
    url: '/api/me/global',
    headers,
    payload: { handle: 'neo' },
  });
  assert.equal(real.statusCode, 200);
  assert.equal(db.rows[0].handle, 'neo');

  // Tab A still holds guest_ab12cd34, so it decided "case-only". It must not
  // apply on top of the real change.
  const stale = await app.inject({
    method: 'PUT',
    url: '/api/me/global',
    headers,
    payload: { handle: 'Guest_ab12cd34' },
  });

  assert.equal(stale.statusCode, 409);
  assert.deepEqual(stale.json(), { error: "Handles can't be changed once set", locked: true });
  assert.equal(db.rows[0].handle, 'neo');
  assert.equal(db.rows[0].handle_changed_at, real.json().handle_changed_at);
});

test('a case-only change still succeeds after the lock, without touching handle_changed_at', async (t) => {
  const locked = { ...GUEST, handle: 'neo', handle_changed_at: '2026-11-01T12:00:00.000Z' };
  const db = createFakeDb([locked]);
  const app = await buildApp(t, db);

  const res = await app.inject({
    method: 'PUT',
    url: '/api/me/global',
    headers: headersFor(app, locked),
    payload: { handle: 'NEO' },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json().handle, 'NEO');
  assert.equal(db.rows[0].handle, 'NEO');
  assert.equal(db.rows[0].handle_changed_at, locked.handle_changed_at);
});

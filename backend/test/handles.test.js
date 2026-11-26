import test from 'node:test';
import assert from 'node:assert/strict';

// handles.js imports the Supabase client (for handle_available), which imports
// config.js, which throws on missing env at import time. Fill the env before the
// dynamic import; no request is ever made by these tests.
process.env.JWT_SECRET ??= 'test-secret';
process.env.FORTYTWO_CLIENT_ID ??= 'test';
process.env.FORTYTWO_CLIENT_SECRET ??= 'test';
process.env.FORTYTWO_CALLBACK_URL ??= 'http://localhost/callback';
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test';

const { validateHandle, planHandleUpdate, canRename, normalizeForMatch } = await import(
  '../src/lib/handles.js'
);

const LOCKED_AT = '2026-11-01T12:00:00.000Z';

test('handle format: 3-16 chars, letters, digits, - and _', () => {
  assert.equal(validateHandle('ab').error !== undefined, true);
  assert.equal(validateHandle('a b c').error !== undefined, true);
  assert.equal(validateHandle('a'.repeat(17)).error !== undefined, true);
  assert.equal(validateHandle('héllo').error !== undefined, true);
  assert.equal(validateHandle('abc').handle, 'abc');
  assert.equal(validateHandle('a'.repeat(16)).handle, 'a'.repeat(16));
  assert.equal(validateHandle('  neo_42-x  ').handle, 'neo_42-x');
});

test('reserved and blocked words match after normalization', () => {
  for (const bad of ['admin', 'ADMIN', 'Wordel', 'bubar', 'w0r-Del']) {
    assert.ok(validateHandle(bad).error, `${bad} should be rejected`);
  }
  // Entries containing digits are normalized when the lists are built, so they
  // still match: '42' -> 'a2' on both sides.
  for (const bad of ['42', '42Cup', 'W0rdel42', '4-2-berlin']) {
    assert.ok(validateHandle(bad).error, `${bad} should be rejected`);
  }
  for (const bad of ['fuck', 'FuCk', 'f-u-c-k', 'n4zi']) {
    assert.ok(validateHandle(bad).error, `${bad} should be rejected`);
  }
  assert.equal(normalizeForMatch('W0rd-el'), 'wordel');
});

test('guest prefix is reserved for user-chosen handles', () => {
  assert.ok(validateHandle('guest_ab12cd34').error);
  assert.ok(validateHandle('GU3ST_ab12cd34').error);
});

test('joining is allowed and locks the handle', () => {
  const user = { global_opt_in: false, handle: null, handle_changed_at: null };
  const plan = planHandleUpdate(user, 'neo');

  assert.equal(plan.status, undefined);
  assert.equal(plan.joining, true);
  assert.equal(plan.patch.handle, 'neo');
  assert.equal(plan.patch.global_opt_in, true);
  assert.ok(plan.patch.handle_changed_at);
});

test('a guest on the default handle can choose exactly once', () => {
  const user = {
    global_opt_in: true,
    handle: 'guest_ab12cd34',
    handle_changed_at: null,
  };

  const first = planHandleUpdate(user, 'neo');
  assert.equal(first.status, undefined);
  assert.equal(first.joining, false);
  assert.equal(first.patch.handle, 'neo');
  assert.equal(first.patch.global_opt_in, undefined);
  assert.ok(first.patch.handle_changed_at);

  const locked = { ...user, handle: 'neo', handle_changed_at: first.patch.handle_changed_at };
  const second = planHandleUpdate(locked, 'trinity');
  assert.equal(second.status, 409);
  assert.equal(second.locked, true);
  assert.equal(second.error, "Handles can't be changed once set");
});

test('a joined 42 player cannot change the handle', () => {
  const user = { global_opt_in: true, handle: 'neo', handle_changed_at: LOCKED_AT };

  const plan = planHandleUpdate(user, 'trinity');

  assert.equal(plan.status, 409);
  assert.equal(plan.locked, true);
});

test('a case-only change is allowed even on a locked handle', () => {
  const user = { global_opt_in: true, handle: 'neo', handle_changed_at: LOCKED_AT };

  const plan = planHandleUpdate(user, 'Neo');

  assert.equal(plan.status, undefined);
  assert.equal(plan.joining, false);
  assert.deepEqual(plan.patch, { handle: 'Neo' });
  assert.equal('handle_changed_at' in plan.patch, false);
});

test('a guest can change the case of their system handle', () => {
  const user = { global_opt_in: true, handle: 'guest_ab12cd34', handle_changed_at: null };

  const plan = planHandleUpdate(user, 'Guest_ab12cd34');

  assert.equal(plan.status, undefined);
  assert.deepEqual(plan.patch, { handle: 'Guest_ab12cd34' });
});

test('re-sending the exact current handle is a no-op', () => {
  const user = { global_opt_in: true, handle: 'neo', handle_changed_at: LOCKED_AT };

  assert.deepEqual(planHandleUpdate(user, 'neo'), { unchanged: true });
  assert.deepEqual(planHandleUpdate(user, ' neo '), { unchanged: true });
});

test('a case-only change still runs the shape check', () => {
  // Current handle is impossible to set through the API, but the branch must
  // not let an invalid shape through either.
  const plan = planHandleUpdate(
    { global_opt_in: true, handle: 'ab', handle_changed_at: null },
    'AB'
  );

  assert.equal(plan.status, 400);
  assert.ok(plan.error);
});

test('planHandleUpdate rejects an invalid shape with 400', () => {
  const plan = planHandleUpdate({ global_opt_in: false, handle: null }, 'ab');
  assert.equal(plan.status, 400);
  assert.ok(plan.error);
});

test('canRename: null means still settable, any date means locked', () => {
  assert.equal(canRename(null), true);
  assert.equal(canRename(undefined), true);
  assert.equal(canRename(LOCKED_AT), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSubmissionId, SubmissionIdError } from '../src/lib/submissionId.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test('resolveSubmissionId keeps a client supplied UUID', () => {
  const id = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  assert.equal(resolveSubmissionId(id), id);
});

test('resolveSubmissionId normalises case', () => {
  assert.equal(
    resolveSubmissionId('3F2504E0-4F89-41D3-9A0C-0305E82C3301'),
    '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
  );
});

test('resolveSubmissionId generates an id when the client omits one', () => {
  const first = resolveSubmissionId(undefined);
  const second = resolveSubmissionId(null);

  assert.match(first, UUID_RE);
  assert.match(second, UUID_RE);
  assert.notEqual(first, second);
});

test('resolveSubmissionId rejects malformed ids', () => {
  for (const value of ['not-a-uuid', '3f2504e0-4f89-41d3-9a0c', 42, {}]) {
    assert.throws(() => resolveSubmissionId(value), SubmissionIdError);
  }
});

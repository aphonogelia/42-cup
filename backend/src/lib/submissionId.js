import { randomUUID } from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SubmissionIdError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SubmissionIdError';
  }
}

// The frontend owns the id so that a retry can reuse it. A client built before
// idempotency existed sends nothing: accept the guess, just without a retry
// guarantee. A malformed id is a client bug and is rejected.
export function resolveSubmissionId(value) {
  if (value === undefined || value === null || value === '') {
    return randomUUID();
  }
  if (typeof value !== 'string') {
    throw new SubmissionIdError('submission_id must be a UUID');
  }

  const id = value.trim();
  if (!UUID_RE.test(id)) {
    throw new SubmissionIdError('submission_id must be a UUID');
  }

  return id.toLowerCase();
}

// Explicit allowlist for open-scope rows. Identity columns (user_id, login,
// avatar_url) must never reach an open payload, so a handle cannot be joined
// back to an intra login.
export const OPEN_IDENTITY_KEYS = ['user_id', 'login', 'avatar_url'];

const pick = (row, keys) => Object.fromEntries(keys.map((key) => [key, row[key]]));

export const OPEN_DAILY_KEYS = [
  'handle',
  'privacy_enabled',
  'words_found',
  'total_time',
  'total_tries',
  'word_statuses',
];

export const OPEN_PERIOD_KEYS = [
  'handle',
  'privacy_enabled',
  'days_complete',
  'words_started',
  'words_solved',
  'solve_rate',
  'avg_tries',
  'median_time',
  'median_cost',
  'score',
  'qualified',
  'rank',
];

// word_result_id is identical in both scopes: returning it would let a real user
// match an open handle to a login.
export const OPEN_WORD_TIME_KEYS = ['order_index', 'length', 'status', 'nb_tries', 'time_seconds'];
export const OPEN_FORBIDDEN_KEYS = [...OPEN_IDENTITY_KEYS, 'word_result_id', 'word_id'];

export function toOpenDailyRow(row) {
  return pick(row, OPEN_DAILY_KEYS);
}

export function toOpenPeriodRow(row) {
  return pick(row, OPEN_PERIOD_KEYS);
}

export function toOpenWordTimesRow(row) {
  return pick(row, OPEN_WORD_TIME_KEYS);
}

export function toOpenWordTimesRows(rows) {
  return rows.map(toOpenWordTimesRow);
}

export function projectPeriodRows(scope, rows) {
  return scope === 'open' ? rows.map(toOpenPeriodRow) : rows;
}

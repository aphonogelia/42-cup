// Explicit allowlist for open-scope rows. Identity columns (user_id, login,
// display_name, avatar_url) are never copied, so a handle cannot be joined back
// to an intra login through the API. Adding a column to the view does NOT add it
// here: this list is the contract.
export const OPEN_IDENTITY_KEYS = ['user_id', 'login', 'display_name', 'avatar_url'];

export function toOpenDailyRow(row) {
  return {
    handle: row.handle,
    privacy_enabled: row.privacy_enabled,
    words_found: row.words_found,
    total_time: row.total_time,
    total_tries: row.total_tries,
    word_statuses: row.word_statuses,
  };
}

export function toOpenPeriodRow(row) {
  return {
    handle: row.handle,
    privacy_enabled: row.privacy_enabled,
    days_complete: row.days_complete,
    words_started: row.words_started,
    words_solved: row.words_solved,
    solve_rate: row.solve_rate,
    avg_tries: row.avg_tries,
    median_time: row.median_time,
    median_cost: row.median_cost,
    score: row.score,
    qualified: row.qualified,
    rank: row.rank,
  };
}

// Word-times popup. `word_result_id` is deliberately absent: it has the same
// value in both scopes, so returning it would let a real user match an open
// handle to an intra login (fetch the id in scope=42, compare).
export const OPEN_WORD_TIME_KEYS = ['order_index', 'length', 'status', 'nb_tries', 'time_seconds'];
export const OPEN_FORBIDDEN_KEYS = [...OPEN_IDENTITY_KEYS, 'word_result_id', 'word_id'];

export function toOpenWordTimesRow(row) {
  return {
    order_index: row.order_index,
    length: row.length,
    status: row.status,
    nb_tries: row.nb_tries,
    time_seconds: row.time_seconds,
  };
}

export function toOpenWordTimesRows(rows) {
  return rows.map(toOpenWordTimesRow);
}

// The 42 boards keep their payload; only open boards are projected.
export function projectPeriodRows(scope, rows) {
  return scope === 'open' ? rows.map(toOpenPeriodRow) : rows;
}

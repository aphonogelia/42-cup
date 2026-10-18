const leaderboardCache = new Map();
const leaderboardDatesCache = {
    value: null,
    expiresAt: 0,
};

const LEADERBOARD_CACHE_TTL_MS = 30_000;
const LEADERBOARD_DATES_CACHE_TTL_MS = 5 * 60_000;
const WORD_TIMES_LIVE_TTL_MS = 30_000;
const WORD_TIMES_PAST_TTL_MS = 60 * 60_000; // past days are immutable, cache longer
const GUESSES_TTL_MS = 60 * 60_000; // only ever cached once a word is solved/failed

function getCacheEntry(cache, key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function setCacheEntry(cache, key, value, ttlMs) {
    cache.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}

export function getCachedLeaderboard(date) {
    return getCacheEntry(leaderboardCache, date);
}

export function setCachedLeaderboard(date, rows) {
    setCacheEntry(leaderboardCache, date, rows, LEADERBOARD_CACHE_TTL_MS);
}

export function invalidateLeaderboard(date) {
    if (date) {
        leaderboardCache.delete(date);
        return;
    }

    leaderboardCache.clear();
}

export function getCachedLeaderboardDates() {
    if (leaderboardDatesCache.expiresAt <= Date.now()) {
        leaderboardDatesCache.value = null;
        leaderboardDatesCache.expiresAt = 0;
        return null;
    }

    return leaderboardDatesCache.value;
}

export function setCachedLeaderboardDates(dates) {
    leaderboardDatesCache.value = dates;
    leaderboardDatesCache.expiresAt = Date.now() + LEADERBOARD_DATES_CACHE_TTL_MS;
}

/* ---- Word-times (per-user, per-day breakdown for the leaderboard popup) ---- */

const wordTimesCache = new Map();

function wordTimesKey(userId, date) {
    return `${userId}:${date}`;
}

export function getCachedWordTimes(userId, date) {
    return getCacheEntry(wordTimesCache, wordTimesKey(userId, date));
}

export function setCachedWordTimes(userId, date, words, isToday) {
    setCacheEntry(
        wordTimesCache,
        wordTimesKey(userId, date),
        words,
        isToday ? WORD_TIMES_LIVE_TTL_MS : WORD_TIMES_PAST_TTL_MS
    );
}

export function invalidateWordTimes(userId, date) {
    wordTimesCache.delete(wordTimesKey(userId, date));
}

/* ---- Guesses (per word_result, only cached once finished/immutable) ---- */

const guessesCache = new Map();

export function getCachedGuesses(wordResultId) {
    return getCacheEntry(guessesCache, wordResultId);
}

export function setCachedGuesses(wordResultId, guesses) {
    setCacheEntry(guessesCache, wordResultId, guesses, GUESSES_TTL_MS);
}

/* ---- Period leaderboards (monthly + global aggregates) ----
 *
 * Keys look like `monthly:2026-10:9` or `global`. These queries are heavier
 * than the daily one and a few minutes of staleness is fine for aggregates, so
 * they are NOT touched by invalidateAllLeaderboards(): flushing them on every
 * finished word would defeat the cache.
 *
 *  - live periods (current month, global): short TTL
 *  - closed months: effectively immutable, long TTL
 */

const periodCache = new Map();
const periodInflight = new Map();

const PERIOD_LIVE_TTL_MS = 2 * 60_000;
const PERIOD_CLOSED_TTL_MS = 60 * 60_000;

export function getCachedPeriod(key) {
    return getCacheEntry(periodCache, key);
}

export function setCachedPeriod(key, value, isLive) {
    setCacheEntry(periodCache, key, value, isLive ? PERIOD_LIVE_TTL_MS : PERIOD_CLOSED_TTL_MS);
}

// Cache-aside with request coalescing: concurrent misses for the same key share
// one loader call instead of each hitting Postgres. Failures are never cached.
export function loadPeriod(key, isLive, loader) {
    const cached = getCachedPeriod(key);
    if (cached) return Promise.resolve(cached);

    const pending = periodInflight.get(key);
    if (pending) return pending;

    const promise = Promise.resolve()
        .then(loader)
        .then((value) => {
            setCachedPeriod(key, value, isLive);
            return value;
        })
        .finally(() => {
            periodInflight.delete(key);
        });

    periodInflight.set(key, promise);
    return promise;
}

export function invalidatePeriods() {
    periodCache.clear();
}

export function invalidateAllLeaderboards() {
    invalidateLeaderboard();
    invalidatePeriods();
}
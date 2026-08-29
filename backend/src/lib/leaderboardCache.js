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

export function invalidateAllLeaderboards() {
    invalidateLeaderboard();
}
const leaderboardCache = new Map();
const leaderboardDatesCache = {
    value: null,
    expiresAt: 0,
};

const LEADERBOARD_CACHE_TTL_MS = 30_000;
const LEADERBOARD_DATES_CACHE_TTL_MS = 5 * 60_000;

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
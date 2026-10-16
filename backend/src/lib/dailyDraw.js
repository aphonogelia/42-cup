import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { supabase } from '../supabase.js';

export const BERLIN_TIME_ZONE = 'Europe/Berlin';
export const DEFAULT_DRAW_COUNT = 5;
export const RECENT_WORD_BUFFER_DAYS = 60;
export const DEFAULT_POOL_PATH = path.resolve('data/competition-words.txt');
export const SPECIAL_POOLS_PATH = path.resolve('data/special.json');

const log = (...args) => console.log('[draw]', ...args);
const warn = (...args) => console.warn('[draw]', ...args);

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

function loadWords(filePath) {
    const raw = readFileSync(filePath, 'utf-8');
    return raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));
}

export function getBerlinDateKey(date = new Date()) {
    return dateFormatter.format(date);
}

function getDateParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });

    return Object.fromEntries(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)])
    );
}

function getTimeZoneOffsetMs(date, timeZone) {
    const parts = getDateParts(date, timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - date.getTime();
}

export function getNextBerlinMidnightDelayMs(now = new Date()) {
    const parts = getDateParts(now, BERLIN_TIME_ZONE);
    const nextLocalMidnightAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day + 1, 0, 0, 0);

    let target = new Date(nextLocalMidnightAsUtc);
    for (let i = 0; i < 2; i++) {
        const offset = getTimeZoneOffsetMs(target, BERLIN_TIME_ZONE);
        target = new Date(nextLocalMidnightAsUtc - offset);
    }

    return Math.max(0, target.getTime() - now.getTime());
}

/** Shifts a 'YYYY-MM-DD' key by n days (pure calendar math, no TZ issues). */
function shiftDateKey(dateKey, days) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function loadDrawPool(filePath = DEFAULT_POOL_PATH) {
    const words = loadWords(filePath);
    log(`loaded ${words.length} words from ${filePath}`);
    return words;
}

export function validateDrawPool(pool, count = DEFAULT_DRAW_COUNT) {
    if (pool.length === 0) {
        throw new Error('No words found in the draw pool');
    }
    if (pool.length < count) {
        throw new Error(`Pool only has ${pool.length} words, need at least ${count}`);
    }

    const lower = pool.map((word) => word.toLowerCase());
    const duplicates = lower.filter((word, index) => lower.indexOf(word) !== index);
    if (duplicates.length > 0) {
        throw new Error(`Duplicate word(s) in pool: ${[...new Set(duplicates)].join(', ')}`);
    }

    const nonAlpha = pool.filter((word) => !/^[a-zA-Z]+$/.test(word));
    if (nonAlpha.length > 0) {
        throw new Error(`Non-alphabetic entr(y/ies): ${nonAlpha.join(', ')}`);
    }

    log(`pool validated: ${pool.length} words, no duplicates, all alphabetic`);
}

export function secureSample(pool, count = DEFAULT_DRAW_COUNT) {
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
}

// --- Special-day pools ---------------------------------------------------
//
// data/special.json has two sections:
//   - "recurring": keyed by "MM-DD", applies every year (Halloween, Christmas,
//     April Fool's, May Day)
//   - "oneOff": keyed by exact "YYYY-MM-DD", for movable-date holidays
//     (Eid, Diwali, Lunar New Year, ...) that need a specific date added
//     by hand each year
//
// oneOff entries take priority over recurring ones for the same date.

/**
 * Resolves the special word pool (if any) for a given draw date.
 *
 * @param {string} drawDate - 'YYYY-MM-DD' (Berlin date key)
 * @param {string} [filePath] - override, mainly for testing
 * @returns {{ theme: string, words: string[] } | null}
 */
export function getSpecialPool(drawDate, filePath = SPECIAL_POOLS_PATH) {
    let raw;
    try {
        raw = readFileSync(filePath, 'utf-8');
    } catch (err) {
        if (err.code === 'ENOENT') {
            log(`no special pools file at ${filePath}`);
            return null;
        }
        throw err;
    }

    const pools = JSON.parse(raw);

    const oneOff = pools.oneOff?.[drawDate];
    if (oneOff) {
        log(`special pool matched (oneOff ${drawDate}): theme="${oneOff.theme}", ${oneOff.words?.length ?? 0} words`);
        return oneOff;
    }

    const monthDay = drawDate.slice(5); // 'MM-DD'
    const recurring = pools.recurring?.[monthDay];
    if (recurring) {
        log(`special pool matched (recurring ${monthDay}): theme="${recurring.theme}", ${recurring.words?.length ?? 0} words`);
        return recurring;
    }

    log(`no special pool for ${drawDate}`);
    return null;
}

// --- Recent-answer buffer --------------------------------------------------

/**
 * Answers used within `days` of drawDate (either side, excluding drawDate
 * itself so `force` re-draws don't block on their own rows).
 *
 * @returns {Promise<Set<string>>} lowercase words
 */
export async function getRecentAnswers(drawDate, days = RECENT_WORD_BUFFER_DAYS) {
    const from = shiftDateKey(drawDate, -days);
    const to = shiftDateKey(drawDate, days);
    log(`buffer query: answers with draw_date in [${from}, ${to}], excluding ${drawDate}`);

    const { data, error } = await supabase
        .from('words')
        .select('answer, draw_date')
        .gte('draw_date', from)
        .lte('draw_date', to)
        .neq('draw_date', drawDate);

    if (error) {
        console.error('[draw] buffer query failed:', error);
        throw error;
    }

    const rows = data ?? [];
    const set = new Set(rows.map((row) => row.answer.toLowerCase()));

    const dates = [...new Set(rows.map((r) => r.draw_date))].sort();
    log(
        `buffer: ${rows.length} rows, ${set.size} unique answers, ` +
        `${dates.length} distinct draw dates` +
        (dates.length ? ` (${dates[0]} -> ${dates[dates.length - 1]})` : '')
    );
    if (rows.length >= 1000) {
        warn('buffer query returned >= 1000 rows, Supabase default limit may be truncating results');
    }

    return set;
}

// --- Daily draw ------------------------------------------------------------

export async function getDailyWords(drawDate = getBerlinDateKey()) {
    const { data, error } = await supabase
        .from('words')
        .select('id, order_index, answer, length, draw_date')
        .eq('draw_date', drawDate)
        .order('order_index');

    if (error) throw error;
    return data ?? [];
}

export async function ensureDailyDraw({
    drawDate = getBerlinDateKey(),
    poolPath = DEFAULT_POOL_PATH,
    count = DEFAULT_DRAW_COUNT,
    force = false,
} = {}) {
    log(`ensureDailyDraw start: date=${drawDate}, count=${count}, force=${force}, buffer=${RECENT_WORD_BUFFER_DAYS}d`);

    const existing = await getDailyWords(drawDate);
    log(`existing rows for ${drawDate}: ${existing.length}`);

    if (existing.length >= count && !force) {
        log(`draw already exists, returning: ${existing.slice(0, count).map((r) => r.answer).join(', ')}`);
        return existing.slice(0, count);
    }
    if (existing.length > 0 && !force) {
        throw new Error(
            `Daily draw already exists for ${drawDate}. Re-run with force to replace it.`
        );
    }
    if (existing.length > 0 && force) {
        warn(`force=true, replacing existing draw: ${existing.map((r) => r.answer).join(', ')}`);
    }

    const special = getSpecialPool(drawDate);
    const fullPool = special ? special.words : loadDrawPool(poolPath);
    log(`using ${special ? `special pool "${special.theme}"` : 'main pool'}: ${fullPool.length} words`);
    validateDrawPool(fullPool, count);

    const recent = await getRecentAnswers(drawDate);
    const excluded = fullPool.filter((word) => recent.has(word.toLowerCase()));
    const pool = fullPool.filter((word) => !recent.has(word.toLowerCase()));
    log(
        `pool after buffer: ${pool.length} available / ${fullPool.length} total ` +
        `(${excluded.length} excluded)` +
        (excluded.length ? `: ${excluded.slice(0, 20).join(', ')}${excluded.length > 20 ? ', ...' : ''}` : '')
    );

    if (pool.length < count) {
        throw new Error(
            `Only ${pool.length} words left for ${drawDate} after excluding ` +
            `${RECENT_WORD_BUFFER_DAYS}-day buffer, need ${count}. Add words to the pool.`
        );
    }
    if (pool.length < count * 10) {
        warn(`pool is running low: ${pool.length} available words left after buffer`);
    }

    const chosen = secureSample(pool, count);
    log(`chosen: ${chosen.join(', ')}`);

    // sanity check: nothing chosen should be in the buffer
    const leaked = chosen.filter((word) => recent.has(word.toLowerCase()));
    if (leaked.length > 0) {
        console.error(`[draw] BUG: chosen words are in the buffer: ${leaked.join(', ')}`);
    }

    const rows = chosen.map((word, index) => ({
        draw_date: drawDate,
        order_index: index + 1,
        answer: word.toLowerCase(),
        length: word.length,
    }));

    const { data, error } = await supabase
        .from('words')
        .upsert(rows, { onConflict: 'draw_date,order_index' })
        .select('id, order_index, answer, length, draw_date');

    if (error) {
        console.error('[draw] upsert failed:', error);
        throw error;
    }

    log(`upserted ${data?.length ?? 0} rows for ${drawDate}`);
    return (data ?? []).sort((a, b) => a.order_index - b.order_index);
}
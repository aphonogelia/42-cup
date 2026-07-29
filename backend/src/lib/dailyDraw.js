import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { supabase } from '../supabase.js';

export const BERLIN_TIME_ZONE = 'Europe/Berlin';
export const DEFAULT_DRAW_COUNT = 7;
export const DEFAULT_POOL_PATH = path.resolve('data/competition-words.txt');

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

export function loadDrawPool(filePath = DEFAULT_POOL_PATH) {
    return loadWords(filePath);
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
}

export function secureSample(pool, count = DEFAULT_DRAW_COUNT) {
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
}

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
    const existing = await getDailyWords(drawDate);
    if (existing.length === count) {
        return existing;
    }
    if (existing.length > 0 && !force) {
        throw new Error(
            `Daily draw already exists for ${drawDate}. Re-run with force to replace it.`
        );
    }

    const pool = loadDrawPool(poolPath);
    validateDrawPool(pool, count);

    const chosen = secureSample(pool, count);
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

    if (error) throw error;
    return (data ?? []).sort((a, b) => a.order_index - b.order_index);
}

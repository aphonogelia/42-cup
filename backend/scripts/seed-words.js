/**
 * Seeds the `words` table (the 7 competition answers) by randomly sampling
 * from `data/competition-words.txt`, which is your full word pool (also
 * used as the guess-validation dictionary, see src/lib/dictionary.js).
 *
 * Usage:
 *   node scripts/seed-words.js                        # picks 7 at random
 *   node scripts/seed-words.js --count 5               # pick a different count
 *   node scripts/seed-words.js --force                 # overwrite even if
 *                                                        players already have
 *                                                        progress recorded
 *   node scripts/seed-words.js path/to/other-pool.txt  # custom pool file
 *
 * Not idempotent by design: each run draws a fresh random sample. Once the
 * competition has started (i.e. word_results exist), re-running requires
 * --force, since changing the answers under players mid-competition would
 * corrupt their progress.
 */
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { supabase } from '../src/supabase.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const countFlagIndex = args.indexOf('--count');
const count = countFlagIndex !== -1 ? Number(args[countFlagIndex + 1]) : 7;
const positional = args.filter((a, i) => a !== '--force' && a !== String(count) && i !== countFlagIndex);
const filePath = positional[0] ? path.resolve(positional[0]) : path.resolve('data/competition-words.txt');

function loadWords(file) {
  const raw = readFileSync(file, 'utf-8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

// Fisher-Yates shuffle using crypto-secure randomness, so the sample
// can't be predicted/replayed by anyone who knows Math.random's state.
function secureSample(pool, n) {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

async function main() {
  const pool = loadWords(filePath);

  if (pool.length === 0) {
    console.error(`No words found in ${filePath}`);
    process.exit(1);
  }
  if (pool.length < count) {
    console.error(`Pool only has ${pool.length} words, need at least ${count}`);
    process.exit(1);
  }

  const lower = pool.map((w) => w.toLowerCase());
  const duplicates = lower.filter((w, i) => lower.indexOf(w) !== i);
  if (duplicates.length > 0) {
    console.error(`Duplicate word(s) in pool: ${[...new Set(duplicates)].join(', ')}`);
    process.exit(1);
  }
  const nonAlpha = pool.filter((w) => !/^[a-zA-Z]+$/.test(w));
  if (nonAlpha.length > 0) {
    console.error(`Non-alphabetic entr(y/ies): ${nonAlpha.join(', ')}`);
    process.exit(1);
  }

  if (!force) {
    const { count: existingCount, error: countErr } = await supabase
      .from('word_results')
      .select('id', { count: 'exact', head: true });
    if (countErr) {
      console.error('Failed to check existing progress:', countErr.message);
      process.exit(1);
    }
    if (existingCount > 0) {
      console.error(
        `Refusing to reseed: ${existingCount} word_results row(s) already exist ` +
          `(players have progress). Re-run with --force if you really want to ` +
          `replace the competition words.`
      );
      process.exit(1);
    }
  }

  const chosen = secureSample(pool, count);
  const rows = chosen.map((word, i) => ({
    order_index: i + 1,
    answer: word.toLowerCase(),
    length: word.length,
  }));

  const { data, error } = await supabase
    .from('words')
    .upsert(rows, { onConflict: 'order_index' })
    .select('order_index, length');

  if (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }

  console.log(`Sampled ${data.length} words from a pool of ${pool.length} (${filePath}):`);
  for (const row of data.sort((a, b) => a.order_index - b.order_index)) {
    console.log(`  #${row.order_index}  (${row.length} letters)`);
  }
  console.log(`\nAnswers are not printed here on purpose — check Supabase directly if you need to verify them.`);
}

main();
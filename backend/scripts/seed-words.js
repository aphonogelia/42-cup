/**
 * Seeds the `words` table from a plain text file: one word per line,
 * line order = order_index (1-based). Comments (# ...) and blank lines
 * are ignored.
 *
 * Usage:
 *   node scripts/seed-words.js                       # uses data/competition-words.txt
 *   node scripts/seed-words.js path/to/other-list.txt # custom path
 *
 * Safe to re-run: upserts on order_index, so editing a word and re-running
 * just updates that row rather than duplicating it.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { supabase } from '../src/supabase.js';

const filePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('data/competition-words.txt');

function loadWords(file) {
  const raw = readFileSync(file, 'utf-8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

async function main() {
  const words = loadWords(filePath);

  if (words.length === 0) {
    console.error(`No words found in ${filePath}`);
    process.exit(1);
  }

  // Basic sanity checks before touching the DB
  const lower = words.map((w) => w.toLowerCase());
  const duplicates = lower.filter((w, i) => lower.indexOf(w) !== i);
  if (duplicates.length > 0) {
    console.error(`Duplicate word(s) in list: ${[...new Set(duplicates)].join(', ')}`);
    process.exit(1);
  }
  const nonAlpha = words.filter((w) => !/^[a-zA-Z]+$/.test(w));
  if (nonAlpha.length > 0) {
    console.error(`Non-alphabetic entr(y/ies): ${nonAlpha.join(', ')}`);
    process.exit(1);
  }

  const rows = words.map((word, i) => ({
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

  console.log(`Seeded ${data.length} words from ${filePath}:`);
  for (const row of data.sort((a, b) => a.order_index - b.order_index)) {
    console.log(`  #${row.order_index}  (${row.length} letters)`);
  }
}

main();

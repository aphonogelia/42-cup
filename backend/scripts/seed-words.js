/**
 * Seeds the daily draw in the `words` table for a Berlin date. The active
 * 7 answers are stored per day, so the game can switch to a new draw at
 * midnight Berlin time while keeping past draws in the database.
 *
 * Usage:
 *   node scripts/seed-words.js                        # seeds today
 *   node scripts/seed-words.js --date 2026-07-29      # seed a specific day
 *   node scripts/seed-words.js --count 5              # pick a different count
 *   node scripts/seed-words.js --force                # overwrite that day
 *   node scripts/seed-words.js path/to/other-pool.txt # custom pool file
 */
import { ensureDailyDraw, getBerlinDateKey } from '../src/lib/dailyDraw.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const countFlagIndex = args.indexOf('--count');
const count = countFlagIndex !== -1 ? Number(args[countFlagIndex + 1]) : 7;
const dateFlagIndex = args.indexOf('--date');
const drawDate = dateFlagIndex !== -1 ? args[dateFlagIndex + 1] : getBerlinDateKey();
const positional = args.filter(
  (a, i) =>
    a !== '--force' &&
    a !== '--count' &&
    a !== String(count) &&
    a !== '--date' &&
    a !== drawDate &&
    i !== countFlagIndex &&
    i !== dateFlagIndex
);
const filePath = positional[0];

async function main() {
  try {
    const words = await ensureDailyDraw({
      drawDate,
      poolPath: filePath,
      count,
      force,
    });

    console.log(`Seeded ${words.length} words for ${drawDate}${filePath ? ` (${filePath})` : ''}:`);
    for (const row of words.sort((a, b) => a.order_index - b.order_index)) {
      console.log(`  #${row.order_index}  (${row.length} letters)`);
    }
    console.log('\nAnswers are not printed here on purpose — check Supabase directly if you need to verify them.');
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
}

main();
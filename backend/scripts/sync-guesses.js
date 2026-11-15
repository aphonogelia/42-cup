import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// backend/data/guesses.txt is the source of truth. The frontend keeps a copy
// for instant local validation, so the two must stay byte-identical.
const SOURCE = fileURLToPath(new URL('../data/guesses.txt', import.meta.url));
const TARGET = fileURLToPath(
  new URL('../../frontend/public/guesses.txt', import.meta.url)
);
const checkOnly = process.argv.includes('--check');

const source = readFileSync(SOURCE);

if (!checkOnly) {
  writeFileSync(TARGET, source);
  console.log(`copied ${SOURCE} -> ${TARGET}`);
  process.exit(0);
}

let target;
try {
  target = readFileSync(TARGET);
} catch {
  console.error(`missing ${TARGET}\nrun: npm run sync:guesses`);
  process.exit(1);
}

if (!source.equals(target)) {
  console.error(
    `guess dictionaries differ:\n  ${SOURCE}\n  ${TARGET}\nrun: npm run sync:guesses`
  );
  process.exit(1);
}

console.log('guess dictionaries are identical');

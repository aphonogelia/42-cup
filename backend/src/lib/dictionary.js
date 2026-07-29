import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Same file used by scripts/seed-words.js as the pool the 7 answers are
// sampled from. Reusing it here means any guess of the right length that's
// "a real word" (i.e. in your pool) is accepted — one file, one source of
// truth, no separate list to keep in sync.
let allowed = null;

function loadDictionary() {
  if (allowed) return allowed;
  try {
    const raw = readFileSync(path.join(__dirname, '../../data/competition-words.txt'), 'utf-8');
    allowed = new Set(
      raw
        .split('\n')
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
    );
  } catch {
    allowed = new Set(); // file missing -> falls back to permissive mode
  }
  return allowed;
}

export function isAllowedGuess(word) {
  const dict = loadDictionary();
  if (dict.size === 0) return true; // permissive until the pool file exists
  return dict.has(word.toLowerCase());
}
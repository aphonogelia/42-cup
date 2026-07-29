import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Populate data/allowed-guesses.json with a wordlist matching your
// competition's word length(s), one lowercase word per line-array entry.
// This keeps "is that even a word" guesses from being submitted, same as
// real Wordle's allowed-guess list. If you don't care about this rule,
// isAllowedGuess can just `return true` always.
let allowed = null;

function loadDictionary() {
  if (allowed) return allowed;
  try {
    const raw = readFileSync(path.join(__dirname, '../../data/allowed-guesses.json'), 'utf-8');
    allowed = new Set(JSON.parse(raw).map((w) => w.toLowerCase()));
  } catch {
    allowed = new Set(); // no dictionary file yet -> falls back to permissive mode
  }
  return allowed;
}

export function isAllowedGuess(word) {
  const dict = loadDictionary();
  if (dict.size === 0) return true; // permissive until you add a wordlist
  return dict.has(word.toLowerCase());
}

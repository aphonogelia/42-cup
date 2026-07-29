/**
 * Computes Wordle-style feedback for a guess against the answer.
 * Handles duplicate letters correctly (classic Wordle two-pass algorithm):
 *  1. Mark exact position matches as "correct" first, consuming those letters.
 *  2. For remaining letters, mark "present" only if the letter still has
 *     unconsumed copies in the answer, then consume one copy.
 *  3. Everything else is "absent".
 *
 * Returns an array like ["correct","absent","present","absent","correct"].
 */
export function computeFeedback(guess, answer) {
  const g = guess.toLowerCase().split('');
  const a = answer.toLowerCase().split('');
  const len = a.length;
  const feedback = new Array(len).fill('absent');

  // Count of each letter in the answer, decremented as we consume matches.
  const remaining = {};
  for (const ch of a) remaining[ch] = (remaining[ch] || 0) + 1;

  // Pass 1: exact matches
  for (let i = 0; i < len; i++) {
    if (g[i] === a[i]) {
      feedback[i] = 'correct';
      remaining[g[i]] -= 1;
    }
  }

  // Pass 2: present-but-wrong-position
  for (let i = 0; i < len; i++) {
    if (feedback[i] === 'correct') continue;
    const ch = g[i];
    if (remaining[ch] > 0) {
      feedback[i] = 'present';
      remaining[ch] -= 1;
    }
  }

  return feedback;
}

export function isWin(feedback) {
  return feedback.every((f) => f === 'correct');
}

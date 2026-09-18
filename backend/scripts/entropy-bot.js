import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_WORD_LIST = path.resolve('data/guesses.txt');
const DEFAULT_REPORT = path.resolve('entropy-bot-report.json');
// Where the "first guess" entropy scoring gets cached. The first guess of
// every target is always scored against the *entire* word list, so this
// result never changes unless the word list itself changes.
const DEFAULT_FIRST_GUESS_CACHE = path.resolve('data/first-guess-cache.json');
// Full entropy ranking of every word for the opening guess, written as a
// CSV so it's easy to sort/inspect outside the script (e.g. in a sheet).
const DEFAULT_FIRST_GUESS_CSV = path.resolve('data/first-guess-scores.csv');
// The curated pool of real possible answers (e.g. the ~2,300-ish official
// Wordle list), as opposed to `guesses.txt`'s much larger set of words that
// are merely valid to type. Optional — comparison is skipped if missing.
const DEFAULT_CANDIDATE_LIST = path.resolve('data/competition-words.txt');
// Side-by-side entropy score for every guess-list word under both
// distributions, so you can see how much the answer pool actually matters.
const DEFAULT_FREQUENCY_CSV = path.resolve('data/frequency-comparison.csv');
// Simpler still: raw per-letter, per-position frequency, guess list vs.
// candidate list — no entropy math, just how often each letter shows up.
const DEFAULT_LETTER_FREQUENCY_CSV = path.resolve('data/letter-frequency-comparison.csv');
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const TOP_CANDIDATES_TO_PRINT = 10;
const TOP_CANDIDATES_TO_SAVE = 50;

function parseArgs(args) {
  const options = {
    wordList: DEFAULT_WORD_LIST,
    reportPath: DEFAULT_REPORT,
    firstGuessCachePath: DEFAULT_FIRST_GUESS_CACHE,
    firstGuessCsvPath: DEFAULT_FIRST_GUESS_CSV,
    candidateListPath: DEFAULT_CANDIDATE_LIST,
    frequencyCsvPath: DEFAULT_FREQUENCY_CSV,
    letterFrequencyCsvPath: DEFAULT_LETTER_FREQUENCY_CSV,
    useCache: true,
    targets: 1,
    // Specific words to solve for, passed via --target. When non-empty,
    // this takes over from the random `targets` count entirely.
    targetWords: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--targets') {
      options.targets = Number(args[++i]);
    } else if (arg === '--target') {
      // Repeatable: --target crane --target slate solves both, in order.
      options.targetWords.push(args[++i].trim().toLowerCase());
    } else if (arg === '--word-list') {
      options.wordList = path.resolve(args[++i]);
    } else if (arg === '--report') {
      options.reportPath = path.resolve(args[++i]);
    } else if (arg === '--first-guess-cache') {
      options.firstGuessCachePath = path.resolve(args[++i]);
    } else if (arg === '--first-guess-csv') {
      options.firstGuessCsvPath = path.resolve(args[++i]);
    } else if (arg === '--candidate-list') {
      options.candidateListPath = path.resolve(args[++i]);
    } else if (arg === '--frequency-csv') {
      options.frequencyCsvPath = path.resolve(args[++i]);
    } else if (arg === '--letter-frequency-csv') {
      options.letterFrequencyCsvPath = path.resolve(args[++i]);
    } else if (arg === '--no-cache') {
      // Force a fresh full-list entropy computation even if a cache file
      // already exists. Use this after the word list changes.
      options.useCache = false;
    } else if (arg === '--help') {
      console.log(`Usage: node scripts/entropy-bot.js [options]

Options:
  --targets <number>          Random target words to solve (default: 1, ignored if --target is used)
  --target <word>             Solve for this specific word instead of a random one.
                               Repeatable: --target crane --target slate solves both.
  --word-list <path>          Word list to analyze (default: data/guesses.txt)
  --report <path>             JSON report path (default: entropy-bot-report.json)
  --first-guess-cache <path>  Cache file for the full-list entropy scoring
                               used to pick the first guess (default: data/first-guess-cache.json)
  --first-guess-csv <path>    CSV of every word's entropy score for the first guess, written
                               only when the scoring is actually (re)computed (default: data/first-guess-scores.csv)
  --candidate-list <path>     Curated real-answer word list, used only to weight guess scoring
                               toward realistic letter frequency — does not restrict what the
                               target can be (default: data/competition-words.txt, skipped if missing)
  --frequency-csv <path>      CSV comparing each word's score under the guess list vs. the
                               candidate list (default: data/frequency-comparison.csv)
  --letter-frequency-csv <path>  CSV of raw per-letter, per-position frequency, guess list vs.
                               candidate list (default: data/letter-frequency-comparison.csv)
  --no-cache                  Ignore any existing first-guess cache and recompute it
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isInteger(options.targets) || options.targets < 1) {
    throw new Error('--targets must be a positive integer');
  }
  return options;
}

// Reads the word list file, lowercases/trims each line, keeps only words
// made of plain a-z letters, and restricts to the most common word length
// (deduplicated) so every word can be compared position-by-position.
function loadWords(filePath) {
  const words = readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => /^[a-z]+$/.test(word));

  const wordLength = words[0]?.length;
  if (!wordLength) throw new Error(`No usable words found in ${filePath}`);
  const sameLength = words.filter((word) => word.length === wordLength);
  const uniqueWords = [...new Set(sameLength)];
  if (uniqueWords.length === 0) throw new Error(`No usable words found in ${filePath}`);
  return { words: uniqueWords, wordLength };
}

// Shannon entropy (in bits) of a set of letter counts over `total` words.
// Higher entropy means the letter's presence/absence is more informative.
function entropyFromCounts(counts, total) {
  return Object.values(counts).reduce((entropy, count) => {
    if (count === 0) return entropy;
    const probability = count / total;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

// Entropy of "does this word contain letter X at all", for every letter,
// across the current pool of possible answers.
function getGlobalEntropy(words) {
  const counts = Object.fromEntries([...ALPHABET].map((letter) => [letter, 0]));
  for (const word of words) {
    for (const letter of new Set(word)) counts[letter] += 1;
  }
  return {
    entropy: entropyFromCounts(counts, words.length),
    counts,
    probabilities: Object.fromEntries(
      Object.entries(counts).map(([letter, count]) => [letter, count / words.length])
    ),
  };
}

// Same idea as getGlobalEntropy but per letter position (position 1, 2, 3...),
// i.e. "how informative is knowing the letter at this exact spot".
function getPositionalEntropy(words, wordLength) {
  return Array.from({ length: wordLength }, (_, position) => {
    const counts = Object.fromEntries([...ALPHABET].map((letter) => [letter, 0]));
    for (const word of words) counts[word[position]] += 1;
    return {
      position: position + 1,
      entropy: entropyFromCounts(counts, words.length),
      counts,
      probabilities: Object.fromEntries(
        Object.entries(counts).map(([letter, count]) => [letter, count / words.length])
      ),
    };
  });
}

// Scores one candidate guess word by summing how much information its
// letters are expected to reveal: once for "letter present anywhere"
// (global) and once for "letter present at this exact position" (positional).
function scoreCandidate(candidate, global, positional) {
  const uniqueLetters = [...new Set(candidate)];
  const globalContribution = uniqueLetters.reduce(
    (score, letter) => score + entropyContribution(global.counts[letter], global.total),
    0
  );
  const positionalContribution = [...candidate].reduce(
    (score, letter, position) =>
      score + entropyContribution(positional[position].counts[letter], positional[position].total),
    0
  );
  return {
    word: candidate,
    score: globalContribution + positionalContribution,
    globalContribution,
    positionalContribution,
  };
}

// How much information (in bits) it's worth to test one letter, given how
// many of the possible answers currently have it. A letter present in all
// or none of the remaining words tells us nothing new, hence the 0 cases.
function entropyContribution(count, total) {
  if (count === 0 || count === total) return 0;
  const probability = count / total;
  return -probability * Math.log2(probability);
}

// Standard Wordle-style feedback: 'correct' (right letter, right spot),
// 'present' (right letter, wrong spot), 'absent' (letter not there, or
// already matched elsewhere). Two passes so duplicate letters are handled
// the same way the real game handles them.
function getFeedback(guess, answer) {
  const feedback = Array(guess.length).fill('absent');
  const remaining = [...answer];

  for (let i = 0; i < guess.length; i += 1) {
    if (guess[i] === answer[i]) {
      feedback[i] = 'correct';
      remaining[i] = null;
    }
  }
  for (let i = 0; i < guess.length; i += 1) {
    if (feedback[i] === 'correct') continue;
    const match = remaining.indexOf(guess[i]);
    if (match !== -1) {
      feedback[i] = 'present';
      remaining[match] = null;
    }
  }
  return feedback;
}

function sameFeedback(left, right) {
  return left.every((state, index) => state === right[index]);
}

// Keeps only the words that would have produced this exact feedback pattern
// if they were the real answer — this is how the pool of candidates shrinks
// after each guess.
function filterPossibleAnswers(words, guess, feedback) {
  return words.filter((answer) => sameFeedback(getFeedback(guess, answer), feedback));
}

// Hard mode's running constraint, updated after every guess: which
// position is locked to which letter ('correct' feedback), and the
// minimum number of times each letter must appear ('correct'/'present'
// feedback). Unlike filterPossibleAnswers, this never touches the answer
// pool — it only narrows which words are legal to GUESS next.
function updateHardModeConstraints({ lockedPositions, requiredLetterCounts }, guess, feedback) {
  const nextLockedPositions = { ...lockedPositions };
  const seenCounts = {};

  for (let i = 0; i < guess.length; i += 1) {
    if (feedback[i] === 'correct') nextLockedPositions[i] = guess[i];
    if (feedback[i] !== 'absent') seenCounts[guess[i]] = (seenCounts[guess[i]] || 0) + 1;
  }

  const nextRequiredLetterCounts = { ...requiredLetterCounts };
  for (const [letter, count] of Object.entries(seenCounts)) {
    // A guess's non-absent count for a letter is only a lower bound on how
    // many copies the answer has, so take the max seen across all guesses
    // rather than overwriting it.
    nextRequiredLetterCounts[letter] = Math.max(nextRequiredLetterCounts[letter] || 0, count);
  }

  return { lockedPositions: nextLockedPositions, requiredLetterCounts: nextRequiredLetterCounts };
}

// Keeps only the words that are still legal next guesses under hard mode:
// locked positions must match, and every required letter must appear at
// least as many times as previously revealed.
function filterGuessableWords(words, { lockedPositions, requiredLetterCounts }) {
  return words.filter((word) => {
    for (const [position, letter] of Object.entries(lockedPositions)) {
      if (word[position] !== letter) return false;
    }
    for (const [letter, count] of Object.entries(requiredLetterCounts)) {
      if ([...word].filter((l) => l === letter).length < count) return false;
    }
    return true;
  });
}

// The expensive step: computes global + positional entropy across
// `possibleAnswers`, then scores every word in `candidates` against that
// distribution and sorts best-first. This is O(candidates * possibleAnswers),
// so it gets slower the bigger the remaining pool is — which is exactly why
// the very first call (against the full word list) is worth caching.
function scoreCandidates(candidates, possibleAnswers, wordLength) {
  const global = { ...getGlobalEntropy(possibleAnswers), total: possibleAnswers.length };
  const positional = getPositionalEntropy(possibleAnswers, wordLength).map((entry) => ({
    ...entry,
    total: possibleAnswers.length,
  }));
  return {
    global,
    positional,
    candidates: candidates
      .map((candidate) => scoreCandidate(candidate, global, positional))
      .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word)),
  };
}

// A cheap fingerprint of both word lists so a cached first-guess result can
// be checked against the inputs currently in use — the guess list AND the
// answer pool, since both feed into the result now. Not cryptographic —
// just enough to catch "this cache was built from different inputs".
function hashWords(words) {
  let hash = 0;
  for (const char of [...words].sort().join('|')) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function fingerprintWords(guessWords, candidateWords, wordLength) {
  return {
    wordLength,
    guessCount: guessWords.length,
    guessChecksum: hashWords(guessWords),
    candidateCount: candidateWords.length,
    candidateChecksum: hashWords(candidateWords),
  };
}

function fingerprintsMatch(a, b) {
  return (
    !!a &&
    !!b &&
    a.wordLength === b.wordLength &&
    a.guessCount === b.guessCount &&
    a.guessChecksum === b.guessChecksum &&
    a.candidateCount === b.candidateCount &&
    a.candidateChecksum === b.candidateChecksum
  );
}

// Every word's entropy score, one row per word, sorted best-first — the
// full ranking, not just the top candidates kept in the JSON cache.
function writeCandidateScoresCsv(csvPath, candidates) {
  const header = 'word,score,globalContribution,positionalContribution';
  const rows = candidates.map(
    ({ word, score, globalContribution, positionalContribution }) =>
      `${word},${score},${globalContribution},${positionalContribution}`
  );
  writeFileSync(csvPath, `${[header, ...rows].join('\n')}\n`);
}

// Same loading rules as loadWords, but keeps only words matching an
// already-known word length instead of inferring one from the file.
function loadCandidateWords(filePath, wordLength) {
  const words = readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => word.length === wordLength && /^[a-z]+$/.test(word));
  return [...new Set(words)];
}

// For every word in the guess list, scores it twice — once against the
// letter-frequency distribution of the guess list itself, once against the
// distribution of the curated candidate/answer list — so the two can be
// compared side by side. Scoring is linear in list size (not O(n^2)), so
// this is cheap enough to just run fresh every time rather than cache.
function writeFrequencyComparisonCsv(csvPath, words, candidateWords, wordLength) {
  const guessScoring = scoreCandidates(words, words, wordLength);
  const candidateScoring = scoreCandidates(words, candidateWords, wordLength);
  const candidateScoreByWord = new Map(candidateScoring.candidates.map(({ word, score }) => [word, score]));

  const rows = guessScoring.candidates
    .map(({ word, score }) => ({ word, guessListScore: score, candidateListScore: candidateScoreByWord.get(word) }))
    // Rank by the candidate-list score, since that's the distribution that
    // actually matters once you're playing against real possible answers.
    .sort((a, b) => b.candidateListScore - a.candidateListScore);

  const header = 'word,score_guess_list,score_candidate_list';
  const lines = rows.map(({ word, guessListScore, candidateListScore }) => `${word},${guessListScore},${candidateListScore}`);
  writeFileSync(csvPath, `${[header, ...lines].join('\n')}\n`);
}

// The simple version: no entropy math, just how often each letter actually
// shows up at each position, guess list vs. candidate list, side by side.
function writeLetterFrequencyCsv(csvPath, guessWords, candidateWords, wordLength) {
  const guessPositional = getPositionalEntropy(guessWords, wordLength);
  const answerPositional = getPositionalEntropy(candidateWords, wordLength);

  const header = 'position,letter,freq_guess_list,freq_candidate_list';
  const rows = [];
  for (let position = 0; position < wordLength; position += 1) {
    for (const letter of ALPHABET) {
      rows.push(
        `${position + 1},${letter},${guessPositional[position].probabilities[letter]},${answerPositional[position].probabilities[letter]}`
      );
    }
  }
  writeFileSync(csvPath, `${[header, ...rows].join('\n')}\n`);
}

/**
 * Step 1 of solving ANY target always scores the guess list against the
 * full candidate distribution (candidateWords, unnarrowed), so the result —
 * and therefore the best opening guess — is identical every single time,
 * for every target, in every run, as long as neither list changes. Instead
 * of paying for that full entropy scan on every run, we compute it once and
 * persist it to `cachePath`; later runs just load it back.
 *
 * Crucially, the *distribution* comes from `candidateWords` (the curated
 * real-answer list, when available), not from `guessWords` itself —
 * scoring against the full guess dictionary is what made plural-shaped
 * words like "tares" look artificially good, since guess dictionaries are
 * packed with inflected forms (-es, -ing, -ed...) that skew letter
 * frequency at certain positions. `candidateWords` only weights the
 * scoring — the target itself can be any word in `guessWords`.
 */
function getOrComputeFirstGuessScoring(guessWords, candidateWords, wordLength, cachePath, csvPath, useCache) {
  const fingerprint = fingerprintWords(guessWords, candidateWords, wordLength);

  if (useCache && existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (fingerprintsMatch(cached.fingerprint, fingerprint)) {
        console.log(
          `Loaded cached first-guess scoring from ${cachePath} (opening word: "${cached.scored.candidates[0].word}")`
        );
        return cached.scored;
      }
      console.log('First-guess cache does not match the current guess/candidate lists — recomputing.');
    } catch (error) {
      console.log(`Could not read first-guess cache (${error.message}) — recomputing.`);
    }
  }

  const scored = scoreCandidates(guessWords, candidateWords, wordLength);
  writeCandidateScoresCsv(csvPath, scored.candidates);
  console.log(`Wrote full entropy ranking (${scored.candidates.length} words) to ${csvPath}`);
  // Only the top candidates are ever looked at again, so there's no need
  // to persist the full ranking of every word in the JSON cache too.
  const trimmed = { ...scored, candidates: scored.candidates.slice(0, TOP_CANDIDATES_TO_SAVE) };
  writeFileSync(cachePath, `${JSON.stringify({ fingerprint, scored: trimmed }, null, 2)}\n`);
  console.log(`Wrote first-guess cache (opening word: "${trimmed.candidates[0].word}") to ${cachePath}`);
  return trimmed;
}

// Plays out one full game against `target`, picking a guess each round via
// entropy scoring (except round 1, which reuses `firstGuessScoring`), and
// narrowing `possibleAnswers` down using the resulting feedback. Guesses
// always come from `guessWords` (the full dictionary), and `possibleAnswers`
// — the pool of words the target could still be — narrows within that same
// full dictionary, since the target isn't restricted to the curated list.
//
// The curated list only informs step 1 (via the cached `firstGuessScoring`,
// weighted by realistic letter frequency, since there's no other signal yet
// for the opening guess). From step 2 onward, scoring uses `possibleAnswers`
// itself — the real remaining uncertainty — not a shrinking curated subset:
// once the target can be any guess-list word, a curated subset can desync
// from that real uncertainty (e.g. narrow to a single curated word while
// several non-curated words are still live), which would then score every
// candidate as equally uninformative and stall the game.
//
// Hard mode is always on: the *guessable* pool is additionally narrowed
// each step by filterGuessableWords — none of the above is affected by it.
function solveTarget(target, guessWords, wordLength, targetIndex, firstGuessScoring) {
  let possibleAnswers = guessWords;
  let hardModeConstraints = { lockedPositions: {}, requiredLetterCounts: {} };
  const steps = [];

  console.log(`\n=== Target ${targetIndex}: ${target} ===`);
  for (let stepNumber = 1; stepNumber <= guessWords.length; stepNumber += 1) {
    // Reuse the cached/precomputed scoring for the opening guess instead of
    // redoing the full entropy scan every time. Step 1 has no hard-mode
    // constraints yet, so it always scores against the full guess list.
    const guessPool = stepNumber === 1 ? guessWords : filterGuessableWords(guessWords, hardModeConstraints);
    if (guessPool.length === 0) {
      throw new Error(`Hard mode constraints eliminated every legal guess before target ${target} was found`);
    }
    const scored =
      stepNumber === 1 ? firstGuessScoring : scoreCandidates(guessPool, possibleAnswers, wordLength);
    const guess =
      possibleAnswers.length === 1 ? possibleAnswers[0] : scored.candidates[0].word;
    const topCandidates = [
      { word: guess, score: scored.candidates.find(({ word }) => word === guess)?.score ?? 0 },
      ...scored.candidates.filter(({ word }) => word !== guess),
    ].slice(0, TOP_CANDIDATES_TO_SAVE);
    const feedback = getFeedback(guess, target);
    hardModeConstraints = updateHardModeConstraints(hardModeConstraints, guess, feedback);
    const nextPossibleAnswers = filterPossibleAnswers(possibleAnswers, guess, feedback);
    const step = {
      step: stepNumber,
      possibleAnswerCountBefore: possibleAnswers.length,
      possibleAnswersBefore: possibleAnswers,
      globalEntropy: scored.global.entropy,
      globalLetterCounts: scored.global.counts,
      positionalEntropy: scored.positional.map(({ position, entropy }) => ({ position, entropy })),
      positionalLetterCounts: scored.positional.map(({ position, counts }) => ({ position, counts })),
      topCandidates,
      selectedGuess: guess,
      feedback,
      possibleAnswerCountAfter: nextPossibleAnswers.length,
      possibleAnswersAfter: nextPossibleAnswers,
    };
    steps.push(step);

    console.log(`\nStep ${stepNumber}: ${possibleAnswers.length} possible answers`);
    console.log(`  Global entropy: ${scored.global.entropy.toFixed(6)}`);
    console.log(
      `  Positional entropy: ${scored.positional
        .map(({ position, entropy }) => `p${position}=${entropy.toFixed(6)}`)
        .join(', ')}`
    );
    console.log(
      `  Top ${TOP_CANDIDATES_TO_PRINT}: ${topCandidates
        .slice(0, TOP_CANDIDATES_TO_PRINT)
        .map(({ word, score }) => `${word} (${score.toFixed(6)})`)
        .join(', ')}`
    );
    console.log(`  Selected: ${guess}`);
    console.log(`  Feedback: ${feedback.join(', ')}`);
    console.log(`  Remaining: ${nextPossibleAnswers.length}`);

    if (guess === target) return { target, guesses: stepNumber, steps };
    if (nextPossibleAnswers.length === 0) {
      throw new Error(`Feedback filtering removed every answer after guess ${guess}`);
    }
    possibleAnswers = nextPossibleAnswers;
  }
  throw new Error(`Could not solve target ${target}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { words: guessWords, wordLength } = loadWords(options.wordList);
  console.log(`Loaded ${guessWords.length} unique ${wordLength}-letter words from ${options.wordList}`);

  // The curated real-answer list, when available, used only to weight
  // guess scoring toward realistic letter frequency — it does not restrict
  // what the target can be. Falls back to the full guess list (no
  // weighting effect) when no curated list is present.
  let candidateWords = guessWords;
  const usingCandidateList = existsSync(options.candidateListPath);
  if (usingCandidateList) {
    candidateWords = loadCandidateWords(options.candidateListPath, wordLength);
    console.log(`Loaded ${candidateWords.length} candidate answers from ${options.candidateListPath}`);
  } else {
    console.log(`No candidate list found at ${options.candidateListPath} — scoring against the guess list's own letter frequency`);
  }

  let targets;
  if (options.targetWords.length > 0) {
    // Solve the specific word(s) requested on the command line. Each one
    // must actually be in the guess list — otherwise it could never be
    // typed as a guess, let alone converged on.
    const guessSet = new Set(guessWords);
    for (const target of options.targetWords) {
      if (target.length !== wordLength) {
        throw new Error(`--target "${target}" is ${target.length} letters, expected ${wordLength}`);
      }
      if (!guessSet.has(target)) {
        throw new Error(`--target "${target}" is not in the guess list (${options.wordList})`);
      }
    }
    targets = options.targetWords;
    console.log(`Running ${targets.length} specific target${targets.length === 1 ? '' : 's'}: ${targets.join(', ')}`);
  } else {
    targets = Array.from({ length: options.targets }, () => guessWords[randomInt(guessWords.length)]);
    console.log(`Running ${targets.length} random target${targets.length === 1 ? '' : 's'}`);
  }

  // Compute (or load from disk) the scoring once, up front, and hand the
  // same result to every target's first step.
  const firstGuessScoring = getOrComputeFirstGuessScoring(
    guessWords,
    candidateWords,
    wordLength,
    options.firstGuessCachePath,
    options.firstGuessCsvPath,
    options.useCache
  );

  if (usingCandidateList) {
    writeFrequencyComparisonCsv(options.frequencyCsvPath, guessWords, candidateWords, wordLength);
    console.log(`Wrote guess-list vs. candidate-list score comparison to ${options.frequencyCsvPath}`);
    writeLetterFrequencyCsv(options.letterFrequencyCsvPath, guessWords, candidateWords, wordLength);
    console.log(`Wrote per-letter, per-position frequency comparison to ${options.letterFrequencyCsvPath}`);
  }

  console.log('Hard mode: correct letters locked, present letters must be reused each guess');

  const results = targets.map((target, index) =>
    solveTarget(target, guessWords, wordLength, index + 1, firstGuessScoring)
  );
  const report = {
    generatedAt: new Date().toISOString(),
    wordList: options.wordList,
    candidateList: usingCandidateList ? options.candidateListPath : null,
    wordCount: guessWords.length,
    candidateCount: candidateWords.length,
    wordLength,
    firstGuessCache: options.firstGuessCachePath,
    scoring: {
      globalEntropy: 'entropy of letter presence across possible answers',
      positionalEntropy: 'entropy of each letter position across possible answers',
      candidateScore: 'sum of global entropy contribution for unique letters plus positional contributions',
    },
    results,
  };
  writeFileSync(options.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nWrote detailed JSON report to ${options.reportPath}`);
}

main();
import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_WORD_LIST = path.resolve('data/guesses.txt');
const DEFAULT_REPORT = path.resolve('entropy-bot-report.json');
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const TOP_CANDIDATES_TO_PRINT = 10;
const TOP_CANDIDATES_TO_SAVE = 50;

function parseArgs(args) {
  const options = {
    wordList: DEFAULT_WORD_LIST,
    reportPath: DEFAULT_REPORT,
    targets: 1,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--targets') {
      options.targets = Number(args[++i]);
    } else if (arg === '--word-list') {
      options.wordList = path.resolve(args[++i]);
    } else if (arg === '--report') {
      options.reportPath = path.resolve(args[++i]);
    } else if (arg === '--help') {
      console.log(`Usage: node scripts/entropy-bot.js [options]

Options:
  --targets <number>       Random target words to solve (default: 1)
  --word-list <path>       Word list to analyze (default: data/guesses.txt)
  --report <path>          JSON report path (default: entropy-bot-report.json)
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

function entropyFromCounts(counts, total) {
  return Object.values(counts).reduce((entropy, count) => {
    if (count === 0) return entropy;
    const probability = count / total;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

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

function entropyContribution(count, total) {
  if (count === 0 || count === total) return 0;
  const probability = count / total;
  return -probability * Math.log2(probability);
}

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

function filterPossibleAnswers(words, guess, feedback) {
  return words.filter((answer) => sameFeedback(getFeedback(guess, answer), feedback));
}

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

function solveTarget(target, allWords, wordLength, targetIndex) {
  let possibleAnswers = allWords;
  const steps = [];

  console.log(`\n=== Target ${targetIndex}: ${target} ===`);
  for (let stepNumber = 1; stepNumber <= allWords.length; stepNumber += 1) {
    const scored = scoreCandidates(allWords, possibleAnswers, wordLength);
    const guess =
      possibleAnswers.length === 1 ? possibleAnswers[0] : scored.candidates[0].word;
    const topCandidates = [
      { word: guess, score: scored.candidates.find(({ word }) => word === guess)?.score ?? 0 },
      ...scored.candidates.filter(({ word }) => word !== guess),
    ].slice(0, TOP_CANDIDATES_TO_SAVE);
    const feedback = getFeedback(guess, target);
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
  const { words, wordLength } = loadWords(options.wordList);
  const targets = Array.from({ length: options.targets }, () => words[randomInt(words.length)]);

  console.log(`Loaded ${words.length} unique ${wordLength}-letter words from ${options.wordList}`);
  console.log(`Running ${targets.length} random target${targets.length === 1 ? '' : 's'}`);

  const results = targets.map((target, index) => solveTarget(target, words, wordLength, index + 1));
  const report = {
    generatedAt: new Date().toISOString(),
    wordList: options.wordList,
    wordCount: words.length,
    wordLength,
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

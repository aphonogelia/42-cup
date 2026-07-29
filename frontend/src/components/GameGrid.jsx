const FEEDBACK_ORDER = { correct: 3, present: 2, absent: 1 };

export default function GameGrid({ length, maxTries, guesses, currentGuess }) {
  const rows = [];

  for (let r = 0; r < maxTries; r++) {
    const past = guesses[r];
    const isCurrent = !past && r === guesses.length;
    const letters = past
      ? past.guess.split('')
      : isCurrent
        ? currentGuess.padEnd(length, ' ').split('')
        : new Array(length).fill(' ');

    rows.push(
      <div className="grid-row" key={r}>
        {letters.map((ch, i) => {
          const fb = past?.feedback?.[i];
          const filled = ch !== ' ';
          return (
            <div key={i} className={`tile ${fb || ''} ${filled ? 'filled' : ''}`}>
              {filled ? ch : ''}
            </div>
          );
        })}
      </div>
    );
  }

  return <div className="grid">{rows}</div>;
}

// Reduces a set of guesses down to the best-known feedback per letter,
// for coloring the on-screen keyboard (correct beats present beats absent).
export function computeLetterStates(guesses) {
  const states = {};
  for (const g of guesses) {
    g.guess.split('').forEach((ch, i) => {
      const fb = g.feedback[i];
      if (!states[ch] || FEEDBACK_ORDER[fb] > FEEDBACK_ORDER[states[ch]]) {
        states[ch] = fb;
      }
    });
  }
  return states;
}

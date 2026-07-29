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
      <div className="grid-row" key={r} style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
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

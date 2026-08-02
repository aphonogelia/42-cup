const REVEAL_STAGGER_MS = 180;
const REVEAL_FLIP_MS = 550;

export function getRevealDurationMs(length) {
  return (length - 1) * REVEAL_STAGGER_MS + REVEAL_FLIP_MS;
}

const FEEDBACK_COLORS = {
  correct: { bg: 'var(--tile-correct)', color: '#0d1a12' },
  present: { bg: 'var(--tile-present)', color: '#211705' },
  absent: { bg: 'var(--tile-absent)', color: 'var(--text-faint)' },
};

export default function GameGrid({ length, maxTries, guesses, currentGuess, revealRowIndex }) {
  const rows = [];

  for (let r = 0; r < maxTries; r++) {
    const past = guesses[r];
    const isCurrent = !past && r === guesses.length;
    const letters = past
      ? past.guess.split('')
      : isCurrent
        ? currentGuess.padEnd(length, ' ').split('')
        : new Array(length).fill(' ');

    const isRevealing = r === revealRowIndex;

    rows.push(
      <div className="grid-row" key={r} style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {letters.map((ch, i) => {
          const fb = past?.feedback?.[i];
          const filled = ch !== ' ';
          const colors = fb ? FEEDBACK_COLORS[fb] : null;
          const style = isRevealing && colors
            ? {
              '--reveal-bg': colors.bg,
              '--reveal-color': colors.color,
              animationDelay: `${i * REVEAL_STAGGER_MS}ms`,
            }
            : undefined;

          return (
            <div
              key={i}
              className={[
                'tile',
                !isRevealing && fb ? fb : '',
                filled ? 'filled' : '',
                isRevealing && fb ? 'tile-reveal' : '',
              ].join(' ').trim()}
              style={style}
            >
              {filled ? ch : ''}
            </div>
          );
        })}
      </div>
    );
  }

  return <div className="grid">{rows}</div>;
}
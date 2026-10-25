import { useEffect, useState } from 'react';

const ROWS = 6;
const MAX_BOARDS = 4;
const reduce =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// One mini board replaying real solved games, row by row, then moving to the next game.
function Board({ games, slot, stride }) {
  const [gi, setGi] = useState(slot);
  const game = games[gi % games.length];
  const total = game.guesses.length;
  const cols = game.answer.length;
  const [rows, setRows] = useState(reduce ? total : 0);

  useEffect(() => {
    if (reduce) return undefined;
    const delay = rows === 0 ? 500 + slot * 400 : rows < total ? 700 : 2400;
    const t = setTimeout(() => {
      if (rows < total) setRows(rows + 1);
      else {
        setGi(gi + stride);
        setRows(0);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [rows, gi, total, slot, stride]);

  return (
    <div className="mini" aria-hidden="true">
      {Array.from({ length: ROWS }, (_, r) => {
        const g = r < rows ? game.guesses[r] : null;
        return (
          <div className="mini-row" key={r} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }, (_, c) => (
              <span
                key={`${gi}-${r}-${c}`}
                className={`tile ${g ? `${g.feedback[c]} flip` : ''}`}
                style={g ? { animationDelay: `${c * 90}ms` } : undefined}
              >
                {g ? g.guess[c]?.toUpperCase() : ''}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export default function SolvingGrids({ games }) {
  if (!games?.length) return null;
  const n = Math.min(MAX_BOARDS, games.length);
  return (
    <div className="hero-grids">
      {Array.from({ length: n }, (_, i) => (
        <Board key={i} games={games} slot={i} stride={n} />
      ))}
    </div>
  );
}
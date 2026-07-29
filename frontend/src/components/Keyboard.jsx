const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'back'],
];

export default function Keyboard({ letterStates, onKey, disabled }) {
  return (
    <div className="keyboard">
      {ROWS.map((row, i) => (
        <div className="kb-row" key={i}>
          {row.map((k) => {
            const isWide = k === 'enter' || k === 'back';
            const label = k === 'enter' ? 'ENTER' : k === 'back' ? 'DEL' : k;
            return (
              <button
                key={k}
                className={`key ${isWide ? 'wide' : ''} ${letterStates[k] || ''}`}
                onClick={() => onKey(k)}
                disabled={disabled}
              >
                {label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

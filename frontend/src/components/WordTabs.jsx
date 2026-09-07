import { useEffect, useState } from 'react';

const STAMP_LABEL = {
  solved: 'SOLVED',
  failed: 'FAILED',
};

function formatMMSS(totalSeconds, { round = false } = {}) {
  const s = Math.max(0, round ? Math.round(totalSeconds) : Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function useNow(active, intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

export default function WordTabs({ words, selectedOrderIndex, onSelect }) {
  const hasInProgress = words.some((w) => w.status === 'in_progress' && w.started_at);
  const now = useNow(hasInProgress);

  return (
    <div className="tab-strip" style={{ gridTemplateColumns: `repeat(${words.length}, minmax(0, 1fr))` }}>
      {words.map((w) => {
        let timerLabel = null;

        if (w.status === 'in_progress' && w.started_at) {
          const elapsedSeconds = (now - new Date(w.started_at).getTime()) / 1000;
          timerLabel = formatMMSS(elapsedSeconds, { round: false });
        } else if ((w.status === 'solved' || w.status === 'failed') && typeof w.time_seconds === 'number') {
          timerLabel = formatMMSS(w.time_seconds, { round: true });
        }

        return (
          <button
            key={w.word_id}
            className={`tab-stub ${w.status} ${w.order_index === selectedOrderIndex ? 'selected' : ''}`}
            onClick={() => onSelect(w.order_index)}
            aria-label={`Word ${w.order_index}, ${w.status.replace('_', ' ')}`}
          >
            <span className="num">#{w.order_index}</span>
            {timerLabel && <span className="timer">{timerLabel}</span>}
            {w.status === 'solved' || w.status === 'failed' ? (
              <span className="stamp">{STAMP_LABEL[w.status]}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
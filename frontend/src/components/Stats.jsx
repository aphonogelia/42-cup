import { useEffect, useState } from 'react';
import { api } from '../api.js';

function formatTime(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function formatDateLabel(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function GuessDistribution({ distribution }) {
  const max = Math.max(...Object.values(distribution), 1);

  return (
    <div className="stats-distribution">
      {[1, 2, 3, 4, 5, 6].map((n) => {
        const count = distribution[n] ?? 0;
        const pct = max > 0 ? (count / max) * 100 : 0;
        return (
          <div className="stats-dist-row" key={n}>
            <span className="stats-dist-label">{n}</span>
            <div className="stats-dist-bar-track">
              <div
                className="stats-dist-bar"
                style={{ width: `${Math.max(pct, count > 0 ? 6 : 0)}%` }}
              />
              <span className="stats-dist-count">{count}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="stats-card">
      <p className="stats-card-label">{label}</p>
      <p className="stats-card-value">{value}</p>
      {sub && <p className="stats-card-sub">{sub}</p>}
    </div>
  );
}

export default function Stats() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .stats()
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="stats-error">{error}</div>;
  if (!data) {
    return (
      <div className="ledger-loading" aria-busy="true">
        <div className="loader" aria-label="Loading" role="status" />
      </div>
    );
  }

  return (
    <div className="stats-page">
      <section className="stats-section">
        <h2 className="stats-section-title">Guess distribution</h2>
        <GuessDistribution distribution={data.guessDistribution} />
      </section>

      <section className="stats-section stats-grid">
        <StatCard
          label="Fastest solve"
          value={data.fastestSolve ? formatTime(data.fastestSolve.time_seconds) : '—'}
          sub={
            data.fastestSolve
              ? `#${data.fastestSolve.order_index} · ${formatDateLabel(data.fastestSolve.draw_date)}`
              : 'No solves yet'
          }
        />
        <StatCard
          label="Fastest day"
          value={data.fastestDay ? formatTime(data.fastestDay.total_time) : '—'}
          sub={data.fastestDay ? formatDateLabel(data.fastestDay.draw_date) : 'No perfect day yet'}
        />
      </section>

      <section className="stats-section stats-grid">
        <StatCard
          label="Streak (all solved)"
          value={data.streakSolved.current}
          sub={`Best: ${data.streakSolved.longest}`}
        />
        <StatCard
          label="Streak (all played)"
          value={data.streakPlayed.current}
          sub={`Best: ${data.streakPlayed.longest}`}
        />
      </section>
    </div>
  );
}
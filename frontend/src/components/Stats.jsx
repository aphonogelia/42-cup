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
    month: 'short',
    day: 'numeric',
  });
}

function GuessDistribution({ distribution }) {
  const max = Math.max(...Object.values(distribution), 1);

  return (
    <div className="stats-distribution-vertical">
      {[1, 2, 3, 4, 5, 6].map((n) => {
        const count = distribution[n] ?? 0;
        const pct = max > 0 ? (count / max) * 100 : 0;
        return (
          <div className="stats-dist-col" key={n}>
            <span className="stats-dist-count">{count}</span>
            <div className="stats-dist-bar-track-v">
              <div
                className="stats-dist-bar-v"
                style={{ height: `${Math.max(pct, count > 0 ? 6 : 0)}%` }}
              />
            </div>
            <span className="stats-dist-label">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatGroup({ title, children, columns = 2 }) {
  return (
    <div className="stats-group">
      <p className="stats-group-title">{title}</p>
      <div className={`stats-group-row stats-group-row-${columns}`}>{children}</div>
    </div>
  );
}

function StatItem({ value, label, sub }) {
  return (
    <div className="stats-item">
      <p className="stats-item-value">{value}</p>
      <p className="stats-item-label">{label}</p>
      {sub && <p className="stats-item-sub">{sub}</p>}
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

  const successRate = data.daysStarted > 0
    ? Math.round((data.daysAllSolved / data.daysStarted) * 100)
    : null;

  return (
    <div className="stats-page">
      <StatGroup title="Guess distribution" columns={1}>
        <GuessDistribution distribution={data.guessDistribution} />
      </StatGroup>

      <StatGroup title="Fastest">
        <StatItem
          value={data.fastestSolve ? formatTime(data.fastestSolve.time_seconds) : '—'}
          label="Solve"
          sub={data.fastestSolve ? `#${data.fastestSolve.order_index} · ${formatDateLabel(data.fastestSolve.draw_date)}` : null}
        />
        <StatItem
          value={data.fastestDay ? formatTime(data.fastestDay.total_time) : '—'}
          label="Day"
          sub={data.fastestDay ? formatDateLabel(data.fastestDay.draw_date) : null}
        />
      </StatGroup>

      <StatGroup title="Average word time">
        <StatItem value={formatTime(data.avgWordTime)} label="All solves" />
        <StatItem value={formatTime(data.avgWordTimeFiltered)} label="Excl. outliers" sub="> 30 min removed" />
      </StatGroup>

      <StatGroup title="Streaks">
        <StatItem value={data.streakSolved.current} label="All solved" sub={`Best: ${data.streakSolved.longest}`} />
        <StatItem value={data.streakPlayed.current} label="All played" sub={`Best: ${data.streakPlayed.longest}`} />
      </StatGroup>

      <StatGroup title="Consistency">
        <StatItem value={data.daysAllSolved} label="Perfect days" sub={`of ${data.daysStarted} started`} />
        <StatItem value={successRate != null ? `${successRate}%` : '—'} label="Success rate" />
      </StatGroup>

      <StatGroup title="Podium finishes" columns={3}>
        <StatItem value={data.top1} label="Top 1" />
        <StatItem value={data.top3} label="Top 3" />
        <StatItem value={data.top5} label="Top 5" />
      </StatGroup>
    </div>
  );
}
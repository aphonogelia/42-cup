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
    <div className="stats-distribution-h">
      {[1, 2, 3, 4, 5, 6].map((n) => {
        const count = distribution[n] ?? 0;
        const pct = max > 0 ? (count / max) * 100 : 0;
        return (
          <div className="stats-dist-row" key={n}>
            <span className="stats-dist-n">{n}</span>
            <div className="stats-dist-track-h">
              <div
                className="stats-dist-bar-h"
                style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="stats-dist-count-h">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatGroup({ title, children, columns }) {
  return (
    <div className="stats-group">
      <p className="stats-group-title">{title}</p>
      <div className={columns ? `stats-group-row stats-group-row-${columns}` : 'stats-rows'}>
        {children}
      </div>
    </div>
  );
}

function StatRow({ label, value, sub }) {
  return (
    <div className="stat-row">
      <span className="stat-row-label">{label}</span>
      <span className="stat-row-leader" />
      <span className="stat-row-value">
        {value}
        {sub && <span className="stat-row-sub"> · {sub}</span>}
      </span>
    </div>
  );
}

function StatItem({ value, label }) {
  return (
    <div className="stats-item">
      <p className="stats-item-value">{value}</p>
      <p className="stats-item-label">{label}</p>
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
      <StatGroup title="Guess distribution">
        <GuessDistribution distribution={data.guessDistribution} />
      </StatGroup>

      <StatGroup title="Fastest">
        <StatRow
          label="Solve"
          value={data.fastestSolve ? formatTime(data.fastestSolve.time_seconds) : '—'}
          sub={data.fastestSolve ? `#${data.fastestSolve.order_index} · ${formatDateLabel(data.fastestSolve.draw_date)}` : null}
        />
        <StatRow
          label="Day"
          value={data.fastestDay ? formatTime(data.fastestDay.total_time) : '—'}
          sub={data.fastestDay ? formatDateLabel(data.fastestDay.draw_date) : null}
        />
      </StatGroup>

      <StatGroup title="Average word time">
        <StatRow label="All solves" value={formatTime(data.avgWordTime)} />
        <StatRow label="Excl. outliers" value={formatTime(data.avgWordTimeFiltered)} sub="> 30 min removed" />
      </StatGroup>

      <StatGroup title="Streaks">
        <StatRow label="All solved" value={data.streakSolved.current} sub={`Best: ${data.streakSolved.longest}`} />
        <StatRow label="All played" value={data.streakPlayed.current} sub={`Best: ${data.streakPlayed.longest}`} />
      </StatGroup>

      <StatGroup title="Consistency">
        <StatRow label="Perfect days" value={data.daysAllSolved} sub={`of ${data.daysStarted} started`} />
        <StatRow label="Success rate" value={successRate != null ? `${successRate}%` : '—'} />
      </StatGroup>

      <StatGroup title="Podium finishes" columns={3}>
        <StatItem value={data.top1} label="Top 1" />
        <StatItem value={data.top3} label="Top 3" />
        <StatItem value={data.top5} label="Top 5" />
      </StatGroup>
    </div>
  );
}
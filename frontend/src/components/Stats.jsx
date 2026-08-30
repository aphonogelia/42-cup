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

function StatGroup({ title, children, bare = false }) {
  return (
    <div className="stats-group">
      <p className="stats-group-title">{title}</p>
      {bare ? children : <div className="stats-rows">{children}</div>}
    </div>
  );
}

function StatRow({ label, value, sub }) {
  return (
    <div className="stat-row">
      <div className="stat-row-left">
        <span className="stat-row-label">{label}</span>
        {sub && <span className="stat-row-sub">{sub}</span>}
      </div>
      <span className="stat-row-value">{value}</span>
    </div>
  );
}

function Podium({ top1, top3, top5, total }) {
  // Visual position is fixed (podium shape), independent of which rank has
  // the highest count. left=3rd, middle=1st (tallest), right=5th (shortest).
  const columns = [
    { position: 'left', label: 'Top 3', value: top3 },
    { position: 'middle', label: 'Top 1', value: top1 },
    { position: 'right', label: 'Top 5', value: top5 },
  ];

  return (
    <div className="podium">
      {columns.map((col) => {
        const pct = total > 0 ? Math.round((col.value / total) * 100) : null;
        return (
          <div className="podium-col" key={col.position}>
            <div className="podium-figures">
              <span className="podium-value">{col.value}</span>
              {pct != null && <span className="podium-pct">{pct}%</span>}
            </div>
            <div className={`podium-block podium-block--${col.position}`} />
            <span className="podium-label">{col.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ConsistencyHero({ wordsFound, wordsStarted }) {
  const pct = wordsStarted > 0 ? Math.round((wordsFound / wordsStarted) * 100) : null;
  return (
    <div className="consistency-hero">
      <span className="consistency-hero-value">{pct != null ? `${pct}%` : '—'}</span>
      <span className="consistency-hero-label">words found</span>
      <span className="consistency-hero-sub">{wordsFound} of {wordsStarted} started</span>
    </div>
  );
}

function DaysDistribution({ breakdown }) {
  if (!breakdown || breakdown.length === 0) return null;
  const max = Math.max(...breakdown.map((b) => b.count), 1);
  return (
    <div className="stats-distribution-h stats-distribution-h-full">
      {breakdown.map(({ solved, total, count }) => {
        const pct = max > 0 ? (count / max) * 100 : 0;
        return (
          <div className="stats-dist-row" key={`${solved}/${total}`}>
            <span className="stats-dist-n stats-dist-n-wide">{`${solved}/${total}`}</span>
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
      <StatGroup title="Guess distribution" bare>
        <GuessDistribution distribution={data.guessDistribution} />
      </StatGroup>

      <StatGroup title="Fastest">
        <StatRow
          label="Solve"
          value={data.fastestSolve ? formatTime(data.fastestSolve.time_seconds) : '—'}
          sub={
            data.fastestSolve
              ? `${data.fastestSolve.answer} · #${data.fastestSolve.order_index} · ${formatDateLabel(data.fastestSolve.draw_date)}`
              : null
          }
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

      <StatGroup title="Consistency" bare>
        <ConsistencyHero wordsFound={data.wordsFound} wordsStarted={data.wordsStarted} />
        <DaysDistribution breakdown={data.daysBreakdown} />
      </StatGroup>

      <StatGroup title="Podium finishes" bare>
        <Podium top1={data.top1} top3={data.top3} top5={data.top5} total={data.daysStarted} />
      </StatGroup>
    </div>
  );
}
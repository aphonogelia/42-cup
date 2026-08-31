import { useEffect, useState } from 'react';
import { api } from '../api.js';

const PODIUM_HEIGHTS = { left: 58, middle: 84, right: 38 };

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
      {bare ? children : <div className="stats-cols">{children}</div>}
    </div>
  );
}

function StatBlock({ value, label, sub, compact = false }) {
  return (
    <div className={`stat-block${compact ? ' stat-block--compact' : ''}`}>
      <span className="stat-block-value">{value}</span>
      <span className="stat-block-label">{label}</span>
      {sub && <span className="stat-block-sub">{sub}</span>}
    </div>
  );
}

function StreakBlock({ label, current, longest }) {
  return (
    <div className="stat-block">
      <span className="stat-block-label">{label}</span>
      <div className="streak-pair">
        <div className="streak-pair-item">
          <span className="streak-pair-value">{current}</span>
          <span className="streak-pair-tag">current</span>
        </div>
        <div className="streak-pair-item">
          <span className="streak-pair-value">{longest}</span>
          <span className="streak-pair-tag">best</span>
        </div>
      </div>
    </div>
  );
}

function Podium({ top1, top3, top5, total }) {
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
              <span className="podium-pct">{pct != null ? `${pct}%` : '—'}</span>
              <span className="podium-value">{col.value}</span>
            </div>
            <div
              className={`podium-block podium-block--${col.position}`}
              style={{ height: `${PODIUM_HEIGHTS[col.position]}px` }}
            />
            <span className="podium-label">{col.label}</span>
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

  const pctSolved =
    data.wordsStarted > 0 ? Math.round((data.wordsFound / data.wordsStarted) * 100) : null;

  return (
    <div className="stats-page">
      <StatGroup title="General">
        <StatBlock
          value={pctSolved != null ? `${pctSolved}%` : '—'}
          label="Words found"
          sub={`${data.wordsFound} of ${data.wordsStarted}`}
        />
        <StatBlock
          value={data.fastestDay ? formatTime(data.fastestDay.total_time) : '—'}
          label="Fastest day"
          sub={data.fastestDay ? `All 5 · ${formatDateLabel(data.fastestDay.draw_date)}` : null}
        />
      </StatGroup>

      <StatGroup title="Guess distribution" bare>
        <GuessDistribution distribution={data.guessDistribution} />
      </StatGroup>

      <StatGroup title="Streaks">
        <StreakBlock
          label="All solved"
          current={data.streakSolved.current}
          longest={data.streakSolved.longest}
        />
        <StreakBlock
          label="All played"
          current={data.streakPlayed.current}
          longest={data.streakPlayed.longest}
        />
      </StatGroup>

      <StatGroup title="Word time">
        <StatBlock
          compact
          value={data.fastestSolve ? formatTime(data.fastestSolve.time_seconds) : '—'}
          label="Fastest"
          sub={data.fastestSolve ? data.fastestSolve.answer : null}
        />
        <StatBlock compact value={formatTime(data.avgWordTime)} label="Average" />
        <StatBlock
          compact
          value={formatTime(data.avgWordTimeFiltered)}
          label="Excl. outl."
          sub="> 30m removed"
        />
      </StatGroup>

      <StatGroup title="Podium finishes" bare>
        <Podium top1={data.top1} top3={data.top3} top5={data.top5} total={data.daysStarted} />
      </StatGroup>

      <StatGroup title="Perfect days">
        <StatBlock value={data.daysAllSolved} label="All solved" />
        <StatBlock value={data.daysAllPlayed} label="All played" />
        <StatBlock value={data.daysStarted} label="Started" />
      </StatGroup>
    </div>
  );
}
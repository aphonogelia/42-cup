import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatClock } from '../lib/formatTime.js';
import AlertModal from './AlertModal.jsx';
import './Leaderboard.css';

const fetchPeriod = (isMonthly, month) =>
  isMonthly ? api.leaderboardMonthly(month) : api.leaderboardGlobal();

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const formatPct = (v) => (v == null ? '—' : `${Math.round(Number(v))}%`);
const formatTries = (v) => (v == null ? '—' : Number(v).toFixed(1));
// The score is a plain number (seconds / 60, lower is better), not a clock time.
const formatScore = (v) => (v == null ? '—' : (Number(v) / 60).toFixed(2));

function NavArrow({ direction }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points={direction === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}

export default function PeriodLeaderboard({ mode, viewerId }) {
  const isMonthly = mode === 'monthly';
  const [months, setMonths] = useState(null); // monthly tab only, newest first
  const [monthlyMinDays, setMonthlyMinDays] = useState(null);
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  // The server lists only the months that have enough days (see /api/leaderboard/meta).
  useEffect(() => {
    if (!isMonthly) return undefined;
    let cancelled = false;
    api
      .leaderboardMeta()
      .then((meta) => {
        if (cancelled) return;
        const list = meta.months ?? [];
        setMonths(list);
        setMonthlyMinDays(meta.thresholds?.monthly?.minDays ?? null);
        setMonth((current) => current ?? list[0] ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setMonths([]);
        setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [isMonthly]);

  // Load the board, then refresh it quietly on focus and every 2 minutes.
  useEffect(() => {
    if (isMonthly && !month) return undefined;
    let cancelled = false;

    setData(null);

    fetchPeriod(isMonthly, month)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      fetchPeriod(isMonthly, month)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {});
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const intervalId = window.setInterval(refresh, 120_000);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(intervalId);
    };
  }, [isMonthly, month]);

  const monthIdx = months && month ? months.indexOf(month) : -1;
  const olderMonth = monthIdx !== -1 ? months[monthIdx + 1] ?? null : null;
  const newerMonth = monthIdx > 0 ? months[monthIdx - 1] : null;

  const rows = data?.rows ?? [];
  const thresholds = data?.thresholds;
  // Players below the day threshold come back from the API with rank null; they are not shown.
  const ranked = rows.filter((r) => r.rank != null);

  const loader = (
    <div className="ledger-loading" aria-busy="true">
      <div className="loader" aria-label="Loading" role="status" />
    </div>
  );

  let body;
  if (isMonthly && months === null) {
    body = loader;
  } else if (isMonthly && months.length === 0) {
    body = (
      <div className="empty-state">
        {monthlyMinDays
          ? `The monthly ledger opens once a month has ${monthlyMinDays} days.`
          : 'The monthly ledger is not open yet.'}
      </div>
    );
  } else if (!data) {
    body = loader;
  } else if (ranked.length === 0) {
    body =
      rows.length === 0 ? (
        <div className="empty-state">No entries yet. Be the first.</div>
      ) : (
        <p className="period-note">
          Nobody has reached {thresholds?.minDays} complete days yet.
        </p>
      );
  } else {
    body = (
      <div className="period-list">
        <div className="period-head" aria-hidden="true">
          <span />
          <span>Player</span>
          <span title="Solve rate">Solved</span>
          <span title="Average tries">Tries</span>
          <span title="Median time per solved word">Median</span>
          <span title="Score, lower is better">Score</span>
        </div>

        {ranked.map((row) => {
          const isYou = Boolean(viewerId) && row.user_id === viewerId;
          const classes = ['period-row'];
          if (isYou) classes.push('is-you');

          return (
            <div className={classes.join(' ')} key={row.user_id}>
              <span className="rank">{row.rank}</span>
              <span className="login">
                {row.avatar_url ? (
                  <img className="leaderboard-avatar" src={row.avatar_url} alt="" referrerPolicy="no-referrer" />
                ) : null}
                <span className="login-name">{row.login}</span>
              </span>
              <span className="period-num">{formatPct(row.solve_rate)}</span>
              <span className="period-num">{formatTries(row.avg_tries)}</span>
              <span className="period-num">{formatClock(row.median_time)}</span>
              <span className="period-score">{formatScore(row.score)}</span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <AlertModal message={error} onClose={() => setError('')} />

      {isMonthly && months && months.length > 0 && month && (
        <div className="ledger-date-picker">
          {/* aria-disabled instead of disabled so keyboard focus isn't dropped */}
          <button
            type="button"
            className="ledger-date-nav"
            onClick={() => olderMonth && setMonth(olderMonth)}
            aria-disabled={!olderMonth}
            aria-label="Previous month"
            title="Previous month"
          >
            <NavArrow direction="left" />
          </button>

          <span className="ledger-month-label" aria-live="polite">
            {monthLabel(month)}
          </span>

          <button
            type="button"
            className="ledger-date-nav"
            onClick={() => newerMonth && setMonth(newerMonth)}
            aria-disabled={!newerMonth}
            aria-label="Next month"
            title="Next month"
          >
            <NavArrow direction="right" />
          </button>
        </div>
      )}

      {body}
    </div>
  );
}
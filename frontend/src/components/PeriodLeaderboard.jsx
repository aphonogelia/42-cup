import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatTime } from '../lib/formatTime.js';
import AlertModal from './AlertModal.jsx';
import './PeriodLeaderboard.css';

const fetchPeriod = (isMonthly, month) =>
  isMonthly ? api.leaderboardMonthly(month) : api.leaderboardGlobal();

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

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

function Explainer({ thresholds }) {
  if (!thresholds) return null;
  const bonusPct = Math.round(thresholds.longevityMax * 100);
  const bonusAt = thresholds.longevityDays
    ? `${thresholds.longevityDays} complete days`
    : 'every day of the month';

  return (
    <details className="period-howto">
      <summary>How is this scored?</summary>
      <ul>
        <li>
          <b>Median word cost.</b> A solved word costs its time plus {thresholds.tryPenaltySeconds}s
          per extra try. We take the median, so one slow word doesn&rsquo;t ruin your score.
        </li>
        <li>
          <b>Unsolved words</b> add 1% to your score for every 1% of the words you started but
          didn&rsquo;t solve.
        </li>
        <li>
          <b>Playing often</b> takes up to {bonusPct}% off, reached at {bonusAt}.
        </li>
        <li>A day counts once you&rsquo;ve started all its words. Lower is better.</li>
      </ul>
    </details>
  );
}

export default function PeriodLeaderboard({ mode, viewerId }) {
  const isMonthly = mode === 'monthly';
  const [months, setMonths] = useState(null); // monthly tab only, newest first
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Months come from the dates the daily board already knows about.
  useEffect(() => {
    if (!isMonthly) return undefined;
    let cancelled = false;
    api
      .leaderboardDates()
      .then((dates) => {
        if (cancelled) return;
        const list = [...new Set(dates.map((d) => d.slice(0, 7)))].sort().reverse();
        setMonths(list);
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
    setExpandedId(null);

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
  const ranked = rows.filter((r) => r.rank != null);
  const unranked = rows.filter((r) => r.rank == null);
  // The monthly window always starts on the 1st, so its end date is the day count.
  const windowDays = isMonthly && data?.to ? Number(data.to.slice(8, 10)) : null;

  const loader = (
    <div className="ledger-loading" aria-busy="true">
      <div className="loader" aria-label="Loading" role="status" />
    </div>
  );

  const nameBlock = (row) => {
    const isYou = Boolean(viewerId) && row.user_id === viewerId;
    return (
      <span className="login">
        {row.avatar_url ? <img className="leaderboard-avatar" src={row.avatar_url} alt="" /> : null}
        <span className="login-name">{row.login}</span>
        {isYou ? <span className="you-tag">you</span> : null}
      </span>
    );
  };

  const detailItems = (row) => [
    ['Median word', formatTime(row.median_time)],
    ['Avg tries', row.avg_tries == null ? '—' : Number(row.avg_tries).toFixed(1)],
    ['Solved', `${row.words_solved}/${row.words_started} · ${row.solve_rate}%`],
    ['Days played', windowDays ? `${row.days_complete} of ${windowDays}` : String(row.days_complete)],
  ];

  let body;
  if (isMonthly && months === null) {
    body = loader;
  } else if (isMonthly && months.length === 0) {
    body = <div className="empty-state">No entries yet.</div>;
  } else if (!data) {
    body = loader;
  } else if (rows.length === 0) {
    body = <div className="empty-state">No entries yet. Be the first.</div>;
  } else {
    body = (
      <>
        <Explainer thresholds={thresholds} />

        {ranked.length > 0 ? (
          <div className="period-list">
            <div className="period-head" aria-hidden="true">
              <span />
              <span>Player</span>
              <span>Score</span>
              <span />
            </div>

            {ranked.map((row) => {
              const expanded = expandedId === row.user_id;
              const isYou = Boolean(viewerId) && row.user_id === viewerId;
              const classes = ['period-row'];
              if (expanded) classes.push('expanded');
              if (isYou) classes.push('is-you');
              if (row.rank <= 3) classes.push(`top-${row.rank}`);

              return (
                <div className={classes.join(' ')} key={row.user_id}>
                  <button
                    type="button"
                    className="period-row-main"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : row.user_id)}
                  >
                    <span className="rank">{row.rank}</span>
                    {nameBlock(row)}
                    <span className="period-score">{formatTime(row.score)}</span>
                    <svg
                      className="period-chevron"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {expanded && (
                    <dl className="period-detail">
                      {detailItems(row).map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="period-note">
            Nobody has reached {thresholds?.minDays} complete days yet.
          </p>
        )}

        {unranked.length > 0 && (
          <div className="period-list period-unranked">
            <div className="ledger-tier-label">
              Not ranked yet · needs {thresholds?.minDays} complete days
            </div>
            {unranked.map((row) => {
              const isYou = Boolean(viewerId) && row.user_id === viewerId;
              const reached = row.days_complete >= (thresholds?.minDays ?? Infinity);
              return (
                <div className={`period-row${isYou ? ' is-you' : ''}`} key={row.user_id}>
                  <div className="period-row-main static">
                    <span className="rank">–</span>
                    {nameBlock(row)}
                    <span className="period-progress">
                      {reached ? 'no solved words' : `${row.days_complete}/${thresholds?.minDays} days`}
                    </span>
                    <span />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
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
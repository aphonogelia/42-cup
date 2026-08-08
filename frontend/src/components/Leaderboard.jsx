import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import AlertModal from './AlertModal.jsx';

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

const STATUS_SYMBOL = {
  solved: 'o',
  failed: 'x',
  in_progress: '-',
  not_started: '-',
};

function formatStatusStrip(statuses, totalWords) {
  const normalized = Array.isArray(statuses) ? statuses : [];
  return Array.from({ length: totalWords ?? normalized.length }, (_, index) => {
    const status = normalized[index];
    return STATUS_SYMBOL[status] ?? '-';
  }).join(' ');
}

export default function Leaderboard({ totalWords }) {
  const [dates, setDates] = useState([]);
  const [datesLoaded, setDatesLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const skipNextFetch = useRef(false);

  const fetchLeaderboard = useCallback((date, { resetRows = false } = {}) => {
    let cancelled = false;

    if (resetRows) {
      setRows(null);
    }

    api
      .leaderboard(date)
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        if (!date) {
          skipNextFetch.current = true;
          setSelectedDate(data.date);
        }
      })
      .catch((err) => !cancelled && setError(err.message));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.leaderboardDates()
      .then((d) => { if (!cancelled) { setDates(d); setDatesLoaded(true); } })
      .catch(() => { if (!cancelled) setDatesLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    return fetchLeaderboard(selectedDate, { resetRows: true });
  }, [selectedDate, fetchLeaderboard]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      fetchLeaderboard(selectedDate);
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const intervalId = window.setInterval(refresh, 30000);

    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(intervalId);
    };
  }, [selectedDate, fetchLeaderboard]);

  const tiers = [];
  if (rows) {
    let current = null;
    for (const row of rows) {
      if (!current || current.words_found !== row.words_found) {
        current = { words_found: row.words_found, rows: [] };
        tiers.push(current);
      }
      current.rows.push(row);
    }
  }

  const loading = !rows || !datesLoaded;

  return (
    <div>
      <AlertModal message={error} onClose={() => setError('')} />

      {loading ? (
        <div className="ledger-loading" aria-busy="true">
          <div className="loader" aria-label="Loading" role="status" />
        </div>
      ) : (
        <>
          {dates.length > 0 && (
            <div className="ledger-date-picker">
              <select value={selectedDate ?? ''} onChange={(e) => setSelectedDate(e.target.value)}>
                {dates.map((d) => (
                  <option key={d} value={d}>{formatDateLabel(d)}</option>
                ))}
              </select>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="empty-state">No entries yet. Be the first.</div>
          ) : (
            tiers.map((tier) => (
              <div className="ledger-tier" key={tier.words_found}>
                <div className="ledger-tier-label">
                  {tier.words_found}/{totalWords ?? tier.words_found} solved
                </div>
                {tier.rows.map((row, i) => (
                  <div className="ledger-row" key={row.user_id}>
                    <span className="rank">{i + 1}</span>
                    <span className="login">
                      {row.avatar_url ? <img className="leaderboard-avatar" src={row.avatar_url} alt="" /> : null}
                      <span className="login-name">{row.login}</span>
                      <span className="leaderboard-statuses" aria-label={`Word status: ${formatStatusStrip(row.word_statuses, totalWords)}`}>
                        | {formatStatusStrip(row.word_statuses, totalWords)}
                      </span>
                    </span>
                    <span className="tries">{row.total_tries} tries</span>
                    <span className="time">{formatTime(row.total_time)}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
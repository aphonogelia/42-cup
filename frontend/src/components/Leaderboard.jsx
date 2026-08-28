import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import AlertModal from './AlertModal.jsx';
import WordTimesPopup from './WordTimesPopup.jsx';

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

const STATUS_LABEL = {
  solved: 'Solved',
  failed: 'Failed',
  in_progress: 'In progress',
  not_started: 'Not started',
};

function getStatusList(statuses, totalWords) {
  const normalized = Array.isArray(statuses) ? statuses : [];
  return Array.from(
    { length: totalWords ?? normalized.length },
    (_, i) => normalized[i] ?? 'not_started'
  );
}

export default function Leaderboard({ totalWords }) {
  const [dates, setDates] = useState([]);
  const [datesLoaded, setDatesLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [activePlayer, setActivePlayer] = useState(null); // { userId, login }
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
    rows.forEach((row, index) => {
      if (!current || current.words_found !== row.words_found) {
        current = { words_found: row.words_found, rows: [] };
        tiers.push(current);
      }
      current.rows.push({ ...row, rank: index + 1 });
    });
  }

  const loading = !rows || !datesLoaded;
  const effectiveDate = selectedDate ?? (dates.length > 0 ? dates[0] : null);

  return (
    <div>
      <AlertModal message={error} onClose={() => setError('')} />

      {activePlayer && effectiveDate && (
        <WordTimesPopup
          userId={activePlayer.userId}
          login={activePlayer.login}
          date={effectiveDate}
          onClose={() => setActivePlayer(null)}
        />
      )}

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
                {tier.rows.map((row) => {
                  const hasPlayed = row.total_tries > 0;
                  const isPrivate = row.privacy_enabled ?? true; // fail-safe: treat missing field as private
                  const clickable = hasPlayed && !isPrivate;

                  const nameBlock = (
                    <>
                      {row.avatar_url ? <img className="leaderboard-avatar" src={row.avatar_url} alt="" /> : null}
                      <span className="login-name">{row.login}</span>
                      <span
                        className="leaderboard-statuses"
                        aria-label={`Word status: ${getStatusList(row.word_statuses, totalWords)
                          .map((s) => STATUS_LABEL[s])
                          .join(', ')}`}
                      >
                        {getStatusList(row.word_statuses, totalWords).map((status, i) => (
                          <span key={i} className={`status-dot ${status}`} title={STATUS_LABEL[status]} />
                        ))}
                      </span>
                    </>
                  );

                  return (
                    <div className="ledger-row" key={row.user_id}>
                      <span className="rank">{row.rank}</span>
                      {clickable ? (
                        <button
                          type="button"
                          className="login login-clickable"
                          onClick={() => setActivePlayer({ userId: row.user_id, login: row.login })}
                        >
                          {nameBlock}
                        </button>
                      ) : (
                        <span className={`login ${hasPlayed && isPrivate ? 'login-private' : ''}`}>
                          {nameBlock}
                        </span>
                      )}
                      <span className="tries">{row.total_tries} tries</span>
                      <span className="time">{formatTime(row.total_time)}</span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
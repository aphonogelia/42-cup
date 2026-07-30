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

export default function Leaderboard({ totalWords }) {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.leaderboardDates().then((d) => !cancelled && setDates(d)).catch(() => { });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    api
      .leaderboard(selectedDate)
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        if (!selectedDate) setSelectedDate(data.date);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, [selectedDate]);

  if (error) return <div className="status-line error">{error}</div>;

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

  return (
    <div>
      {dates.length > 0 && (
        <div className="ledger-date-picker">
          <select value={selectedDate ?? ''} onChange={(e) => setSelectedDate(e.target.value)}>
            {dates.map((d) => (
              <option key={d} value={d}>{formatDateLabel(d)}</option>
            ))}
          </select>
        </div>
      )}

      {!rows ? (
        <div className="status-line">Loading ledger...</div>
      ) : rows.length === 0 ? (
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
                  {row.login}
                </span>
                <span className="tries">{row.total_tries} tries</span>
                <span className="time">{formatTime(row.total_time)}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
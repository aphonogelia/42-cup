import { useEffect, useState } from 'react';
import { api } from '../api.js';

function formatTime(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

export default function Leaderboard({ totalWords }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .leaderboard()
      .then((data) => !cancelled && setRows(data))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="status-line error">{error}</div>;
  if (!rows) return <div className="status-line">Loading ledger...</div>;
  if (rows.length === 0) return <div className="empty-state">No entries yet. Be the first.</div>;

  // Rows already come pre-sorted from the backend (words_found desc, total_time asc).
  // Group into tiers by words_found for the "7/7 first, then 6/7..." presentation.
  const tiers = [];
  let current = null;
  for (const row of rows) {
    if (!current || current.words_found !== row.words_found) {
      current = { words_found: row.words_found, rows: [] };
      tiers.push(current);
    }
    current.rows.push(row);
  }

  return (
    <div>
      {tiers.map((tier) => (
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
      ))}
    </div>
  );
}

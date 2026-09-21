import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import AlertModal from './AlertModal.jsx';
import WordTimesPopup from './WordTimesPopup.jsx';

function formatTime(seconds) {
  if (seconds == null) return '—';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
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

// ---- Calendar helpers ------------------------------------------------------

// Monday-first weekday labels (2024-01-01 was a Monday)
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' })
);

const pad2 = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' -> absolute month number (year * 12 + month0)
function monthIndex(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return y * 12 + (m - 1);
}

function DateCalendar({ dates, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const [viewIdx, setViewIdx] = useState(0);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  const available = useMemo(() => new Set(dates), [dates]);

  // Oldest / newest month that has data (ISO strings sort lexicographically)
  const bounds = useMemo(() => {
    if (dates.length === 0) return null;
    const sorted = [...dates].sort();
    return {
      min: monthIndex(sorted[0]),
      max: monthIndex(sorted[sorted.length - 1]),
    };
  }, [dates]);

  useEffect(() => {
    if (!open) return;

    const closeIfOutside = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', closeIfOutside);
    document.addEventListener('focusin', closeIfOutside); // tabbing away
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside);
      document.removeEventListener('focusin', closeIfOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!bounds) return null;

  const clamp = (idx) => Math.min(Math.max(idx, bounds.min), bounds.max);

  const toggle = () => {
    if (!open && value) setViewIdx(clamp(monthIndex(value)));
    setOpen((o) => !o);
  };

  const year = Math.floor(viewIdx / 12);
  const month = viewIdx % 12;
  const canPrev = viewIdx > bounds.min;
  const canNext = viewIdx < bounds.max;

  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const handleSelect = (dateKey) => {
    onSelect(dateKey);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div className="ledger-date-popover-wrap" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className={`ledger-date-trigger${open ? ' open' : ''}`}
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="3" x2="8" y2="7" />
          <line x1="16" y1="3" x2="16" y2="7" />
        </svg>
        <span>{value ? formatDateLabel(value) : 'Pick a date'}</span>
      </button>

      {open && (
        <div className="ledger-cal" role="dialog" aria-label="Choose a date">
          <div className="ledger-cal-head">
            <button
              type="button"
              className="ledger-cal-nav"
              onClick={() => canPrev && setViewIdx((v) => v - 1)}
              aria-disabled={!canPrev}
              aria-label="Previous month"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <div className="ledger-cal-title" aria-live="polite">
              {new Date(year, month, 1).toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </div>

            <button
              type="button"
              className="ledger-cal-nav"
              onClick={() => canNext && setViewIdx((v) => v + 1)}
              aria-disabled={!canNext}
              aria-label="Next month"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div className="ledger-cal-grid">
            {WEEKDAY_LABELS.map((label) => (
              <span key={label} className="ledger-cal-weekday">{label}</span>
            ))}

            {cells.map((day, i) => {
              if (day == null) return <span key={`blank-${i}`} />;

              const dateKey = `${year}-${pad2(month + 1)}-${pad2(day)}`;
              const isAvailable = available.has(dateKey);
              const isSelected = dateKey === value;

              return (
                <button
                  key={dateKey}
                  type="button"
                  className={`ledger-cal-day${isSelected ? ' selected' : ''}`}
                  disabled={!isAvailable}
                  aria-pressed={isSelected}
                  aria-label={formatDateLabel(dateKey)}
                  onClick={() => handleSelect(dateKey)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Leaderboard({ totalWords, viewerIsPrivate }) {
  const [dates, setDates] = useState([]);
  const [datesLoaded, setDatesLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  // activePlayer shapes:
  //   { type: 'view', userId, login }   -> show WordTimesPopup
  //   { type: 'viewer-private' }        -> viewer must go public to see anyone's results
  const [activePlayer, setActivePlayer] = useState(null);
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

  useEffect(() => {
  const handlePrivacyChanged = () => {
    fetchLeaderboard(selectedDate);
  };

  window.addEventListener('privacy-changed', handlePrivacyChanged);
  return () => window.removeEventListener('privacy-changed', handlePrivacyChanged);
}, [selectedDate, fetchLeaderboard]);

  const handlePlayerClick = (row) => {
    if (viewerIsPrivate) {
      setActivePlayer({ type: 'viewer-private' });
      return;
    }

    setActivePlayer({ type: 'view', userId: row.user_id, login: row.login });
  };

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

  const effectiveDate = selectedDate ?? (dates.length > 0 ? dates[0] : null);

  // dates is sorted newest -> oldest, so "older" is the next index and "newer" the previous one.
  // Navigation steps through the dates the API returns, so gaps are skipped automatically.
  const dateIndex = effectiveDate ? dates.indexOf(effectiveDate) : -1;
  const olderDate = dateIndex !== -1 ? dates[dateIndex + 1] ?? null : null;
  const newerDate = dateIndex > 0 ? dates[dateIndex - 1] : null;

  const loader = (
    <div className="ledger-loading" aria-busy="true">
      <div className="loader" aria-label="Loading" role="status" />
    </div>
  );

  return (
    <div>
      <AlertModal message={error} onClose={() => setError('')} />

      {activePlayer?.type === 'view' && effectiveDate && (
        <WordTimesPopup
          userId={activePlayer.userId}
          login={activePlayer.login}
          date={effectiveDate}
          onClose={() => setActivePlayer(null)}
        />
      )}

      {activePlayer?.type === 'viewer-private' && (
        <AlertModal
          message="Your profile is set to private. Make it public to see other players' results."
          onClose={() => setActivePlayer(null)}
        />
      )}

      {!datesLoaded ? (
        loader
      ) : (
        <>
          {/* Picker lives outside the rows-loading branch so it stays mounted (and keeps focus) while rows reload */}
          {dates.length > 0 && (
            <div className="ledger-date-picker">
              {/* aria-disabled instead of disabled: a disabled button drops keyboard focus */}
              <button
                type="button"
                className="ledger-date-nav"
                onClick={() => olderDate && setSelectedDate(olderDate)}
                aria-disabled={!olderDate}
                aria-label="Previous day"
                title="Previous day"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <DateCalendar
                dates={dates}
                value={effectiveDate}
                onSelect={setSelectedDate}
              />

              <button
                type="button"
                className="ledger-date-nav"
                onClick={() => newerDate && setSelectedDate(newerDate)}
                aria-disabled={!newerDate}
                aria-label="Next day"
                title="Next day"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          )}

          {!rows ? (
            loader
          ) : rows.length === 0 ? (
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
                      <span className={`login-name ${clickable ? 'login-public' : ''}`}>
                        {row.login}
                      </span>
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
                          onClick={() => handlePlayerClick(row)}
                        >
                          {nameBlock}
                        </button>
                      ) : (
                        <span className="login">
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
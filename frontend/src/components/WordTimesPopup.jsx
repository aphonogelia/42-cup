import { useEffect, useState } from 'react';
import { api } from '../api.js';

function formatTime(seconds) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function GuessHistory({ wordResultId }) {
  const [state, setState] = useState({ loading: true, guesses: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, guesses: null, error: '' });

    api
      .guesses(wordResultId)
      .then((data) => {
        if (!cancelled) setState({ loading: false, guesses: data.guesses, error: '' });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, guesses: null, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [wordResultId]);

  if (state.loading) {
    return <div className="guess-history-status">Loading…</div>;
  }
  if (state.error) {
    return <div className="guess-history-status error">{state.error}</div>;
  }
  if (!state.guesses || state.guesses.length === 0) {
    return <div className="guess-history-status">No guesses yet.</div>;
  }

  return (
    <div className="guess-history">
      {state.guesses.map((g, i) => (
        <div className="guess-history-row" key={i}>
          {g.guess.split('').map((letter, li) => (
            <span key={li} className={`guess-tile-mini ${g.feedback[li]}`}>
              {letter}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function WordTimeRow({ word }) {
  const squares = Math.max(word.nb_tries, 0);

  return (
    <div className="word-time-col">
      <div className="word-time-header">
        <span className="word-time-index">#{word.order_index}</span>
        <span className="word-time-value">{formatTime(word.time_seconds)}</span>
        <span className="word-time-squares">
          {Array.from({ length: squares }).map((_, i) => (
            <span key={i} className={`time-square ${word.status}`} />
          ))}
        </span>
      </div>
      <GuessHistory wordResultId={word.word_result_id} />
    </div>
  );
}

export default function WordTimesPopup({ userId, login, date, onClose }) {
  const [state, setState] = useState({ loading: true, words: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, words: null, error: '' });

    api
      .wordTimes(userId, date)
      .then((data) => {
        if (!cancelled) setState({ loading: false, words: data.words, error: '' });
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, words: null, error: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [userId, date]);

  return (
    <div className="info-overlay" onClick={onClose}>
      <div className="info-card word-times-card" onClick={(e) => e.stopPropagation()}>
        <div className="info-card-head">
          <p className="info-eyebrow">{login}</p>
          <button className="info-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {state.loading && <div className="guess-history-status">Loading…</div>}
        {state.error && <div className="guess-history-status error">{state.error}</div>}

        {state.words && (
          <div className="word-times-list">
            {state.words.map((w) => (
              <WordTimeRow key={w.word_id} word={w} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
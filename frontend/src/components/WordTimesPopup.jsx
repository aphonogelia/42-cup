import { useEffect, useState } from 'react';
import { api } from '../api.js';

function formatTime(seconds) {
  if (seconds == null) return '—';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function GuessHistory({ wordResultId, preloaded }) {
  const [state, setState] = useState(() =>
    preloaded ? { loading: false, guesses: preloaded, error: '' } : { loading: true, guesses: null, error: '' }
  );

  useEffect(() => {
    if (preloaded) {
      setState({ loading: false, guesses: preloaded, error: '' });
      return;
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

function WordTimeRow({ word, preloadedGuesses }) {
  return (
    <div className="word-time-col">
      <div className="word-time-header">
        <span className="word-time-index">#{word.order_index}</span>
        <span className="word-time-value">{formatTime(word.time_seconds)}</span>
      </div>
      <GuessHistory wordResultId={word.word_result_id} preloaded={preloadedGuesses} />
    </div>
  );
}

export default function WordTimesPopup({ userId, login, date, onClose }) {
  const [state, setState] = useState({ loading: true, words: null, error: '' });
  // Guess access is gated server-side as a single yes/no (has the viewer finished today?),
  // but the gate lives on the per-word guesses endpoint. Check it once, up front, with the
  // first word, instead of letting every row hit the same error independently.
  const [guessAccess, setGuessAccess] = useState({ checked: false, blocked: false, message: '', firstGuesses: null });

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, words: null, error: '' });
    setGuessAccess({ checked: false, blocked: false, message: '', firstGuesses: null });

    api
      .wordTimes(userId, date)
      .then((data) => {
        if (cancelled) return;
        setState({ loading: false, words: data.words, error: '' });

        const firstWord = data.words?.[0];
        if (!firstWord) {
          setGuessAccess({ checked: true, blocked: false, message: '', firstGuesses: null });
          return;
        }

        api
          .guesses(firstWord.word_result_id)
          .then((guessData) => {
            if (cancelled) return;
            setGuessAccess({ checked: true, blocked: false, message: '', firstGuesses: guessData.guesses });
          })
          .catch((err) => {
            if (cancelled) return;
            setGuessAccess({ checked: true, blocked: true, message: err.message, firstGuesses: null });
          });
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

        {state.words && !guessAccess.checked && (
          <div className="guess-history-status">Loading…</div>
        )}

        {state.words && guessAccess.checked && guessAccess.blocked && (
          <div className="guess-history-status error word-times-blocked">
            {guessAccess.message}
          </div>
        )}

        {state.words && guessAccess.checked && !guessAccess.blocked && (
          <div className="word-times-list">
            {state.words.map((w, i) => (
              <WordTimeRow
                key={w.word_id}
                word={w}
                preloadedGuesses={i === 0 ? guessAccess.firstGuesses : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
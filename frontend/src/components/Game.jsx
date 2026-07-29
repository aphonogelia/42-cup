import { useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../api.js';
import GameGrid, { computeLetterStates } from './GameGrid.jsx';
import Keyboard from './Keyboard.jsx';

export default function Game({ orderIndex, onWordFinished }) {
  const [wordState, setWordState] = useState(null); // { word_id, length, max_tries, guesses }
  const [currentGuess, setCurrentGuess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(null); // { status, time_seconds, answer } | null
  const [alreadyDone, setAlreadyDone] = useState(null); // status string if word was already solved/failed before this session

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setFinished(null);
    setAlreadyDone(null);
    setCurrentGuess('');

    api
      .start(orderIndex)
      .then((data) => {
        if (cancelled) return;
        setWordState(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 409) {
          setAlreadyDone(err.body?.status || 'finished');
        } else {
          setError(err.message);
        }
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [orderIndex]);

  const submitGuess = useCallback(async () => {
    if (!wordState || finished) return;
    if (currentGuess.length !== wordState.length) {
      setError(`Guess must be ${wordState.length} letters`);
      return;
    }
    setError('');
    try {
      const result = await api.guess(wordState.word_id, currentGuess);
      setWordState((prev) => ({
        ...prev,
        nb_tries: result.nb_tries,
        guesses: [...prev.guesses, { guess: currentGuess, feedback: result.feedback }],
      }));
      setCurrentGuess('');
      if (result.status !== 'in_progress') {
        setFinished(result);
        onWordFinished?.();
      }
    } catch (err) {
      setError(err.message);
    }
  }, [wordState, currentGuess, finished, onWordFinished]);

  const handleKey = useCallback(
    (key) => {
      if (finished || !wordState) return;
      if (key === 'enter') {
        submitGuess();
      } else if (key === 'back') {
        setCurrentGuess((g) => g.slice(0, -1));
      } else if (/^[a-z]$/.test(key) && currentGuess.length < wordState.length) {
        setCurrentGuess((g) => g + key);
      }
    },
    [finished, wordState, currentGuess, submitGuess]
  );

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Enter') handleKey('enter');
      else if (e.key === 'Backspace') handleKey('back');
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toLowerCase());
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleKey]);

  if (loading) return <div className="status-line">Loading word #{orderIndex}...</div>;

  if (alreadyDone) {
    return (
      <div className="game-panel">
        <div className={`result-banner ${alreadyDone}`}>
          Word #{orderIndex} already {alreadyDone}. Pick another from the tabs above.
        </div>
      </div>
    );
  }

  if (!wordState) {
    return <div className="status-line error">{error || 'Could not load word.'}</div>;
  }

  const letterStates = computeLetterStates(wordState.guesses);

  return (
    <div className="game-panel">
      <div className={`status-line ${error ? 'error' : ''}`}>
        {error || `Try ${wordState.nb_tries}/${wordState.max_tries}`}
      </div>

      <GameGrid
        length={wordState.length}
        maxTries={wordState.max_tries}
        guesses={wordState.guesses}
        currentGuess={currentGuess}
      />

      {finished && (
        <div className={`result-banner ${finished.status}`}>
          {finished.status === 'solved'
            ? `SOLVED in ${finished.nb_tries} ${finished.nb_tries === 1 ? 'try' : 'tries'} — ${Math.round(finished.time_seconds)}s`
            : `OUT OF TRIES — the word was "${finished.answer?.toUpperCase()}"`}
        </div>
      )}

      <Keyboard letterStates={letterStates} onKey={handleKey} disabled={!!finished} />
    </div>
  );
}

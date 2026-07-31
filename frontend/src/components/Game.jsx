import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import GameGrid, { getRevealDurationMs } from './GameGrid.jsx';
import { computeLetterStates } from '../lib/keyboardState.js';
import Keyboard from './Keyboard.jsx';
import AlertModal from './AlertModal.jsx';

const LOADING_ROWS = 6;
const LOADING_LENGTH = 5;

function LoadingBoard() {
  return (
    <div className="grid loading-grid" aria-hidden="true">
      {Array.from({ length: LOADING_ROWS }).map((_, rowIndex) => (
        <div
          className="grid-row"
          key={rowIndex}
          style={{ gridTemplateColumns: `repeat(${LOADING_LENGTH}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: LOADING_LENGTH }).map((__, columnIndex) => (
            <div className="tile tile-skeleton" key={columnIndex} />
          ))}
        </div>
      ))}
    </div>
  );
}

function AnimatedAnswer({ answer }) {
  return (
    <span className="answer-reveal" aria-label={answer}>
      {answer.split('').map((letter, index) => (
        <span key={`${letter}-${index}`} style={{ animationDelay: `${index * 120}ms` }}>
          {letter}
        </span>
      ))}
    </span>
  );
}

function formatDuration(totalSeconds) {
  if (totalSeconds == null || Number.isNaN(totalSeconds)) return '00:00';
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
}

export default function Game({ orderIndex, onWordFinished }) {
  const [wordState, setWordState] = useState(null);
  const [currentGuess, setCurrentGuess] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(null);
  const [revealRowIndex, setRevealRowIndex] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const revealTimeout = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMessage('');
    setFinished(null);
    setCurrentGuess('');
    setRevealRowIndex(null);
    setElapsedSeconds(0);
    if (revealTimeout.current) clearTimeout(revealTimeout.current);

    api
      .start(orderIndex)
      .then((data) => {
        if (cancelled) return;
        setWordState(data);
      })
      .catch((err) => !cancelled && setErrorMessage(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [orderIndex]);

  useEffect(() => () => {
    if (revealTimeout.current) clearTimeout(revealTimeout.current);
  }, []);

  useEffect(() => {
    if (!wordState?.started_at) return undefined;

    const startedAtMs = new Date(wordState.started_at).getTime();

    if (wordState.status !== 'in_progress') {
      setElapsedSeconds(Math.round(wordState.time_seconds ?? (Date.now() - startedAtMs) / 1000));
      return undefined;
    }

    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [wordState]);

  const submitGuess = useCallback(async () => {
    if (!wordState || finished || wordState.status !== 'in_progress' || revealRowIndex !== null) return;
    if (currentGuess.length !== wordState.length) {
      setErrorMessage(`Guess must be ${wordState.length} letters`);
      return;
    }
    try {
      const result = await api.guess(wordState.word_id, currentGuess);
      const rowIndex = wordState.guesses.length;
      const guessedWord = currentGuess;

      setWordState((prev) => ({
        ...prev,
        nb_tries: result.nb_tries,
        status: result.status ?? prev.status,
        time_seconds: result.time_seconds ?? prev.time_seconds,
        guesses: [...prev.guesses, { guess: guessedWord, feedback: result.feedback }],
      }));
      setCurrentGuess('');
      setRevealRowIndex(rowIndex);

      const duration = getRevealDurationMs(wordState.length);
      revealTimeout.current = setTimeout(() => {
        setRevealRowIndex(null);
        if (result.status !== 'in_progress') {
          setFinished(result);
          onWordFinished?.();
        }
      }, duration);
    } catch (err) {
      setErrorMessage(err.message);
    }
  }, [wordState, currentGuess, finished, revealRowIndex, onWordFinished]);

  const handleKey = useCallback(
    (key) => {
      if (finished || !wordState || wordState.status !== 'in_progress' || revealRowIndex !== null) return;
      if (key === 'enter') {
        submitGuess();
      } else if (key === 'back') {
        setCurrentGuess((g) => g.slice(0, -1));
      } else if (/^[a-z]$/.test(key) && currentGuess.length < wordState.length) {
        setCurrentGuess((g) => g + key);
      }
    },
    [finished, wordState, currentGuess, submitGuess, revealRowIndex]
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

  if (loading) {
    return (
      <div className="game-panel game-loading" aria-busy="true">
        <div className="status-line">Loading word #{orderIndex}...</div>

        <div className="board-wrap">
          <LoadingBoard />
          <Keyboard letterStates={{}} onKey={() => { }} disabled />
        </div>
      </div>
    );
  }

  if (!wordState) {
    return (
      <div className="game-panel">
        <AlertModal message={errorMessage || 'Could not load word.'} onClose={() => setErrorMessage('')} />
      </div>
    );
  }

  const letterStates = computeLetterStates(wordState.guesses);
  const isPlayable = wordState.status === 'in_progress' && !finished && revealRowIndex === null;

  return (
    <div className="game-panel">
      <div className="status-line">
        Time {formatDuration(elapsedSeconds)}
      </div>

      <div className="board-wrap">
        <GameGrid
          length={wordState.length}
          maxTries={wordState.max_tries}
          guesses={wordState.guesses}
          currentGuess={currentGuess}
          revealRowIndex={revealRowIndex}
        />
        <AlertModal message={errorMessage} onClose={() => setErrorMessage('')} />
      </div>

      {finished && (
        <div className={`result-banner ${finished.status}`}>
          {/* unchanged */}
        </div>
      )}

      <Keyboard letterStates={letterStates} onKey={handleKey} disabled={!isPlayable} />
    </div>
  );
}
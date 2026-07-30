import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import GameGrid, { getRevealDurationMs } from './GameGrid.jsx';
import { computeLetterStates } from '../lib/keyboardState.js';
import Keyboard from './Keyboard.jsx';
import Toast from './Toast.jsx';

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

export default function Game({ orderIndex, onWordFinished }) {
  const [wordState, setWordState] = useState(null);
  const [currentGuess, setCurrentGuess] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(null);
  const [revealRowIndex, setRevealRowIndex] = useState(null);
  const revealTimeout = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setToastMessage('');
    setFinished(null);
    setCurrentGuess('');
    setRevealRowIndex(null);
    if (revealTimeout.current) clearTimeout(revealTimeout.current);

    api
      .start(orderIndex)
      .then((data) => {
        if (cancelled) return;
        setWordState(data);
      })
      .catch((err) => !cancelled && setToastMessage(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [orderIndex]);

  useEffect(() => () => {
    if (revealTimeout.current) clearTimeout(revealTimeout.current);
  }, []);

  const submitGuess = useCallback(async () => {
    if (!wordState || finished || wordState.status !== 'in_progress' || revealRowIndex !== null) return;
    if (currentGuess.length !== wordState.length) {
      setToastMessage(`Guess must be ${wordState.length} letters`);
      return;
    }
    try {
      const result = await api.guess(wordState.word_id, currentGuess);
      const rowIndex = wordState.guesses.length;
      const guessedWord = currentGuess;

      setWordState((prev) => ({
        ...prev,
        nb_tries: result.nb_tries,
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
      setToastMessage(err.message);
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

  if (loading) return <div className="status-line">Loading word #{orderIndex}...</div>;

  if (!wordState) {
    return <div className="status-line error">{toastMessage || 'Could not load word.'}</div>;
  }

  const letterStates = computeLetterStates(wordState.guesses);
  const isPlayable = wordState.status === 'in_progress' && !finished && revealRowIndex === null;

  return (
    <div className="game-panel">
      <div className="status-line">
        {!finished && wordState.status === 'in_progress' ? `Try ${wordState.nb_tries}/${wordState.max_tries}` : ''}
      </div>

      <div className="board-wrap">
        <GameGrid
          length={wordState.length}
          maxTries={wordState.max_tries}
          guesses={wordState.guesses}
          currentGuess={currentGuess}
          revealRowIndex={revealRowIndex}
        />
        <Toast message={toastMessage} onDone={() => setToastMessage('')} />
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
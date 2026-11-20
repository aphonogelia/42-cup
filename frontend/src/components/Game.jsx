import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import GameGrid, { getRevealDurationMs, getShakeDurationMs } from './GameGrid.jsx';
import { computeLetterStates } from '../lib/keyboardState.js';
import { isAllowedGuess } from '../lib/guessDictionary.js';
import { createSubmissionId } from '../lib/submissionId.js';
import Keyboard from './Keyboard.jsx';
import AlertModal from './AlertModal.jsx';
import './Game.css';

const LOADING_ROWS = 6;
const LOADING_LENGTH = 5;
const BERLIN_TIME_ZONE = 'Europe/Berlin';
const WORD_STATE_CACHE_PREFIX = 'wordel-word-state';

function getBerlinDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getWordStateCacheKey(userLogin, orderIndex, dateKey = getBerlinDateKey()) {
  return `${WORD_STATE_CACHE_PREFIX}-${userLogin}-${dateKey}-${orderIndex}`;
}

function isFinishedStatus(status) {
  return status === 'solved' || status === 'failed';
}

function readCachedWordState(userLogin, orderIndex) {
  if (!userLogin || typeof window === 'undefined') return null;

  try {
    const cached = window.localStorage.getItem(getWordStateCacheKey(userLogin, orderIndex));
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedWordState(userLogin, orderIndex, wordState) {
  if (!userLogin || !wordState || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      getWordStateCacheKey(userLogin, orderIndex),
      JSON.stringify(wordState)
    );
  } catch {
    // Ignore storage failures (private mode / quota exceeded).
  }
}

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

export default function Game({ userLogin, orderIndex, onWordUpdate, onProgressChanged, nextOrderIndex, onNext }) {
  const [wordState, setWordState] = useState(null);
  const [currentGuess, setCurrentGuess] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [finished, setFinished] = useState(null);
  const [revealRowIndex, setRevealRowIndex] = useState(null);
  const [shakeRowIndex, setShakeRowIndex] = useState(null);
  const [pendingGuess, setPendingGuess] = useState(null);
  const revealTimeout = useRef(null);
  const shakeTimeout = useRef(null);
  const submittingRef = useRef(false);
  const revealingRef = useRef(false);
  // Idempotency key for the in-flight/last failed submission. Reused only when
  // the same guess for the same word is retried.
  const pendingSubmissionRef = useRef(null);
  const nextWordBtnRef = useRef(null);
  // Bumped whenever the board is reset, so late responses from the previous
  // word are dropped instead of leaking into the new one.
  const syncGeneration = useRef(0);
  const syncInFlight = useRef(-1);
  const onProgressChangedRef = useRef(onProgressChanged);

  useEffect(() => {
    onProgressChangedRef.current = onProgressChanged;
  }, [onProgressChanged]);

  // Loads the authoritative state for the current word. Used on mount and
  // whenever the tab comes back into focus, so a word played (or finished) on
  // another device shows up here without a manual page reload.
  const loadWordState = useCallback(async ({ notifyParent = false, silent = false } = {}) => {
    const generation = syncGeneration.current;
    // `focus` and `visibilitychange` usually fire together; collapse them into
    // a single request.
    if (syncInFlight.current === generation) return;
    syncInFlight.current = generation;

    try {
      const data = await api.start(orderIndex);
      if (generation !== syncGeneration.current) return;
      // A local guess is being revealed: the local state is ahead of the
      // server snapshot we just read, so keep it.
      if (submittingRef.current || revealingRef.current) return;

      setWordState(data);
      writeCachedWordState(userLogin, orderIndex, data);
      // A finished word must restore its result panel (and next word button),
      // even when it was finished somewhere else.
      if (isFinishedStatus(data.status)) {
        setFinished(data);
        setCurrentGuess('');
      }

      // Refresh the tab timers with the same data the board just showed.
      if (notifyParent) onProgressChangedRef.current?.();
    } catch (err) {
      if (generation === syncGeneration.current && !silent) setErrorMessage(err.message);
    } finally {
      if (syncInFlight.current === generation) syncInFlight.current = -1;
      if (generation === syncGeneration.current) setLoading(false);
    }
  }, [orderIndex, userLogin]);

  // Reset everything (including shake) when switching to a different word.
  useEffect(() => {
    syncGeneration.current += 1;
    const cachedState = readCachedWordState(userLogin, orderIndex);
    if (cachedState) {
      setWordState(cachedState);
      setLoading(false);
    } else {
      setWordState(null);
      setLoading(true);
    }
    setErrorMessage('');
    setFinished(null);
    setCurrentGuess('');
    setRevealRowIndex(null);
    setPendingGuess(null);
    setShakeRowIndex(null);
    revealingRef.current = false;
    pendingSubmissionRef.current = null;
    if (revealTimeout.current) clearTimeout(revealTimeout.current);
    if (shakeTimeout.current) clearTimeout(shakeTimeout.current);

    loadWordState();
  }, [orderIndex, userLogin, loadWordState]);

  // Pick up progress made elsewhere as soon as the tab regains focus.
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === 'hidden') return;
      loadWordState({ notifyParent: true, silent: true });
    };

    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [loadWordState]);

  // Cleanup on unmount only — declared once.
  useEffect(() => () => {
    if (revealTimeout.current) clearTimeout(revealTimeout.current);
    if (shakeTimeout.current) clearTimeout(shakeTimeout.current);
  }, []);

  const triggerShake = useCallback(() => {
    if (!wordState) return;
    setShakeRowIndex(wordState.guesses.length);
    if (shakeTimeout.current) clearTimeout(shakeTimeout.current);
    shakeTimeout.current = setTimeout(() => setShakeRowIndex(null), getShakeDurationMs());
  }, [wordState]);

  // Mirrors the server's canonical board. Used for every outcome that did not
  // consume a try: a rejected duplicate, a finished word, or a replayed retry.
  const applyServerGuessState = useCallback((result) => {
    setWordState((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        nb_tries: result.nb_tries,
        status: result.status ?? prev.status,
        time_seconds: result.time_seconds ?? prev.time_seconds,
        started_at: result.started_at ?? prev.started_at,
        guesses: result.guesses ?? prev.guesses,
        ...(result.answer ? { answer: result.answer } : {}),
      };
      writeCachedWordState(userLogin, orderIndex, next);
      return next;
    });
  }, [orderIndex, userLogin]);

  const submitGuess = useCallback(async () => {
    if (!wordState || finished || (wordState.status !== 'not_started' && wordState.status !== 'in_progress') || revealRowIndex !== null) return;
    if (submittingRef.current) return;
    if (currentGuess.length !== wordState.length) {
      setErrorMessage(`Guess must be ${wordState.length} letters`);
      triggerShake();
      return;
    }

    submittingRef.current = true;
    try {
      const locallyAllowed = await isAllowedGuess(currentGuess);
      if (locallyAllowed === false) {
        setErrorMessage('Not a recognized word');
        triggerShake();
        return;
      }

      const guessKey = currentGuess.toLowerCase();
      const pending = pendingSubmissionRef.current;
      const submissionId =
        pending && pending.wordId === wordState.word_id && pending.guess === guessKey
          ? pending.id
          : createSubmissionId();
      pendingSubmissionRef.current = { wordId: wordState.word_id, guess: guessKey, id: submissionId };

      const result = await api.guess(wordState.word_id, currentGuess, submissionId);
      pendingSubmissionRef.current = null;

      if (result.outcome !== 'accepted') {
        // Duplicate rule or a word that is already over. Never paint a row or
        // run the reveal; mirror what the server already has.
        applyServerGuessState(result);
        if (result.outcome === 'duplicate_guess' && !isFinishedStatus(result.status)) {
          // Same rejection style as a dictionary miss: keep the typed word so
          // the player can edit it.
          setErrorMessage('Already guessed that word');
          triggerShake();
        } else {
          setCurrentGuess('');
        }
        if (isFinishedStatus(result.status)) setFinished(result);
        return;
      }

      const rowIndex = wordState.guesses.length;
      const guessedWord = currentGuess;

      setPendingGuess({
        guess: guessedWord,
        feedback: result.feedback,
      });
      setCurrentGuess('');
      setRevealRowIndex(rowIndex);
      revealingRef.current = true;

      const duration = getRevealDurationMs(wordState.length);

      revealTimeout.current = setTimeout(() => {
        revealingRef.current = false;

        // Mirror the guess response into the board and the tab square at the
        // same time, so the timer can never disagree with the grid.
        setWordState((prev) => {
          const nextState = {
            ...prev,
            nb_tries: result.nb_tries,
            status: result.status ?? prev.status,
            time_seconds: result.time_seconds ?? prev.time_seconds,
            started_at: result.started_at ?? prev.started_at ?? new Date().toISOString(),
            guesses: result.guesses ?? [
              ...prev.guesses,
              {
                guess: guessedWord,
                feedback: result.feedback,
              },
            ],
          };
          writeCachedWordState(userLogin, orderIndex, nextState);
          return nextState;
        });

        setPendingGuess(null);
        setRevealRowIndex(null);

        const nextStatus = result.status ?? wordState.status;
        if (nextStatus !== 'in_progress') setFinished(result);

        // Update the tab square from the exact response the grid just used, so
        // its timer/status can never lag behind the board.
        onWordUpdate?.(orderIndex, {
          status: nextStatus,
          time_seconds: result.time_seconds ?? wordState.time_seconds,
          started_at: result.started_at ?? wordState.started_at ?? new Date().toISOString(),
        });

        // A finished word still needs the server pass for the completion
        // toast and the final ordering of the tabs.
        if (nextStatus !== 'in_progress') {
          onProgressChangedRef.current?.({ checkCompletion: true });
        }
      }, duration);

    } catch (err) {
      // Keep the id across network and server failures: if the request actually
      // landed, the retry replays it instead of being rejected as a duplicate.
      // A 409 means the id was reused for another guess; a fresh one is needed.
      if (err.status === 409) pendingSubmissionRef.current = null;
      setErrorMessage(err.message);
      triggerShake();
    } finally {
      submittingRef.current = false;
    }
  }, [wordState, currentGuess, finished, revealRowIndex, onWordUpdate, userLogin, orderIndex, triggerShake, applyServerGuessState]);

  const handleKey = useCallback(
    (key) => {
      if (finished || !wordState || (wordState.status !== 'not_started' && wordState.status !== 'in_progress') || revealRowIndex !== null) return;
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


  const showNextWordButton = finished && nextOrderIndex != null && nextOrderIndex !== orderIndex;

  useEffect(() => {
    if (showNextWordButton) {
      nextWordBtnRef.current?.focus();
    }
  }, [showNextWordButton]);


  if (loading) {
    return (
      <div className="game-panel game-loading" aria-busy="true">
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
  const isPlayable = (wordState.status === 'not_started' || wordState.status === 'in_progress') && !finished && revealRowIndex === null;

  return (
    <div className="game-panel">


      <div className="board-wrap">
        <GameGrid
          length={wordState.length}
          maxTries={wordState.max_tries}
          guesses={
            pendingGuess
              ? [...wordState.guesses, pendingGuess]
              : wordState.guesses
          }
          currentGuess={currentGuess}
          revealRowIndex={revealRowIndex}
          shakeRowIndex={shakeRowIndex}
        />
        <AlertModal message={errorMessage} onClose={() => setErrorMessage('')} />
      </div>

      <div className="game-footer-action">
        {finished ? (
          <div className="finished-panel">
            {finished.status !== 'solved' && (
              <div className={`result-banner ${finished.status}`}>
                <span>Word was:</span>
                {finished.answer && (
                  <AnimatedAnswer answer={finished.answer.toUpperCase()} />
                )}
              </div>
            )}



            {showNextWordButton && (
              <button
                type="button"
                className="next-word-btn"
                ref={nextWordBtnRef}
                onClick={onNext}
              >
                Next word →
              </button>
            )}

          </div>
        ) : (
          <Keyboard letterStates={letterStates} onKey={handleKey} disabled={!isPlayable} />
        )}
      </div>
    </div>
  );
}
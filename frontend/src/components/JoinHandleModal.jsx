import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Escape, the backdrop and the close button all cancel: in join mode the parent
// keeps the 42 board, so nothing changes until the PUT succeeds.

const COPY = {
  join: {
    eyebrow: 'Open leaderboard',
    title: 'Join the Open leaderboard',
    body: 'To join the Open leaderboard, choose a handle.',
    primary: 'Join',
  },
  'guest-choose': {
    eyebrow: 'Open leaderboard',
    title: 'Choose your handle',
    body: 'Your handle is shown on the Open leaderboard. You can only choose it once.',
    primary: 'Continue',
  },
};

const STATUS_TEXT = {
  idle: '',
  checking: 'Checking…',
  available: 'Available',
  taken: 'Already taken',
  invalid: '',
  'rate-limited': 'Too many checks, wait a moment',
  error: 'Could not check that handle',
};

const initialCheck = { status: 'idle', handle: '', message: '' };

export default function JoinHandleModal({ mode, onClose, onDone }) {
  const copy = COPY[mode];
  const close = onClose;

  const [value, setValue] = useState('');
  const [check, setCheck] = useState(initialCheck);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const trimmed = value.trim();
  const canSubmit = check.status === 'available' && check.handle === trimmed;

  // Focus goes into the dialog, and back to where it came from on close.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    inputRef.current?.focus();

    return () => {
      const previous = restoreFocusRef.current;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // 300 ms debounce so the field does not hammer the rate limiter.
  useEffect(() => {
    if (!trimmed) {
      setCheck(initialCheck);
      return undefined;
    }

    setCheck({ status: 'checking', handle: trimmed, message: '' });

    let cancelled = false;
    const timer = window.setTimeout(() => {
      api
        .handleAvailable(trimmed)
        .then((data) => {
          if (cancelled) return;
          setCheck({
            status: data.available ? 'available' : 'taken',
            handle: trimmed,
            message: '',
          });
        })
        .catch((err) => {
          if (cancelled) return;
          if (err.status === 429) {
            setCheck({ status: 'rate-limited', handle: trimmed, message: 'Too many checks, wait a moment' });
          } else if (err.status === 400) {
            setCheck({ status: 'invalid', handle: trimmed, message: err.message });
          } else {
            setCheck({ status: 'error', handle: trimmed, message: 'Could not check that handle' });
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmed]);

  const submit = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const updated = await api.joinGlobal(trimmed);
      onDone(updated);
    } catch (err) {
      if (err.status === 409) {
        setError(err.body?.locked ? 'Your handle is locked' : 'This handle is already taken');
      } else if (err.status === 400) {
        setError(err.message || 'Something went wrong');
      } else {
        setError('Something went wrong');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const statusText =
    check.status === 'invalid' || check.status === 'rate-limited'
      ? check.message
      : STATUS_TEXT[check.status] ?? '';

  return (
    <div className="info-overlay" role="presentation" onClick={close}>
      <section
        className="info-card join-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="info-card-head">
          <p className="info-eyebrow">{copy.eyebrow}</p>
          <button type="button" className="info-close" onClick={close} aria-label="Close dialog">
            ×
          </button>
        </div>

        <h2 id="join-title">{copy.title}</h2>

        <div className="info-copy">
          <p>{copy.body}</p>

          <label className="join-field">
            <span>Handle</span>
            <input
              ref={inputRef}
              type="text"
              value={value}
              maxLength={16}
              autoComplete="off"
              spellCheck={false}
              placeholder="your-handle"
              onChange={(event) => {
                setValue(event.target.value);
                setError('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </label>

          <p className={`join-status ${check.status}`} aria-live="polite">
            {statusText}
          </p>

          {error && <p className="info-error" role="alert">{error}</p>}

          <div className="info-action-row">
            <button
              type="button"
              className="info-btn join-primary"
              disabled={!canSubmit || submitting}
              onClick={submit}
            >
              {submitting ? 'Saving…' : copy.primary}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

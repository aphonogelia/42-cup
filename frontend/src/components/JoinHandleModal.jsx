import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Escape and a backdrop click mean "Just looking" in join mode, so the parent
// gets onDismiss there and a plain onClose in guest mode.

const COPY = {
  join: {
    eyebrow: 'Open leaderboard',
    title: 'Join the Open leaderboard',
    body: "Your handle is shown instead of your login. Your results are the same on both boards, so players can compare them. You can't leave and you can't change your handle once you join.",
    primary: 'Join with a handle',
    confirm: (handle) => `Join as ${handle}? This can't be undone.`,
  },
  'guest-choose': {
    eyebrow: 'Open leaderboard',
    title: 'Choose your handle',
    body: 'Your handle is shown on the Open leaderboard. You can only choose it once.',
    primary: 'Continue',
    confirm: (handle) => `Use ${handle}? You can't change it again.`,
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

export default function JoinHandleModal({ mode, me, onDismiss, onClose, onDone }) {
  const copy = COPY[mode];
  const isJoin = mode === 'join';
  const close = isJoin ? onDismiss : onClose;

  const [value, setValue] = useState('');
  const [check, setCheck] = useState(initialCheck);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const inputRef = useRef(null);
  const confirmRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const trimmed = value.trim();
  const ownLogin =
    isJoin && me?.login && trimmed.toLowerCase() === me.login.toLowerCase();
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
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

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
            handle: data.handle ?? trimmed,
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
    setSubmitting(true);
    setError('');

    try {
      const updated = await api.joinGlobal(trimmed);
      onDone(updated);
    } catch (err) {
      if (err.status === 409) {
        setError(err.body?.locked ? 'Your handle is locked' : 'This handle is already taken');
      } else {
        setError(err.message || 'Something went wrong');
      }
      setConfirming(false);
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

          {!confirming ? (
            <>
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
                />
              </label>

              <p className={`join-status ${check.status}`} aria-live="polite">
                {statusText}
              </p>

              {ownLogin && (
                <p className="join-warning">
                  This is your 42 login. It would link your Open entry to your login.
                </p>
              )}

              {error && <p className="info-error" role="alert">{error}</p>}

              <div className="info-action-row">
                <button
                  type="button"
                  className="info-btn join-primary"
                  disabled={!canSubmit}
                  onClick={() => {
                    setError('');
                    setConfirming(true);
                  }}
                >
                  {copy.primary}
                </button>

                {isJoin && (
                  <button type="button" className="info-btn" onClick={onDismiss}>
                    Just looking
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="join-confirm">{copy.confirm(trimmed)}</p>

              {error && <p className="info-error" role="alert">{error}</p>}

              <div className="info-action-row">
                <button
                  ref={confirmRef}
                  type="button"
                  className="info-btn join-primary"
                  disabled={submitting}
                  onClick={submit}
                >
                  {submitting ? 'Saving…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  className="info-btn"
                  disabled={submitting}
                  onClick={() => setConfirming(false)}
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

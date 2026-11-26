import { useEffect, useRef } from 'react';

// One-time notice for the Open board. Escape, the close button and the backdrop
// all dismiss it; the parent records that it was seen.
export default function AnnouncementModal({ isGuest, onClose }) {
  const buttonRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    buttonRef.current?.focus();

    return () => {
      const previous = restoreFocusRef.current;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="info-overlay" role="presentation" onClick={onClose}>
      <section
        className="info-card announcement-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="info-card-head">
          <p className="info-eyebrow">Leaderboard</p>
          <button type="button" className="info-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>

        <h2 id="announcement-title">Open leaderboard</h2>

        <div className="info-copy">
          <p>
            {isGuest
              ? 'New: guests can now join the leaderboard. Go check your rank in the ledger!'
              : "New: the Open leaderboard. It's open to everyone, guests included. To join, choose a handle in the Ledger."}
          </p>

          <div className="info-action-row">
            <button
              ref={buttonRef}
              type="button"
              className="info-btn"
              onClick={onClose}
            >
              Got it
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

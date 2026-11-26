import { useEffect, useRef } from 'react';

// One-time notice for the Open board. Escape, the close button and the backdrop
// all dismiss it; the parent records that it was seen.
export default function AnnouncementModal({ isGuest, onClose }) {
  const cardRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement;
    cardRef.current?.focus();

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
        ref={cardRef}
        tabIndex={-1}
        className="info-card announcement-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="announcement-head">
          <span className="announcement-tag">New</span>
          <h2 id="announcement-title">Open leaderboard</h2>
          <button type="button" className="info-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>

        <div className="info-copy announcement-copy">
          <p>
            {isGuest
              ? "Guests can now join the leaderboard. You're on the Open board, so check your rank in the Ledger."
              : "It's open to everyone, guests included. To join, choose a handle in the Ledger."}
          </p>

          <div className="announcement-actions">
            <button type="button" className="announcement-btn" onClick={onClose}>
              Got it
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

import { useEffect } from 'react';
import { CONTACT_EMAIL } from './legal.js';

function linkify(text) {
  if (!text.includes(CONTACT_EMAIL)) return text;

  const parts = text.split(CONTACT_EMAIL);

  return parts.map((part, index) => (
    <span key={index}>
      {part}
      {index < parts.length - 1 && (
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      )}
    </span>
  ));
}

function Block({ block }) {
  return (
    <section className="legal-section">
      {block.heading && <h3>{block.heading}</h3>}

      {block.lines && (
        <p>
          {block.lines.map((line, index) => (
            <span key={index}>
              {index > 0 && <br />}
              {linkify(line)}
            </span>
          ))}
        </p>
      )}

      {block.paragraphs?.map((paragraph, index) => (
        <p key={index}>{linkify(paragraph)}</p>
      ))}
    </section>
  );
}

/**
 * Same interaction as on the game side: an overlay, not a route. The stat site
 * has no router and does not need one for two static pages.
 */
export default function LegalDialog({ page, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="legal-overlay" role="presentation" onClick={onClose}>
      <section
        className="legal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="legal-head">
          <p className="legal-eyebrow">{page.eyebrow}</p>
          <button type="button" className="legal-close" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </div>
        <h2 id="legal-title">{page.title}</h2>
        <div className="legal-copy">
          {page.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </div>
      </section>
    </div>
  );
}

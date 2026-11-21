/**
 * The legal footer. Rendered inside the app shell and on the login screen, so
 * the Impressum stays reachable before any account exists (§ 5 DDG: "ständig
 * verfügbar", Art. 13 GDPR: information at the time of collection).
 */
export default function LegalFooter({ onOpen }) {
  return (
    <footer className="app-footer">
      <button type="button" onClick={() => onOpen('about')}>About</button>

      <button type="button" onClick={() => onOpen('impressum')}>Impressum</button>

      <button type="button" onClick={() => onOpen('privacy')}>Datenschutz</button>
    </footer>
  );
}

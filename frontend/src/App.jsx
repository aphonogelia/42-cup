import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { api, TOKEN_KEY } from './api.js';
import Login from './components/Login.jsx';
import WordTabs from './components/WordTabs.jsx';
import Game from './components/Game.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import AuthCallback from './components/AuthCallback.jsx';
import AlertModal from './components/AlertModal.jsx';
import Stats from './components/Stats.jsx';
import LoginRequired from './components/LoginRequired.jsx';
import LegalFooter from './components/LegalFooter.jsx';
import { CONTACT_EMAIL, IMPRESSUM, PRIVACY, PRIVACY_EN } from './legal.js';

const PROGRESS_CACHE_PREFIX = 'wordel-progress';
const BERLIN_TIME_ZONE = 'Europe/Berlin';

// Marks where the scoring paragraphs go in the About page. They are built from
// the thresholds the API returns, so the numbers are never hardcoded here.
const SCORING_PLACEHOLDER = '__scoring__';

function scoringParagraphs(rules) {
  const monthly = rules?.monthly;
  const global = rules?.global;

  const penalty = monthly ? `${monthly.tryPenaltySeconds} seconds` : 'a penalty';
  const bonus = monthly ? `up to ${Math.round(monthly.longevityMax * 100)}%` : 'a bonus';
  const globalBonusAt = global?.longevityDays
    ? `${global.longevityDays} complete days on the all-time board`
    : 'a set number of complete days on the all-time board';
  const monthlyMin = monthly ? `${monthly.minDays} counted days` : 'a minimum number of counted days';
  const globalMin = global ? `${global.minDays} counted days` : 'a minimum number of counted days';
  const monthlyListed = monthly ? `${monthly.minDays} days` : 'enough days';
  const failText = monthly?.failWeight
    ? `add ${monthly.failWeight}% to the score for every percent of your words left unsolved`
    : 'make the score worse';

  return [
    `Monthly and all-time rankings use a score where lower is better. Each solved word costs its time plus ${penalty} for every extra try, and the median of these costs is taken so one slow word doesn’t ruin your score.`,
    `Words you started but didn’t solve ${failText}. Playing often takes ${bonus} off, reached when you have played every day of the month on the monthly board, and after ${globalBonusAt}.`,
    `A day counts once you’ve started all its words. You need ${monthlyMin} to be ranked on a month, which is listed once it has ${monthlyListed}, and ${globalMin} to be ranked all-time. The median shown in the table is your typical time per solved word, without the try penalty.`,
  ];
}

const INFO_PAGES = {
  about: {
    title: 'About',
    eyebrow: 'The 42 Cup',
    body: [
    'wordel // 42 Cup is a small thing made by Helene Tharrault (htharrau).',
    'Each day at midnight (Paris time), a new set of words is drawn at random from a pool of about 2,000 past NYT Wordle answers plus 500 curated words. A word, once drawn, rests for 90 days before it may return. Guesses are checked against the same 14,855 words as the official Wordle.',
    'Every word has its own clock. It starts at your first guess and stops when you solve the word or spend your sixth attempt. The times are added together, so quickness weighs as much as accuracy.',
    'On certain special days (May 1st, Diwali, and a few others) the pool itself changes to themed words, chosen to match the occasion.',
    SCORING_PLACEHOLDER,
    'The game is meant to be played honestly: suspicious answers are kept off the leaderboard, and the player is contacted for clarification.',
    'The server is hosted on free tiers (Render), so it may take a little while to wake up on your first visit. Thanks for your patience!',
  ],
  },
};

function formatTimeShort(seconds) {
  if (seconds == null) return '--:--';

  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;

  return `${m}:${String(s).padStart(2, '0')}`;
}


// Turns the contact address inside a paragraph into a mailto link. Plain
// markup, no obfuscation: the Impressum has to stay readable.
function linkify(text) {
  if (!text.includes(CONTACT_EMAIL)) return text;

  const parts = text.split(CONTACT_EMAIL);

  return parts.map((part, index) => (
    <Fragment key={index}>
      {part}
      {index < parts.length - 1 && (
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      )}
    </Fragment>
  ));
}

function InfoBlock({ block }) {
  if (typeof block === 'string') {
    return <p>{linkify(block)}</p>;
  }

  if (block.rule) {
    return <hr className="info-divider" />;
  }

  return (
    <section className="info-section">
      {block.heading && <h3>{block.heading}</h3>}

      {block.lines && (
        <p>
          {block.lines.map((line, index) => (
            <Fragment key={index}>
              {index > 0 && <br />}
              {linkify(line)}
            </Fragment>
          ))}
        </p>
      )}

      {block.paragraphs?.map((paragraph, index) => (
        <p key={index}>{linkify(paragraph)}</p>
      ))}
    </section>
  );
}

function AccountActions({ busy, confirming, error, onDownload, onRequestDelete, onConfirmDelete, onCancel }) {
  return (
    <section className="info-actions">
      <h3>Deine Daten</h3>
      <p>
        Du kannst deine Daten hier herunterladen oder dein Konto endgültig löschen.
        Das gilt auch für Gastkonten.
      </p>

      {confirming ? (
        <div className="info-action-row">
          <button type="button" className="info-btn danger" onClick={onConfirmDelete} disabled={busy}>
            {busy ? 'lösche…' : 'Ja, endgültig löschen'}
          </button>
          <button type="button" className="info-btn" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
        </div>
      ) : (
        <div className="info-action-row">
          <button type="button" className="info-btn" onClick={onDownload} disabled={busy}>
            Meine Daten herunterladen
          </button>
          <button type="button" className="info-btn danger" onClick={onRequestDelete} disabled={busy}>
            Konto löschen
          </button>
        </div>
      )}

      {error && <p className="info-error" role="alert">{error}</p>}
    </section>
  );
}

function InfoModal({
  page,
  rules,
  onClose,
  showAccountActions = false,
  accountBusy = false,
  accountError = '',
  accountConfirming = false,
  onDownloadData,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}) {
  const content =
    page === 'impressum'
      ? IMPRESSUM
      : page === 'privacy'
        ? PRIVACY
        : INFO_PAGES[page];

  if (!content) return null;

  const body =
    page === 'privacy'
      ? [...PRIVACY.blocks, { rule: true }, ...PRIVACY_EN.blocks]
      : (content.blocks ?? content.body).flatMap((block) =>
        block === SCORING_PLACEHOLDER ? scoringParagraphs(rules) : [block]
      );

  return (
    <div className="info-overlay" role="presentation" onClick={onClose}>
      <section
        className="info-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-title"
        aria-describedby="info-body"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="info-card-head">
          <p className="info-eyebrow">{content.eyebrow}</p>
          <button className="icon-btn info-close" onClick={onClose} aria-label="Close dialog" title="Close">
            ×
          </button>
        </div>
        <h2 id="info-title">{content.title}</h2>
        <div id="info-body" className="info-copy">
          {body.map((block, index) => (
            <InfoBlock key={index} block={block} />
          ))}

          {showAccountActions && (
            <AccountActions
              busy={accountBusy}
              confirming={accountConfirming}
              error={accountError}
              onDownload={onDownloadData}
              onRequestDelete={onRequestDelete}
              onConfirmDelete={onConfirmDelete}
              onCancel={onCancelDelete}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.5 3.75a8.5 8.5 0 1 0 4.75 14.87A9.5 9.5 0 1 1 15.5 3.75Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18M10.58 10.58a3 3 0 0 0 4.24 4.24M6.53 6.53C4.11 8.14 2 12 2 12s3.5 7 10 7c1.61 0 3.02-.38 4.24-.98M17.47 17.47C19.89 15.86 22 12 22 12s-1.3-2.6-3.53-4.53" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 17l5-5-5-5M15 12H3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.55 2.85c.72-.23 1.39.45 1.16 1.17l-4.91 16.05c-.42 1.38-2.35 1.47-2.91.14l-2.48-5.92-6.55-1.93c-1.64-.48-1.7-2.76-.09-3.34L20.55 2.85z"
        fill="currentColor"
      />
    </svg>
  );
}

function getNextOpenWord(words, currentOrderIndex) {
  const open = words.filter((w) => w.status === 'not_started' || w.status === 'in_progress');
  if (open.length === 0) return null;
  const after = open
    .filter((w) => w.order_index > currentOrderIndex)
    .sort((a, b) => a.order_index - b.order_index)[0];
  if (after) return after.order_index;
  return open.sort((a, b) => a.order_index - b.order_index)[0].order_index;
}

function getBerlinDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}



function getProgressCacheKey(login, dateKey = getBerlinDateKey()) {
  return `${PROGRESS_CACHE_PREFIX}-${login}-${dateKey}`;
}

function readCachedProgress(login, dateKey = getBerlinDateKey()) {
  if (typeof window === 'undefined') return null;

  try {
    const cached = window.localStorage.getItem(getProgressCacheKey(login, dateKey));
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedProgress(login, words, dateKey = getBerlinDateKey()) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getProgressCacheKey(login, dateKey), JSON.stringify(words));
  } catch {
    // Ignore storage quota and privacy-mode failures.
  }
}

function buildShareText(shareWords, dateKey) {
  const solved = shareWords.filter((w) => w.status === 'solved').length;
  const totalTime = shareWords.reduce((sum, w) => sum + (w.time_seconds || 0), 0);
  const dateLabel = new Date(`${dateKey}T00:00:00`)
    .toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
    .replace(/\//g, '.');

  const dotWidth = Math.max(...shareWords.map((w) => w.guesses.length), 1);

  const wordLines = shareWords.map((w, i) => {
    const dots =
      w.status === 'solved'
        ? '●'.repeat(w.guesses.length).padEnd(dotWidth)
        : `(-_-'`.padEnd(dotWidth);

    return `#${i + 1}  ${dots}  ${formatTimeShort(w.time_seconds)}`;
  });

  return [
    `WORDEL // ${dateLabel}`,
    `${solved} / ${shareWords.length} solved · ${formatTimeShort(totalTime)} total`,
    '',
    ...wordLines,
    '',
    'https://wd42.xyz',
  ].join('\n');
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [view, setView] = useState('play'); // 'play' | 'leaderboard' | 'stats'
  const [words, setWords] = useState([]);
  const [showCompletionToast, setShowCompletionToast] = useState(false);
  // Set when a word finished in this session, cleared once the completion
  // check has run. Keeps the leaderboard switch from firing before the toast.
  const [completionPending, setCompletionPending] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(null);
  const [infoPage, setInfoPage] = useState(null);
  const [rules, setRules] = useState(null); // leaderboard thresholds, loaded when About opens
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const shareCopiedTimeoutRef = useRef(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem('wordel-theme') || 'dark';
  });

  const refreshProgress = useCallback((opts = {}) => {
    const { checkCompletion = false } = opts;
    api
      .progress()
      .then((data) => {
        setWords(data);
        setSelectedOrderIndex((prev) => {
          if (prev) return prev;
          const firstOpen = data.find((w) => w.status === 'not_started' || w.status === 'in_progress');
          return (firstOpen ?? data[0])?.order_index ?? null;
        });
        if (checkCompletion) {
          const allDone = data.every((w) => w.status === 'solved' || w.status === 'failed');
          if (allDone) setShowCompletionToast(true);
          setCompletionPending(false);
        }
      })
      .catch(() => {
        if (checkCompletion) setCompletionPending(false);
      });
  }, []);

  // Applies one word's server-confirmed result to the tab strip immediately,
  // from the same guess response the grid uses. No extra request.
  const applyWordUpdate = useCallback((orderIndex, patch) => {
    if (patch.status === 'solved' || patch.status === 'failed') {
      setCompletionPending(true);
    }
    setWords((prev) =>
      prev.map((w) => (w.order_index === orderIndex ? { ...w, ...patch } : w))
    );
  }, []);

  // Keep the localStorage snapshot in step with whatever the tabs show.
  useEffect(() => {
    if (user?.login && words.length > 0) {
      writeCachedProgress(user.login, words);
    }
  }, [user, words]);

  useEffect(() => {
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!user?.login) return;

    const cachedProgress = readCachedProgress(user.login);
    if (cachedProgress) {
      setWords(cachedProgress);
      setSelectedOrderIndex((prev) => {
        if (prev) return prev;
        const firstOpen = cachedProgress.find((w) => w.status === 'not_started' || w.status === 'in_progress');
        return (firstOpen ?? cachedProgress[0])?.order_index ?? null;
      });
    }

    refreshProgress();
  }, [user, refreshProgress]);


  useEffect(() => {
    if (
      !completionPending &&
      !showCompletionToast &&
      words.length > 0 &&
      words.every((word) => word.status === 'solved' || word.status === 'failed')
    ) {
      setView(user?.is_guest ? 'stats' : 'leaderboard');
    }
  }, [words, showCompletionToast, completionPending, user]);


  useEffect(() => {
    window.localStorage.setItem('wordel-theme', theme);
  }, [theme]);

  useEffect(() => () => {
    if (shareCopiedTimeoutRef.current) {
      window.clearTimeout(shareCopiedTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!infoPage) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setInfoPage(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [infoPage]);

  useEffect(() => {
    document.body.classList.remove('theme-dark', 'theme-light');
    if (user) {
      document.body.classList.add(`theme-${theme}`);
    }

    return () => {
      document.body.classList.remove('theme-dark', 'theme-light');
    };
  }, [user, theme]);

  useEffect(() => {
    if (infoPage !== 'about' || rules) return undefined;
    let cancelled = false;
    api
      .leaderboardMeta()
      .then((meta) => {
        if (!cancelled) setRules(meta.thresholds ?? null);
      })
      .catch(() => {}); // About still renders, without the numbers
    return () => {
      cancelled = true;
    };
  }, [infoPage, rules]);

  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback />;
  }

  const handleLogout = async () => {
    await api.logout().catch(() => { });
    setUser(null);
    setWords([]);
    setSelectedOrderIndex(null);
  };

  const handleTogglePrivacy = async () => {
    const next = !user.privacy_enabled;
    setUser((u) => ({ ...u, privacy_enabled: next })); // optimistic
    try {
      await api.updatePrivacy(next);
      window.dispatchEvent(new CustomEvent('privacy-changed', { detail: { privacy_enabled: next } }));
    } catch (err) {
      console.error('privacy update failed:', err);
      setUser((u) => ({ ...u, privacy_enabled: !next })); // revert on failure
    }
  };

  // Art. 15 GDPR: hand the user their own data as one JSON file.
  const handleDownloadData = async () => {
    setAccountBusy(true);
    setAccountError('');
    try {
      const blob = await api.exportData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wordel-data-${getBerlinDateKey()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('export failed:', err);
      setAccountError('Der Export ist fehlgeschlagen. Versuche es später erneut.');
    } finally {
      setAccountBusy(false);
    }
  };

  // Art. 17 GDPR: irreversible. The token is useless once the row is gone, but
  // it is cleared anyway so a stale tab cannot keep retrying.
  const handleDeleteAccount = async () => {
    setAccountBusy(true);
    setAccountError('');
    try {
      await api.deleteAccount();
      localStorage.removeItem(TOKEN_KEY);
      window.location.replace('/');
    } catch (err) {
      console.error('account delete failed:', err);
      setAccountError('Das Konto konnte nicht gelöscht werden. Versuche es später erneut.');
      setAccountBusy(false);
      setConfirmDelete(false);
    }
  };

  const isDayComplete = words.length > 0 && words.every((word) => word.status === 'solved' || word.status === 'failed');
  const handleShare = async () => {
    try {
      const data = await api.shareData();
      const text = buildShareText(data.words, data.date);

      if (navigator.share && (!navigator.canShare || navigator.canShare({ text }))) {
        await navigator.share({ text });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareCopied(true);
        if (shareCopiedTimeoutRef.current) window.clearTimeout(shareCopiedTimeoutRef.current);
        shareCopiedTimeoutRef.current = window.setTimeout(() => setShareCopied(false), 1500);
        return;
      }

      // Very old/unsupported browsers: last-resort clipboard attempt via a temporary textarea
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setShareCopied(true);
      if (shareCopiedTimeoutRef.current) window.clearTimeout(shareCopiedTimeoutRef.current);
      shareCopiedTimeoutRef.current = window.setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      console.error('share failed:', err); // temporary — remove once confirmed working
    }
  };

  if (!authChecked) {
    return (
      <div className="app-shell loading-shell">
        <div className="loader" aria-label="Loading" role="status" />
        <LegalFooter onOpen={setInfoPage} />
        <InfoModal page={infoPage} rules={rules} onClose={() => setInfoPage(null)} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell login-shell">
        <Login onOpenLegal={setInfoPage} />

        <LegalFooter onOpen={setInfoPage} />

        <InfoModal page={infoPage} rules={rules} onClose={() => setInfoPage(null)} />
      </div>
    );
  }


  const solvedCount = words.filter((w) => w.status === 'solved').length;
  const totalWords = words.length;

  return (
    <div className="app-shell">
      <header className="masthead">
        <div className="masthead-title-row">
          <h1 className="masthead-title">
            <button type="button" onClick={() => setView('play')} aria-label="Play">
              wordel <span>{'// 42 CUP'}</span>
            </button>
          </h1>

          {isDayComplete && (
            <button
              type="button"
              className="icon-btn share-header-btn"
              onClick={handleShare}
              aria-label={shareCopied ? 'Copied' : 'Share results'}
              title={shareCopied ? 'Copied' : 'Share results'}
            >
              <span className="share-content">
                {shareCopied ? 'COPIED' : <ShareIcon />}
              </span>
            </button>
          )}
        </div>

        <div className="masthead-controls">
          <nav className="masthead-nav">
            <button
              className={`nav-btn ${view === 'play' ? 'active' : ''}`}
              onClick={() => setView('play')}
            >
              Play
            </button>

            <button
              className={`nav-btn ${view === 'stats' ? 'active' : ''}`}
              onClick={() => setView('stats')}
            >
              Stats
            </button>

            <button
              className={`nav-btn ${view === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setView('leaderboard')}
            >
              Ledger
            </button>
          </nav>

          <div className="masthead-icons">
            <button
              className="icon-btn theme-toggle"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>

            {!user.is_guest && (
              <button
                className="icon-btn theme-toggle"
                onClick={handleTogglePrivacy}
                aria-label={user.privacy_enabled ? 'Make profile private' : 'Make profile public'}
                title={user.privacy_enabled ? 'Public' : 'Private'}
              >
                {user.privacy_enabled ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            )}

            <button
              className="icon-btn theme-toggle"
              onClick={user.is_guest ? () => window.location.assign(api.loginUrl()) : handleLogout}
              aria-label={user.is_guest ? 'Sign in with 42' : 'Log out'}
              title={user.is_guest ? 'Sign in with 42 (guest stats do not carry over)' : 'Log out'}
            >
              <LogoutIcon />
            </button>

          </div>
        </div>
      </header>

      <main className="app-content">
        {view === 'play' ? (
          <>
            {words.length > 0 && (
              <WordTabs
                words={words}
                selectedOrderIndex={selectedOrderIndex}
                onSelect={setSelectedOrderIndex}
              />
            )}

            {selectedOrderIndex && (
              <Game
                userLogin={user.login}
                orderIndex={selectedOrderIndex}
                onWordUpdate={applyWordUpdate}
                onProgressChanged={refreshProgress}
                nextOrderIndex={getNextOpenWord(words, selectedOrderIndex)}
                onNext={() => setSelectedOrderIndex(getNextOpenWord(words, selectedOrderIndex))}
              />
            )}
          </>
              ) : view === 'leaderboard' ? (
      user.is_guest ? (
        <LoginRequired />
      ) : (
        <Leaderboard
          totalWords={words.length}
          viewerIsPrivate={!!user.privacy_enabled}
          viewerId={user.id}
        />
      )
    ) : (
      <Stats isGuest={!!user.is_guest} />
    )}
      </main>




      <LegalFooter onOpen={setInfoPage} />
      <AlertModal
        title="Finished!"
        message={
          showCompletionToast
            ? `You solved ${solvedCount}/${totalWords} words.`
            : ''
        }
        duration={2200}
        onClose={() => {
          setShowCompletionToast(false);
          setView(user.is_guest ? 'stats' : 'leaderboard');
        }}
      />
      <InfoModal
        page={infoPage}
        rules={rules}
        onClose={() => {
          setInfoPage(null);
          setConfirmDelete(false);
          setAccountError('');
        }}
        showAccountActions={infoPage === 'privacy'}
        accountBusy={accountBusy}
        accountError={accountError}
        accountConfirming={confirmDelete}
        onDownloadData={handleDownloadData}
        onRequestDelete={() => setConfirmDelete(true)}
        onConfirmDelete={handleDeleteAccount}
        onCancelDelete={() => setConfirmDelete(false)}
      />
    </div >
  );
}
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import WordTabs from './components/WordTabs.jsx';
import Game from './components/Game.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import AuthCallback from './components/AuthCallback.jsx';
import AlertModal from './components/AlertModal.jsx';
import Stats from './components/Stats.jsx';

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
  privacy: {
    title: 'Privacy',
    eyebrow: 'Data and access',
    body: [
      'You enter through 42 OAuth, and we keep only what is needed to recognise you: your intra ID, login, display name and avatar.',
      'A signed token stays in your browser so you are not asked twice. It serves no other purpose than to vouch for your requests.',
      'Your guesses, your progress and your results are kept in Supabase, so the ledger can remember across players and days. Should a result be flagged as suspicious, that mark is kept as well. Nothing is sold, and no third-party trackers watch you play.',
      'If you wish your data to be removed, write to htharrau.'
    ],
  },
  about: {
    title: 'About',
    eyebrow: 'The 42 Cup',
    body: [
      'wordel // 42 Cup is a small thing made by Helene Tharrault (htharrau).',
      'Each day at midnight (Paris time), a new set of words is drawn at random from the ~2,300 past NYT Wordle answers. A word, once drawn, rests for 60 days before it may return.',
      'Every word has its own clock. It starts at your first guess and stops when you solve the word or spend your sixth attempt. The times are added together, so quickness weighs as much as accuracy.',
      SCORING_PLACEHOLDER,
      'On certain special days (May 1st, Diwali, and a few others) the pool itself changes to themed words, chosen to match the occasion.',
      'The game is meant to be played honestly: suspicious answers are kept off the leaderboard, and the player is contacted for clarification.',
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


function InfoModal({ page, rules, onClose }) {
  const content = INFO_PAGES[page];

  if (!content) return null;

  const body = content.body.flatMap((paragraph) =>
    paragraph === SCORING_PLACEHOLDER ? scoringParagraphs(rules) : [paragraph]
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
          {body.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
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
  const [shareCopied, setShareCopied] = useState(false);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(null);
  const [infoPage, setInfoPage] = useState(null);
  const [rules, setRules] = useState(null); // leaderboard thresholds, loaded when About opens
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
        if (user?.login) {
          writeCachedProgress(user.login, data);
        }
        setSelectedOrderIndex((prev) => {
          if (prev) return prev;
          const firstOpen = data.find((w) => w.status === 'not_started' || w.status === 'in_progress');
          return (firstOpen ?? data[0])?.order_index ?? null;
        });
        if (checkCompletion) {
          const allDone = data.every((w) => w.status === 'solved' || w.status === 'failed');
          if (allDone) setShowCompletionToast(true);
        }
      })
      .catch(() => { });
  }, [user]);

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
      !showCompletionToast &&
      words.length > 0 &&
      words.every((word) => word.status === 'solved' || word.status === 'failed')

    ) {
      setView('leaderboard');
    }
  }, [words, showCompletionToast]);

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
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-shell login-shell">
        <Login />
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
            wordel <span>{'// 42 CUP'}</span>
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

            <button
              className="icon-btn theme-toggle"
              onClick={handleTogglePrivacy}
              aria-label={user.privacy_enabled ? 'Make profile private' : 'Make profile public'}
              title={user.privacy_enabled ? 'Public' : 'Private'}
            >
              {user.privacy_enabled ? <EyeOffIcon /> : <EyeIcon />}
            </button>

            <button
              className="icon-btn theme-toggle"
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
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
                onWordFinished={() => refreshProgress({ checkCompletion: true })}
                onWordStarted={() => refreshProgress()}
                nextOrderIndex={getNextOpenWord(words, selectedOrderIndex)}
                onNext={() => setSelectedOrderIndex(getNextOpenWord(words, selectedOrderIndex))}
              />
            )}
          </>
        ) : view === 'leaderboard' ? (
          <Leaderboard
            totalWords={words.length}
            viewerIsPrivate={!!user.privacy_enabled}
            viewerId={user.id}
          />
        ) : (
          <Stats />
        )}
      </main>

      <footer className="app-footer">
        <button type="button" onClick={() => setInfoPage('privacy')}>Privacy</button>

        <button type="button" onClick={() => setInfoPage('about')}>About</button>

        <a
          href="https://github.com/aphonogelia/42-cup"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
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
          setView('leaderboard');
        }}
      />
      <InfoModal page={infoPage} rules={rules} onClose={() => setInfoPage(null)} />
    </div >
  );
}
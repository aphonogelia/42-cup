import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import WordTabs from './components/WordTabs.jsx';
import Game from './components/Game.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import AuthCallback from './components/AuthCallback.jsx';
import AlertModal from './components/AlertModal.jsx';

const PROGRESS_CACHE_PREFIX = 'wordel-progress';
const BERLIN_TIME_ZONE = 'Europe/Berlin';

const RESULT_COLORS = {
  correct: "#c09bce",
  present: "#fa0643",
  absent: "#b8b8b8",
};

const INFO_PAGES = {
  privacy: {
    title: 'Privacy',
    eyebrow: 'Data and access',
    body: [
      'Sign-in is handled through 42 OAuth. We only receive what\'s needed to identify your account: your intra ID, login, display name, and avatar if you have one.',
      'A signed token is stored in your browser to keep you signed in. It\'s used solely to authenticate your requests to this app.',
      'Your guesses, progress, and leaderboard results are stored in Supabase so the competition can track scores across players and days. We don\'t sell data or use third-party trackers.',
      'Want your data removed? Contact htharrau.'
    ],
  },
  about: {
    title: 'About',
    eyebrow: 'The 42 Cup',
    body: [
      <>
        wordel // 42 Cup was built by Helene Tharrault (htharrau) for the Wordle Club of 42 Berlin, as a way for students to get a taste of the game and maybe join the{' '}
        <a href="https://42born2code.slack.com/archives/C057BMKPG9J" target="_blank" rel="noreferrer">
          Slack channel
        </a>.
      </>,
      'Each day brings a fresh set of words, randomly drawn from the ~2,300 past Wordle answers. Everything resets at midnight.',
      'For each word, the clock starts with your first guess and stops when you solve it or make your sixth wrong guess. Your times are then added together across all words — so speed matters as much as accuracy.',
      'Sign in with your 42 account, work through the words, and check the ledger to see how you stack up.'
    ],
  },
};

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function InfoModal({ page, onClose }) {
  const content = INFO_PAGES[page];

  if (!content) return null;

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
          {content.body.map((paragraph, index) => (
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

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 17l5-5-5-5M15 12H3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

async function generateShareImage(shareWords) {
  const cell = 9, gap = 2, colGap = 14, padding = 18;
  const headerH = 30, barH = 12, barGap = 14, footerH = 20;

  const maxRows = Math.max(1, ...shareWords.map((w) => w.guesses.length || 1));
  const colWidths = shareWords.map((w) => {
    const letters = w.guesses[0]?.length || 5;
    return letters * cell + (letters - 1) * gap;
  });
  const gridW = colWidths.reduce((a, b) => a + b, 0) + colGap * (shareWords.length - 1);
  const gridH = maxRows * cell + (maxRows - 1) * gap;

  const width = gridW + padding * 2;
  const height = headerH + gridH + barGap + barH + footerH + padding * 2;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#121213';
  ctx.fillRect(0, 0, width, height);

  const solved = shareWords.filter((w) => w.status === 'solved').length;
  const totalTime = shareWords.reduce((sum, w) => sum + (w.time_seconds || 0), 0);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px -apple-system, Helvetica, Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`42 Cup — ${solved}/${shareWords.length} in ${formatTime(totalTime)}`, padding, padding);

  let x = padding;
  const gridY = padding + headerH;
  shareWords.forEach((word, wi) => {
    word.guesses.forEach((rowFeedback, ri) => {
      rowFeedback.forEach((cellResult, ci) => {
        ctx.fillStyle = RESULT_COLORS[cellResult] || '#3a3a3c';
        ctx.fillRect(x + ci * (cell + gap), gridY + ri * (cell + gap), cell, cell);
      });
    });
    x += colWidths[wi] + colGap;
  });

  const barY = gridY + gridH + barGap;
  let bx = padding;
  shareWords.forEach((word) => {
    const frac = totalTime > 0 ? (word.time_seconds || 0) / totalTime : 1 / shareWords.length;
    const segW = frac * gridW;
    ctx.fillStyle = '#5a5a5c';
    ctx.fillRect(bx, barY, Math.max(segW - 2, 1), barH);
    bx += segW;
  });

  ctx.fillStyle = '#8a8a8d';
  ctx.font = '10px -apple-system, Helvetica, Arial, sans-serif';
  ctx.fillText('42 Cup · wordel-sepia-nu.vercel.app', padding, barY + barH + 8);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}


export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [view, setView] = useState('play'); // 'play' | 'leaderboard'
  const [words, setWords] = useState([]);
  const [showCompletionToast, setShowCompletionToast] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(null);
  const [infoPage, setInfoPage] = useState(null);
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
  }, [user?.login]);
  // Handle the OAuth callback first, before anything else runs
  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback />;
  }

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

  const handleLogout = async () => {
    await api.logout().catch(() => { });
    setUser(null);
    setWords([]);
    setSelectedOrderIndex(null);
  };

  const isDayComplete = words.length > 0 && words.every((word) => word.status === 'solved' || word.status === 'failed');


  const handleShare = async () => {
    try {
      const data = await api.shareData();
      const blob = await generateShareImage(data.words);
      const file = new File([blob], `42cup-${data.date}.png`, { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }

      if (navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setShareCopied(true);
        if (shareCopiedTimeoutRef.current) window.clearTimeout(shareCopiedTimeoutRef.current);
        shareCopiedTimeoutRef.current = window.setTimeout(() => setShareCopied(false), 1500);
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // cancelled share sheet or clipboard denied
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
        <h1 className="masthead-title">
          wordel <span>// 42 CUP</span>
        </h1>
        <div className="masthead-controls">
          <nav className="masthead-nav">
            <button
              className={`nav-btn ${view === 'play' ? 'active' : ''}`}
              onClick={() => setView('play')}
            >
              Play
            </button>
            <button
              className={`nav-btn ${view === 'leaderboard' ? 'active' : ''}`}
              onClick={() => setView('leaderboard')}
            >
              Ledger
            </button>
          </nav>

          {isDayComplete && (
            <button type="button" className="share-header-btn" onClick={handleShare}>
              {shareCopied ? 'Copied' : 'Share results'}
            </button>
          )}

          <button
            className="icon-btn theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <div className="user-chip">
            <span>{user.login}</span>
            <button className="icon-btn logout-link" onClick={handleLogout} aria-label="Log out" title="Log out">
              <LogoutIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="app-content">
        {view === "play" ? (
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
                nextOrderIndex={getNextOpenWord(words, selectedOrderIndex)}
                onNext={() => setSelectedOrderIndex(getNextOpenWord(words, selectedOrderIndex))}
              />
            )}
          </>
        ) : (
          <Leaderboard totalWords={words.length} />
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
      <InfoModal page={infoPage} onClose={() => setInfoPage(null)} />
    </div>
  );
}

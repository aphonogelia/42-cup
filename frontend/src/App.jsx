import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import WordTabs from './components/WordTabs.jsx';
import Game from './components/Game.jsx';
import Leaderboard from './components/Leaderboard.jsx';

const INFO_PAGES = {
  privacy: {
    title: 'Privacy',
    eyebrow: 'Data and access',
    body: [
      'This app uses 42 OAuth for sign-in. We only receive the profile details needed to identify your account in the game: your intra ID, login, display name, and avatar URL if available.',
      'A session cookie is stored in your browser so you can stay signed in while you play. The cookie is httpOnly and is used only to authenticate requests to this app.',
      'Game progress, guesses, and leaderboard data are stored in Supabase so the competition can track results across users and days. We do not sell your data or use third-party advertising trackers.',
      'If you want your profile or game data removed, contact the organizer of the event or the maintainer of the deployment.'
    ],
  },
  about: {
    title: 'About',
    eyebrow: 'The 42 Cup',
    body: [
      'Wordle // 42 Cup is a small daily word game built for the 42 community. Each round is tracked, scored, and recorded so players can compare results on the ledger.',
      'The design leans into a paper-ticket style to make the game feel like a competition sheet rather than a generic clone. The goal is quick, competitive play with a little ceremony around each guess.',
      'Sign in with your 42 account, pick up the next word, and try to keep your streak alive. The leaderboard shows how the day is unfolding across players.'
    ],
  },
};

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
          {content.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
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

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [view, setView] = useState('play'); // 'play' | 'leaderboard'
  const [words, setWords] = useState([]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(null);
  const [infoPage, setInfoPage] = useState(null);
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem('wordle-theme') || 'dark';
  });

  const refreshProgress = useCallback(() => {
    api
      .progress()
      .then((data) => {
        setWords(data);
        setSelectedOrderIndex((prev) => {
          if (prev) return prev;
          const firstOpen = data.find((w) => w.status === 'not_started' || w.status === 'in_progress');
          return (firstOpen ?? data[0])?.order_index ?? null;
        });
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (user) refreshProgress();
  }, [user, refreshProgress]);

  useEffect(() => {
    window.localStorage.setItem('wordle-theme', theme);
  }, [theme]);

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

  if (!authChecked) {
    return <div className="app-shell status-line">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="app-shell">
        <Login />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="masthead">
        <h1 className="masthead-title">
          WORDLE <span>// 42 CUP</span>
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
                orderIndex={selectedOrderIndex}
                onWordFinished={refreshProgress}
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
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>

      <InfoModal page={infoPage} onClose={() => setInfoPage(null)} />
    </div>
  );
}

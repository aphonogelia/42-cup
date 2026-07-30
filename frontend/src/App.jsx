import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import WordTabs from './components/WordTabs.jsx';
import Game from './components/Game.jsx';
import Leaderboard from './components/Leaderboard.jsx';

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
        <a href="#">Privacy</a>

        <a href="#">About</a>

        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}

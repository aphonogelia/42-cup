import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Login from './components/Login.jsx';
import WordTabs from './components/WordTabs.jsx';
import Game from './components/Game.jsx';
import Leaderboard from './components/Leaderboard.jsx';

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [view, setView] = useState('play'); // 'play' | 'leaderboard'
  const [words, setWords] = useState([]);
  const [selectedOrderIndex, setSelectedOrderIndex] = useState(null);

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
      .catch(() => {});
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

  const handleLogout = async () => {
    await api.logout().catch(() => {});
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
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
          <div className="user-chip">
            {user.avatar_url && <img src={user.avatar_url} alt="" />}
            {user.login}
            <button className="logout-link" onClick={handleLogout}>
              log out
            </button>
          </div>
        </div>
      </header>

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
            <Game orderIndex={selectedOrderIndex} onWordFinished={refreshProgress} />
          )}
        </>
      ) : (
        <Leaderboard totalWords={words.length} />
      )}
    </div>
  );
}

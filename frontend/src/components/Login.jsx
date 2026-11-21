import { useState } from 'react';
import { api, TOKEN_KEY } from '../api.js';

export default function Login() {
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestError, setGuestError] = useState('');

  const handleGuest = async () => {
    setGuestLoading(true);
    setGuestError('');
    try {
      const { token } = await api.guest();
      localStorage.setItem(TOKEN_KEY, token);
      window.location.replace('/');
    } catch (err) {
      setGuestError(
        err.status === 429
          ? 'Too many guest profiles from this network. Try again later.'
          : 'Could not start a guest session. Try again.'
      );
      setGuestLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-title-wrap">
        <span className="login-title-blob" aria-hidden="true" />
        <h1>
          wordel <span style={{ color: 'var(--amber)' }}>{'// 42 CUP'}</span>
        </h1>
      </div>
      <div className="login-cta-wrap">
        <p>
          Five words. Every guess, every second, on the record. Sign in with your intra
          account to enter the ledger.
        </p>
        <a className="login-btn" href={api.loginUrl()}>
          Sign in with 42
        </a>
        <p className="login-guest-prompt">
          No 42 account?{' '}
          <button
            type="button"
            className="login-guest-btn"
            onClick={handleGuest}
            disabled={guestLoading}
          >
            {guestLoading ? 'starting…' : 'Play as a guest'}
          </button>
        </p>
        {guestError && <p className="login-guest-error" role="alert">{guestError}</p>}
      </div>
    </div>
  );
}
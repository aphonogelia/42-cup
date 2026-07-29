import { api } from '../api.js';

export default function Login() {
  return (
    <div className="login-screen">
      <h1>
        WORDLE <span style={{ color: 'var(--amber)' }}>// 42 CUP</span>
      </h1>
      <p>
        Seven words. Every guess, every second, on the record. Sign in with your intra
        account to enter the ledger.
      </p>
      <a className="login-btn" href={api.loginUrl()}>
        Sign in with 42
      </a>
    </div>
  );
}

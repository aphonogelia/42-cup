import { api } from '../api.js';

// Shown in place of the ledger for guests. The server also refuses them (403
// login_required), so this is only the friendly face of that.
export default function LoginRequired() {
  return (
    <div className="login-required">
      <p>You have to log in to see the ledger.</p>
      <a className="login-btn" href={api.loginUrl()}>
        Sign in with 42
      </a>
    </div>
  );
}
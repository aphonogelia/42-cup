const API_URL = import.meta.env.VITE_API_URL;

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

const TOKEN_KEY = 'auth_token';

async function request(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    const message = (body && body.error) || res.statusText || 'Request failed';
    throw new ApiError(message, res.status, body);
  }
  return body;
}

export const api = {
  me: () => request('/api/auth/me'),
  guest: () => request('/api/auth/guest', { method: 'POST', body: '{}' }),
  logout: () => {
  localStorage.removeItem(TOKEN_KEY);
  return request('/api/auth/logout', { method: 'POST', body: '{}' });
},
  updatePrivacy: (privacy_enabled) =>
    request('/api/auth/privacy', { method: 'PATCH', body: JSON.stringify({ privacy_enabled }) }),
  progress: () => request('/api/game/progress'),
  start: (order_index) =>
    request('/api/game/start', { method: 'POST', body: JSON.stringify({ order_index }) }),
  guess: (word_id, guess, submission_id) =>
    request('/api/game/guess', {
      method: 'POST',
      body: JSON.stringify({ word_id, guess, submission_id }),
    }),

  shareData: () => request('/api/game/share'),
  // GDPR Art. 15: one JSON file with everything we hold about the account.
  exportData: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_URL}/api/auth/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new ApiError('Export failed', res.status, null);
    }
    return res.blob();
  },
  // GDPR Art. 17: irreversible, removes the account and all its game data.
  // Fastify rejects an empty body with a JSON content type, hence '{}'.
  deleteAccount: () => request('/api/auth/me', { method: 'DELETE', body: '{}' }),
  leaderboard: (date, scope = '42') => {
    const params = new URLSearchParams({ scope });
    if (date) params.set('date', date);
    return request(`/api/leaderboard?${params}`);
  },
  leaderboardDates: () => request('/api/leaderboard/dates'),
  // { months: ['2026-10', ...], thresholds: { monthly, global } }
  leaderboardMeta: () => request('/api/leaderboard/meta'),
  leaderboardMonthly: (month, scope = '42') => {
    const params = new URLSearchParams({ scope });
    if (month) params.set('month', month);
    return request(`/api/leaderboard/monthly?${params}`);
  },
  leaderboardGlobal: (scope = '42') =>
    request(`/api/leaderboard/global?scope=${encodeURIComponent(scope)}`),
  wordTimes: ({ scope = '42', userId, handle, date }) => {
    const params = new URLSearchParams({ scope });
    if (date) params.set('date', date);
    if (handle) params.set('handle', handle);
    if (userId) params.set('userId', userId);
    return request(`/api/leaderboard/word-times?${params}`);
  },
  handleAvailable: (h) => request(`/api/me/handle-available?h=${encodeURIComponent(h)}`),
  joinGlobal: (handle) =>
    request('/api/me/global', { method: 'PUT', body: JSON.stringify({ handle }) }),
  // Open guess history, addressed by handle + date + order_index: no id ever
  // comes back, so a handle cannot be matched to a login.
  wordGuesses: ({ handle, date, orderIndex }) => {
    const params = new URLSearchParams({ scope: 'open', handle, date, order: String(orderIndex) });
    return request(`/api/leaderboard/word-guesses?${params}`);
  },
  guesses: (wordResultId) => request(`/api/word-results/${wordResultId}/guesses`),
  loginUrl: () => `${API_URL}/api/auth/42`,
  stats: () => request('/api/stats/me'),
};

export { ApiError, API_URL, TOKEN_KEY };
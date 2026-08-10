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
  console.log('[api] raw response for', path, ':', text);
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
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    return request('/api/auth/logout', { method: 'POST' });
  },
  progress: () => request('/api/game/progress'),
  start: (order_index) =>
    request('/api/game/start', { method: 'POST', body: JSON.stringify({ order_index }) }),
  guess: (word_id, guess) =>
    request('/api/game/guess', { method: 'POST', body: JSON.stringify({ word_id, guess }) }),

  shareData: () => request('/api/game/share'),
  leaderboard: (date) => request(`/api/leaderboard${date ? `?date=${date}` : ''}`),
  leaderboardDates: () => request('/api/leaderboard/dates'),
  loginUrl: () => `${API_URL}/api/auth/42`,
};

export { ApiError, API_URL, TOKEN_KEY };
const API_URL = import.meta.env.VITE_API_URL;
console.log("API_URL =", API_URL);
console.log(`${API_URL}/api/game/progress`);

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include', // sends/receives the session cookie
    headers: {
      'Content-Type': 'application/json',
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
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  progress: () => request('/api/game/progress'),
  start: (order_index) =>
    request('/api/game/start', { method: 'POST', body: JSON.stringify({ order_index }) }),
  guess: (word_id, guess) =>
    request('/api/game/guess', { method: 'POST', body: JSON.stringify({ word_id, guess }) }),
  leaderboard: () => request('/api/leaderboard'),
  loginUrl: () => `${API_URL}/api/auth/42`,
};

export { ApiError, API_URL };

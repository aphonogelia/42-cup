// config.js requires these at import time. Tests only import pure helpers, but
// dailyDraw.js also loads the Supabase client at module scope.
export function setTestEnv() {
  process.env.JWT_SECRET ??= 'test-jwt-secret';
  process.env.FORTYTWO_CLIENT_ID ??= 'test-client-id';
  process.env.FORTYTWO_CLIENT_SECRET ??= 'test-client-secret';
  process.env.FORTYTWO_CALLBACK_URL ??= 'http://localhost:3000/api/auth/42/callback';
  process.env.SUPABASE_URL ??= 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
}

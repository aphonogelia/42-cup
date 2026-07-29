import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    // Fail fast and loud at boot rather than mysteriously later.
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {

  port: Number(process.env.PORT || 3001),
  isProd: process.env.NODE_ENV === 'production',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  cookieSecret: required('COOKIE_SECRET'),
  jwtSecret: required('JWT_SECRET'),
  fortyTwo: {
    clientId: required('FORTYTWO_CLIENT_ID'),
    clientSecret: required('FORTYTWO_CLIENT_SECRET'),
    callbackUrl: required('FORTYTWO_CALLBACK_URL'),
  },
  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },
  game: {
    maxTries: 6,
    name: "42 Cup 2026",
    hardMode: true,
    minMsBetweenGuesses: 800, // basic anti-bruteforce throttle
  },
};

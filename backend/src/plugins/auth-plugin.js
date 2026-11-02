import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config.js';

export default fp(async function authPlugin(fastify) {
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    // no `cookie` option anymore — fastify-jwt reads the Authorization header by default
  });

  // Issues a token for a user after successful 42 login.
  // No longer touches `reply` / cookies — just returns the signed token.
  fastify.decorate('issueSession', function (user) {
    return fastify.jwt.sign(
      { sub: user.id, login: user.login },
      { expiresIn: '30d' }
    );
  });

  // Token for a guest. Long expiry on purpose: a guest has no way to get the
  // same account back, so an expired token would mean losing their history.
  // The row itself is removed by the purge_inactive_guests cron job.
  fastify.decorate('issueGuestSession', function (user) {
    return fastify.jwt.sign(
      { sub: user.id, login: user.login, guest: true },
      { expiresIn: '365d' }
    );
  });

  // Use as a route preHandler to require auth: { preHandler: [fastify.requireAuth] }
  fastify.decorate('requireAuth', async function (request, reply) {
    try {
      const payload = await request.jwtVerify(); // reads "Authorization: Bearer <token>" by default
      request.user = { id: payload.sub, login: payload.login, guest: payload.guest === true };
    } catch {
      reply.code(401).send({ error: 'Not authenticated' });
    }
  });

  // Add AFTER requireAuth on routes that are for real 42 players only
  // (ledger, word guesses of other players).
  fastify.decorate('requireRealUser', async function (request, reply) {
    if (request.user?.guest) {
      return reply.code(403).send({ error: 'login_required' });
    }
  });
});
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
      { expiresIn: '12h' }
    );
  });

  // Use as a route preHandler to require auth: { preHandler: [fastify.requireAuth] }
  fastify.decorate('requireAuth', async function (request, reply) {
    try {
      const payload = await request.jwtVerify(); // reads "Authorization: Bearer <token>" by default
      request.user = { id: payload.sub, login: payload.login };
    } catch {
      reply.code(401).send({ error: 'Not authenticated' });
    }
  });
});
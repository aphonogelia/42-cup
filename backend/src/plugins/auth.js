import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config.js';

const SESSION_COOKIE = 'session';

export default fp(async function authPlugin(fastify) {
  await fastify.register(fastifyCookie, { secret: config.cookieSecret });

  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    cookie: { cookieName: SESSION_COOKIE, signed: false },
  });

  // Issues the session cookie for a user after successful 42 login.
  fastify.decorate('issueSession', function (reply, user) {
    const token = fastify.jwt.sign(
      { sub: user.id, login: user.login },
      { expiresIn: '12h' }
    );
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      secure: config.isProd,
      sameSite: config.isProd ? 'none' : 'lax', // 'none' needed cross-site (Vercel <-> Render) in prod
      maxAge: 60 * 60 * 12,
    });
  });

  fastify.decorate('clearSession', function (reply) {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  });

  // Use as a route preHandler to require auth: { preHandler: [fastify.requireAuth] }
  fastify.decorate('requireAuth', async function (request, reply) {
    try {
      const payload = await request.jwtVerify();
      request.user = { id: payload.sub, login: payload.login };
    } catch {
      reply.code(401).send({ error: 'Not authenticated' });
    }
  });
});

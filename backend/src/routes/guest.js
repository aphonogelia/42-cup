import { randomBytes } from 'node:crypto';
import { supabase } from '../supabase.js';

export default async function guestRoutes(fastify) {
  // The only unauthenticated write in the API, so it gets its own, tighter limit
  // (the global limiter is 100 requests/minute per IP).
  fastify.post(
    '/api/auth/guest',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      // Handle on the rare chance of a login collision by retrying with a new suffix.
      for (let attempt = 0; attempt < 3; attempt++) {
        const login = `guest_${randomBytes(4).toString('hex')}`;

        const { data: user, error } = await supabase
          .from('users')
          .insert({ login, display_name: 'Guest', is_guest: true })
          .select('id, login')
          .single();

        if (!error) {
          return { token: fastify.issueGuestSession(user) };
        }

        if (error.code !== '23505') {
          request.log.error(error, 'Failed to create guest');
          break;
        }
      }

      return reply.code(500).send({ error: 'Failed to create guest' });
    }
  );
}
import oauthPlugin from '@fastify/oauth2';
import { config } from '../config.js';
import { supabase } from '../supabase.js';

console.log('Callback URL:', config.fortyTwo.callbackUrl);

export default async function authRoutes(fastify) {
  await fastify.register(oauthPlugin, {
    name: 'fortyTwoOAuth2',
    scope: ['public'],
    credentials: {
      client: {
        id: config.fortyTwo.clientId,
        secret: config.fortyTwo.clientSecret,
      },
      auth: {
        authorizeHost: 'https://api.intra.42.fr',
        authorizePath: '/oauth/authorize',
        tokenHost: 'https://api.intra.42.fr',
        tokenPath: '/oauth/token',
      },
    },
    // GET /api/auth/42 kicks off the redirect to 42's login page
    startRedirectPath: '/api/auth/42',
    callbackUri: config.fortyTwo.callbackUrl,
  });

  // 42 redirects back here after login
  fastify.get('/api/auth/42/callback', async (request, reply) => {
    let tokenResponse;
    try {
      tokenResponse = await fastify.fortyTwoOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
    } catch (err) {
      request.log.error(err, '42 OAuth token exchange failed');
      return reply.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
    }

    const accessToken = tokenResponse.token.access_token;

    // Fetch the logged-in user's 42 profile
    const meRes = await fetch('https://api.intra.42.fr/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      request.log.error({ status: meRes.status }, 'Failed to fetch 42 profile');
      return reply.redirect(`${config.frontendUrl}/login?error=profile_fetch_failed`);
    }
    const profile = await meRes.json();

    // Upsert the user in Supabase, keyed on their stable 42 intra id
    const { data: user, error } = await supabase
      .from('users')
      .upsert(
        {
          intra_id: profile.id,
          login: profile.login,
          display_name: profile.displayname ?? profile.usual_full_name ?? profile.login,
          avatar_url: profile.image?.link ?? null,
        },
        { onConflict: 'intra_id' }
      )
      .select()
      .single();

    if (error) {
      request.log.error(error, 'Failed to upsert user');
      return reply.redirect(`${config.frontendUrl}/login?error=db_error`);
    }

    fastify.issueSession(reply, user);
    return reply.redirect(`${config.frontendUrl}/`);
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    fastify.clearSession(reply);
    return { ok: true };
  });

  fastify.get('/api/auth/me', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, login, display_name, avatar_url')
      .eq('id', request.user.id)
      .single();
    if (error) return reply.code(404).send({ error: 'User not found' });
    return user;
  });
}

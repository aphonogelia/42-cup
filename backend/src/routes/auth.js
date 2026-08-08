import oauthPlugin from '@fastify/oauth2';
import { config } from '../config.js';
import { supabase } from '../supabase.js';

export default async function authRoutes(fastify) {
  console.log('OAuth callback:', config.fortyTwo.callbackUrl);
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
    startRedirectPath: '/api/auth/42',
    callbackUri: config.fortyTwo.callbackUrl,
    // no `cookie` option needed anymore — that was only for the oauth2 state cookie
    // during the flow itself; @fastify/oauth2 can keep using its default (short-lived,
    // same-site-safe) state handling without you touching it
  });

  fastify.get('/api/auth/42/callback', async (request, reply) => {
    let tokenResponse;
    try {
      tokenResponse = await fastify.fortyTwoOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
    } catch (err) {
      request.log.error(err, '42 OAuth token exchange failed');
      return reply.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
    }

    const accessToken = tokenResponse.token.access_token;

    const meRes = await fetch('https://api.intra.42.fr/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      request.log.error({ status: meRes.status }, 'Failed to fetch 42 profile');
      return reply.redirect(`${config.frontendUrl}/login?error=profile_fetch_failed`);
    }
    const profile = await meRes.json();

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

    const token = fastify.issueSession(user);
    // fragment, not query param — never hits server logs
    return reply.redirect(`${config.frontendUrl}/auth/callback#token=${token}`);
  });

  // Now a no-op — logout happens client-side by clearing localStorage.
  // Keep it if you want a hook for future server-side token revocation/audit logging.
  fastify.post('/api/auth/logout', async () => {
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
import oauthPlugin from '@fastify/oauth2';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { invalidateAllLeaderboards } from '../lib/leaderboardCache.js';
import { mirrorAvatar } from '../lib/avatarStore.js';

function getAvatarUrl(profile) {
  const candidates = [
    profile.image?.versions?.medium,
    profile.image?.versions?.small,
    profile.image?.link,
    profile.image_url,
    profile.image?.url,
    typeof profile.image === 'string' ? profile.image : null,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim()) ?? null;
}

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
    cookie: {
      sameSite: 'none',
      secure: true,
      path: '/',
    },
    startRedirectPath: '/api/auth/42',
    callbackUri: config.fortyTwo.callbackUrl,
  });

  fastify.get('/api/auth/42/callback', async (request, reply) => {
    let tokenResponse;
    try {
      tokenResponse = await fastify.fortyTwoOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
    } catch (err) {
      request.log.error(err, '42 OAuth token exchange failed');
      return reply.redirect(`${config.frontendUrl}/login?error=oauth_failed`);
    }

    const accessToken = tokenResponse?.token?.access_token;

    if (!accessToken) {
      console.error('NO ACCESS TOKEN IN 42 RESPONSE');
      return reply.redirect(
        `${config.frontendUrl}/login?error=no_access_token`
      );
    }

    const meRes = await fetch('https://api.intra.42.fr/v2/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!meRes.ok) {
      request.log.error({ status: meRes.status }, 'Failed to fetch 42 profile');
      return reply.redirect(`${config.frontendUrl}/login?error=profile_fetch_failed`);
    }
    const profile = await meRes.json();
    const avatarUrl = getAvatarUrl(profile);

    const userProfile = {
      intra_id: profile.id,
      login: profile.login,
      display_name: profile.displayname ?? profile.usual_full_name ?? profile.login,
    };

    if (avatarUrl) {
      const stored = await mirrorAvatar(profile.id, avatarUrl, request.log);
      if (stored) userProfile.avatar_url = stored;
      request.log.info({ mirrored: Boolean(stored), final: userProfile.avatar_url ?? '(kept existing)' }, 'avatar: upsert value');
    } else {
      request.log.info('avatar: no avatar url in 42 profile');
    }

    const { data: user, error } = await supabase
      .from('users')
      .upsert(
        userProfile,
        { onConflict: 'intra_id' }
      )
      .select()
      .single();

    if (error) {
      request.log.error(error, 'Failed to upsert user');
      return reply.redirect(`${config.frontendUrl}/login?error=db_error`);
    }

    invalidateAllLeaderboards();
    const token = fastify.issueSession(user);

    return reply.redirect(`${config.frontendUrl}/auth/callback#token=${token}`);
  });

  fastify.post('/api/auth/logout', async () => {
    return { ok: true };
  });

  fastify.get('/api/auth/me', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, login, display_name, avatar_url, privacy_enabled, is_guest')
      .eq('id', request.user.id)
      .single();
    if (error) return reply.code(404).send({ error: 'User not found' });
    return user;
  });

  // GDPR Art. 15: everything we hold about the caller, as one JSON file.
  fastify.get('/api/auth/export', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const userId = request.user.id;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, intra_id, login, display_name, avatar_url, privacy_enabled, is_guest, created_at')
      .eq('id', userId)
      .single();

    if (userError || !user) return reply.code(404).send({ error: 'User not found' });

    const { data: results, error: resultsError } = await supabase
      .from('word_results')
      .select('id, word_id, status, nb_tries, started_at, solved_at, time_seconds')
      .eq('user_id', userId);

    if (resultsError) return reply.code(500).send({ error: 'Export failed' });

    // One query through the guesses -> word_results foreign key. Chunking ids
    // would work too, but the URL limit is not worth testing on long accounts.
    const [{ data: guessRows, error: guessesError }, { data: flags }] = await Promise.all([
      supabase
        .from('guesses')
        .select('id, word_result_id, guess, feedback, created_at, word_results!inner(user_id)')
        .eq('word_results.user_id', userId),
      supabase
        .from('flagged_users')
        .select('draw_date, reason, fast_gap_words, low_variance_words, created_at')
        .eq('user_id', userId),
    ]);

    if (guessesError) return reply.code(500).send({ error: 'Export failed' });

    const guesses = (guessRows ?? []).map((row) => ({
      id: row.id,
      word_result_id: row.word_result_id,
      guess: row.guess,
      feedback: row.feedback,
      created_at: row.created_at,
    }));

    const payload = {
      exported_at: new Date().toISOString(),
      controller: 'Helene Tharrault c/o 42, Harzer Straße 39, 12043 Berlin, Deutschland',
      user,
      word_results: results ?? [],
      guesses,
      flagged_days: flags ?? [],
    };

    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="wordel-data.json"')
      .send(JSON.stringify(payload, null, 2));
  });

  // GDPR Art. 17: irreversible. The mirrored avatar lives in object storage, so
  // it is removed separately; a failure there must not keep the account alive.
  fastify.delete('/api/auth/me', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const userId = request.user.id;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, intra_id')
      .eq('id', userId)
      .single();

    if (userError || !user) return reply.code(404).send({ error: 'User not found' });

    if (user.intra_id != null) {
      const { error: storageError } = await supabase.storage
        .from('avatars')
        .remove([`${user.intra_id}.jpg`]);
      if (storageError) request.log.warn(storageError, 'avatar delete failed during account deletion');
    }

    const { error } = await supabase.rpc('delete_account', { p_user_id: userId });
    if (error) {
      request.log.error(error, 'Failed to delete account');
      return reply.code(500).send({ error: 'Failed to delete account' });
    }

    invalidateAllLeaderboards();
    return { ok: true };
  });

  fastify.patch('/api/auth/privacy', { preHandler: [fastify.requireAuth] }, async (request, reply) => {
    const { privacy_enabled } = request.body ?? {};
    if (typeof privacy_enabled !== 'boolean') {
      return reply.code(400).send({ error: 'privacy_enabled must be a boolean' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .update({ privacy_enabled })
      .eq('id', request.user.id)
      .select('id, login, display_name, avatar_url, privacy_enabled')
      .single();

    if (error) return reply.code(500).send({ error: 'Failed to update privacy' });
    
    invalidateAllLeaderboards();
    return user;
  });
}
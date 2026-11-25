import { supabase } from '../supabase.js';
import { planHandleUpdate, validateHandle, checkAvailability } from '../lib/handles.js';
import { invalidateScope } from '../lib/leaderboardCache.js';

const USER_FIELDS = 'id, login, is_guest, global_opt_in, handle, handle_changed_at';
const UPDATED_FIELDS = 'handle, global_opt_in, handle_changed_at';

const LOCKED = { error: "Handles can't be changed once set", locked: true };

// Join the open board (global_opt_in false -> true) or spend the one free change
// a guest gets. There is no leave endpoint on purpose.
//
// `db` and `isHandleFree` are injectable so the lock can be tested without a
// database (including the two-tabs race).
export function makeJoinGlobalHandler({ db = supabase, isHandleFree = checkAvailability } = {}) {
  return async function joinGlobalHandler(request, reply) {
    const userId = request.user.id;

    const { data: user, error: userError } = await db
      .from('users')
      .select(USER_FIELDS)
      .eq('id', userId)
      .single();

    if (userError || !user) return reply.code(404).send({ error: 'User not found' });

    const plan = planHandleUpdate(user, request.body?.handle);

    if (plan.unchanged) {
      return {
        handle: user.handle,
        global_opt_in: user.global_opt_in,
        handle_changed_at: user.handle_changed_at,
      };
    }
    if (plan.status) {
      const body = { error: plan.error };
      if (plan.locked) body.locked = true;
      return reply.code(plan.status).send(body);
    }

    try {
      if (!(await isHandleFree(userId, plan.handle))) {
        return reply.code(409).send({ error: 'This handle is already taken' });
      }
    } catch (err) {
      request.log.error(err, 'handle availability check failed');
      return reply.code(500).send({ error: 'Failed to check handle' });
    }

    // The read above is only a fast path. The write carries the predicate the
    // decision depended on, so a second tab cannot apply a stale decision:
    //   join  -> the row is still not opted in
    //   first -> handle_changed_at is still NULL
    //   case  -> the row is still opted in, and the handle is still the one the
    //            decision was made on (a real change may have landed meanwhile)
    let update = db.from('users').update(plan.patch).eq('id', userId);

    if (plan.guard === 'join') update = update.eq('global_opt_in', false);
    else if (plan.guard === 'first') update = update.is('handle_changed_at', null);
    else update = update.eq('global_opt_in', true).eq('handle', user.handle);

    const { data: updated, error } = await update.select(UPDATED_FIELDS).maybeSingle();

    if (error) {
      // users_handle_lower_uniq lost the race; the RPC said it was free.
      if (error.code === '23505') {
        return reply.code(409).send({ error: 'This handle is already taken' });
      }
      request.log.error(error, 'Failed to update handle');
      return reply.code(500).send({ error: 'Failed to update handle' });
    }

    // No row matched the guard: another request already applied the change.
    if (!updated) return reply.code(409).send(LOCKED);

    invalidateScope('open');
    return updated;
  };
}

export default async function handleRoutes(fastify) {
  // Live availability check for the handle input. Rate-limited separately from
  // the global limiter because the field calls it on every keystroke.
  fastify.get(
    '/api/me/handle-available',
    {
      preHandler: [fastify.requireAuth],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { handle, error: validationError } = validateHandle(request.query?.h);
      if (validationError) return reply.code(400).send({ error: validationError });

      try {
        const available = await checkAvailability(request.user.id, handle);
        return { handle, available };
      } catch (err) {
        request.log.error(err, 'handle availability check failed');
        return reply.code(500).send({ error: 'Failed to check handle' });
      }
    }
  );

  fastify.put('/api/me/global', { preHandler: [fastify.requireAuth] }, makeJoinGlobalHandler());
}

import { supabase } from '../supabase.js';

// Handle rules for the open leaderboard. One source of truth for the backend:
// the SQL CHECK (users_handle_format) only enforces the shape, everything else
// (reserved words, blocklist, guest prefix, login clashes, cooldown) lives here.

export const HANDLE_RE = /^[A-Za-z0-9_-]{3,16}$/;

const HANDLE_FORMAT_ERROR = 'Handle must be 3-16 characters: letters, digits, "-" or "_"';

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b' };

// lowercase, drop - and _, undo the obvious digit substitutions.
export function normalizeForMatch(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[-_]/g, '')
    .replace(/[0134578]/g, (char) => LEET[char]);
}

// Both lists are written naturally and normalized at build time, so they are
// compared against the same normalization as the input: 'wordel42' also blocks
// 'W0rdel42', and '42cup' blocks '4-2-Cup'. Edit the *arrays*, lowercase.
const RESERVED_WORDS = [
  'admin', 'administrator', 'root', 'system', 'support', 'moderator', 'mod',
  'staff', 'official', 'wordel', 'wordel42', '42', '42cup', '42berlin',
  'bubar', 'intra', 'anonymous', 'deleted', 'null', 'undefined',
];

// Starter blocklist, same normalization. Edit freely; keep it lowercase.
const BLOCKED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'rape', 'sex', 'porn',
  'nazi', 'hitler', 'nigger', 'faggot', 'retard', 'penis', 'vagina',
  'arschloch', 'wichser', 'hurensohn', 'fotze', 'schwuchtel',
];

export const RESERVED_HANDLES = new Set(RESERVED_WORDS.map(normalizeForMatch));
export const BLOCKED_HANDLES = new Set(BLOCKED_WORDS.map(normalizeForMatch));

// Returns { handle } on success, { error } on failure. `handle` is trimmed but
// otherwise keeps its case: the unique index is on lower(handle).
export function validateHandle(raw) {
  if (typeof raw !== 'string') return { error: 'handle is required' };

  const handle = raw.trim();
  if (!HANDLE_RE.test(handle)) return { error: HANDLE_FORMAT_ERROR };

  // The guest_ prefix belongs to the accounts the database creates itself, so a
  // user cannot pick it. Normalized, so gu3st_ and guest- are covered too.
  const normalized = normalizeForMatch(handle);
  if (normalized.startsWith('guest')) {
    return { error: 'Handles starting with "guest" are reserved' };
  }

  if (RESERVED_HANDLES.has(normalized)) return { error: 'This handle is reserved' };
  if (BLOCKED_HANDLES.has(normalized)) return { error: 'This handle is not allowed' };

  return { handle };
}

// handle_available() excludes the caller's own row, so an unchanged handle and
// the caller's own intra login both come back available.
export async function checkAvailability(userId, handle) {
  const { data, error } = await supabase.rpc('handle_available', {
    p_handle: handle,
    p_user_id: userId,
  });
  if (error) throw error;
  return data === true;
}

// A handle is chosen once. handle_changed_at == null means it is still free to
// set: the 42 player has not joined yet, or the guest still has the default.
export function canRename(handleChangedAt) {
  return !handleChangedAt;
}

// Everything the PUT /api/me/global handler needs to decide, without touching
// the database: validate, detect a no-op, apply the lock, build the patch.
export function planHandleUpdate(user, rawHandle) {
  const raw = typeof rawHandle === 'string' ? rawHandle.trim() : '';

  if (user.global_opt_in && user.handle) {
    // Re-sending the current handle is a no-op, and must not lock anything.
    if (raw === user.handle) return { unchanged: true };

    // A case-only change is cosmetic: allowed even on a locked handle, and it
    // never touches handle_changed_at. The lowercase form already exists on
    // this row and passed validation when it was set, so only the shape is
    // re-checked here.
    if (raw.toLowerCase() === user.handle.toLowerCase()) {
      if (!HANDLE_RE.test(raw)) return { status: 400, error: HANDLE_FORMAT_ERROR };
      return { handle: raw, joining: false, guard: 'case', patch: { handle: raw } };
    }
  }

  const { handle, error } = validateHandle(raw);
  if (error) return { status: 400, error };

  // Joining (global_opt_in false) sets the handle for the first time and is
  // always allowed. Any later change is refused: there is no rename.
  const joining = !user.global_opt_in;
  if (!joining && !canRename(user.handle_changed_at)) {
    return { status: 409, error: "Handles can't be changed once set", locked: true };
  }

  const changedAt = new Date().toISOString();
  return {
    handle,
    joining,
    // Which predicate the UPDATE must carry, so the database decides instead of
    // the (possibly stale) read above. See makeJoinGlobalHandler.
    guard: joining ? 'join' : 'first',
    patch: joining
      ? { handle, global_opt_in: true, handle_changed_at: changedAt }
      : { handle, handle_changed_at: changedAt },
  };
}

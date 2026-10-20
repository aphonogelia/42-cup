import { supabase } from '../src/supabase.js';
import { mirrorAvatar, getAppToken } from '../src/lib/avatarStore.js';

console.log('storage base:', supabase.storage.from('avatars').getPublicUrl('x').data.publicUrl);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DRY = process.argv.includes('--dry');

async function freshUrl(intraId) {
  const token = await getAppToken(console);
  const res = await fetch(`https://api.intra.42.fr/v2/users/${intraId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u.image?.versions?.medium ?? u.image?.link ?? null;
}

const { data: users, error } = await supabase
  .from('users')
  .select('id, intra_id, login, avatar_url');
if (error) throw error;

const todo = users.filter((u) => !u.avatar_url?.includes('.supabase.co/'));
console.log(`${users.length} users, ${todo.length} to mirror${DRY ? ' (dry run)' : ''}`);

let ok = 0;
let failed = 0;
for (const u of todo) {
  if (DRY) { console.log('would mirror', u.login); continue; }

  // 1) stored URL, 2) fresh URL from the 42 API
  let stored = u.avatar_url ? await mirrorAvatar(u.intra_id, u.avatar_url) : null;
  if (!stored) {
    await sleep(600);
    const src = await freshUrl(u.intra_id);
    if (src) stored = await mirrorAvatar(u.intra_id, src);
  }

  if (stored) {
    const { error: upErr } = await supabase
      .from('users')
      .update({ avatar_url: stored })
      .eq('id', u.id);
    if (upErr) { console.error('update failed', u.login, upErr.message); failed++; continue; }
    console.log('ok', u.login);
    ok++;
  } else {
    console.log('FAILED', u.login);
    failed++;
  }
  await sleep(600); // 42 API rate limit is 2 req/s
}
console.log(`done: ${ok} ok, ${failed} failed`);
process.exit(0);

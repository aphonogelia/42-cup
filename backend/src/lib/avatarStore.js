import { config } from '../config.js';
import { supabase } from '../supabase.js';

const BUCKET = 'avatars';
let cached = null;

async function getAppToken() {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const res = await fetch('https://api.intra.42.fr/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.fortyTwo.clientId,
      client_secret: config.fortyTwo.clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`42 app token ${res.status}`);
  const json = await res.json();
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 7200) * 1000 };
  return cached.token;
}

// Returns the new public URL, or null on failure (caller keeps the old value).
export async function mirrorAvatar(intraId, sourceUrl, log = console) {
  try {
    const token = await getAppToken();
    const res = await fetch(sourceUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`CDN ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) throw new Error(`unexpected content-type ${type}`);

    const path = `${intraId}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await res.arrayBuffer()), {
        contentType: type,
        upsert: true,
        cacheControl: '3600',
      });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (err) {
    log.error?.(err, 'avatar mirror failed');
    return null;
  }
}
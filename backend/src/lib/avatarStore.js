import { config } from '../config.js';
import { supabase } from '../supabase.js';

const BUCKET = 'avatars';
let cached = null;

async function getAppToken(log) {
  if (cached && cached.exp > Date.now() + 60_000) {
    log.info('avatar: app token cache hit');
    return cached.token;
  }
  const res = await fetch('https://api.intra.42.fr/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.fortyTwo.clientId,
      client_secret: config.fortyTwo.clientSecret,
    }),
  });
  log.info({ status: res.status }, 'avatar: app token response');
  if (!res.ok) throw new Error(`42 app token ${res.status}`);
  const json = await res.json();
  cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 7200) * 1000 };
  return cached.token;
}

export async function mirrorAvatar(intraId, sourceUrl, log = console) {
  const t0 = Date.now();
  try {
    log.info({ intraId, sourceUrl }, 'avatar: mirror start');
    const token = await getAppToken(log);

    const res = await fetch(sourceUrl, { headers: { Authorization: `Bearer ${token}` } });
    const type = res.headers.get('content-type') ?? '';
    log.info({ status: res.status, type }, 'avatar: CDN response');
    if (!res.ok) throw new Error(`CDN ${res.status}`);
    if (!type.startsWith('image/')) throw new Error(`unexpected content-type ${type}`);

    const buf = Buffer.from(await res.arrayBuffer());
    log.info({ bytes: buf.length }, 'avatar: downloaded');

    const path = `${intraId}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: type, upsert: true, cacheControl: '3600' });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;
    log.info({ url, ms: Date.now() - t0 }, 'avatar: mirror done');
    return url;
  } catch (err) {
    log.error({ err: { message: err.message, status: err.status ?? err.statusCode }, ms: Date.now() - t0 }, 'avatar: mirror failed');
    return null;
  }
}
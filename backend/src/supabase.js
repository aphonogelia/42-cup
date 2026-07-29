import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { config } from './config.js';

// Service role key bypasses RLS. This client must NEVER be sent to,
// or its key exposed to, the frontend. It only lives here, server-side.
//
// We don't use Supabase Realtime in this project, but the client
// initializes a RealtimeClient internally regardless, which needs a
// WebSocket implementation. Node 20 has no native WebSocket global
// (that landed in Node 22), so we hand it the `ws` package explicitly.
export const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

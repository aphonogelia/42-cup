// Seconds -> "1m 05s" / "42s". Shared by the leaderboards.
export function formatTime(seconds) {
  if (seconds == null) return '—';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

// Seconds -> "1:05". Compact form for table columns that must fit on one line.
export function formatClock(seconds) {
  if (seconds == null) return '—';
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
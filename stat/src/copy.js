// All the words on the page. Rewrite freely; the numbers come from the cache.
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const fmt = (d) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

export function heroLine(o) {
  const played = o.wordsPlayed.users + o.wordsPlayed.guests;
  return `${played.toLocaleString('en-GB')} words played so far, by ${o.players} players with a 42 account and a crowd of guests.`;
}

export const intro = 'Every day, a few new words. Here is what happened to them.';

export function wordsPlayedSteps(o) {
  const first = o.daily[0];
  const firstTotal =
    first.users.solved + first.users.failed + first.guests.solved + first.guests.failed;
  const guests = o.wordsPlayed.guests;
  const total = o.wordsPlayed.users + guests;
  return [
    `It starts on ${fmt(first.date)}: ${firstTotal} words played on the first day.`,
    `Players with a 42 account played ${o.wordsPlayed.users.toLocaleString('en-GB')} words. Guests played ${guests.toLocaleString('en-GB')}, ${pct(guests, total)}% of the total.`,
    `Up to ${fmt(o.throughDate)}, 42 players solved ${pct(o.wordsSolved, o.wordsPlayed.users)}% of the words they played, in a median of ${o.medianSolveTime ?? '?'} seconds.`,
  ];
}

export function firstWordsSteps(fw) {
  const top = fw.top;
  const s = (t) => `${t.word.toUpperCase()} (${pct(t.count, fw.games)}%)`;
  const steps = [`Every game starts with a guess. ${s(top[0])} is the most common opener.`];
  if (top.length > 1) steps.push(`Next: ${top.slice(1, 3).map(s).join(' and ')}.`);
  return steps;
}
import { motion } from 'framer-motion';
import { scaleBand, scaleLinear } from 'd3-scale';

const W = 600;
const H = 320;
const M = { t: 10, r: 10, b: 28, l: 36 };

// Words played per day: non-guest (bottom) + guests (top). `visible` = how many days are drawn.
export function WordsPlayedChart({ daily, visible }) {
  const rows = daily.map((d) => ({
    date: d.date,
    users: d.users.solved + d.users.failed,
    guests: d.guests.solved + d.guests.failed,
  }));
  const x = scaleBand()
    .domain(rows.map((r) => r.date))
    .range([M.l, W - M.r])
    .padding(0.15);
  const max = Math.max(1, ...rows.map((r) => r.users + r.guests));
  const y = scaleLinear().domain([0, max]).nice().range([H - M.b, M.t]);
  const base = y(0);

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Words played per day, guests and players with a 42 account">
        {y.ticks(4).map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={M.l - 6} y={y(t) + 4} textAnchor="end" className="tick">{t}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const on = i < visible;
          const hu = on ? base - y(r.users) : 0;
          const hg = on ? base - y(r.guests) : 0;
          const t = { duration: 0.4, delay: Math.min(i * 0.01, 0.6) };
          return (
            <g key={r.date}>
              <motion.rect x={x(r.date)} width={x.bandwidth()} rx="2" fill="var(--coral)" initial={false} animate={{ y: base - hu, height: hu }} transition={t} />
              <motion.rect x={x(r.date)} width={x.bandwidth()} rx="2" fill="var(--sky)" initial={false} animate={{ y: base - hu - hg, height: hg }} transition={t} />
            </g>
          );
        })}
        <text x={M.l} y={H - 8} className="tick">{rows[0].date.slice(5)}</text>
        <text x={W - M.r} y={H - 8} textAnchor="end" className="tick">{rows[rows.length - 1].date.slice(5)}</text>
      </svg>
      <div className="legend">
        <span><i style={{ background: 'var(--coral)' }} />42 players</span>
        <span><i style={{ background: 'var(--sky)' }} />guests</span>
      </div>
    </div>
  );
}

// Ranked openers. `focus` = indices kept at full opacity (null = all).
export function FirstWordsChart({ top, focus }) {
  const max = Math.max(1, ...top.map((t) => t.count));
  return (
    <div className="fw">
      {top.map((t, i) => (
        <div key={t.word} className="fw-row" style={{ opacity: !focus || focus.includes(i) ? 1 : 0.3 }}>
          <span className="fw-word">{t.word}</span>
          <div className="fw-track">
            <motion.div
              className="fw-bar"
              initial={{ width: 0 }}
              whileInView={{ width: `${(t.count / max) * 100}%` }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.6, delay: i * 0.05 }}
            />
          </div>
          <span className="fw-n">{t.count}</span>
        </div>
      ))}
    </div>
  );
}
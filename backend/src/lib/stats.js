export function computeStats(results, dateCounts, todayKey) {
  const byDate = new Map();
  for (const r of results) {
    if (!byDate.has(r.draw_date)) byDate.set(r.draw_date, []);
    byDate.get(r.draw_date).push(r);
  }

  const guessDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  let fastestSolve = null;
  let fastestDay = null;
  const dayStatus = [];

  for (const { draw_date, total } of dateCounts) {
    const dayResults = byDate.get(draw_date) ?? [];
    const solvedCount = dayResults.filter((r) => r.status === 'solved').length;
    const playedCount = dayResults.filter((r) => r.nb_tries > 0).length;
    const allSolved = total > 0 && solvedCount === total;
    const allPlayed = total > 0 && playedCount === total;

    dayStatus.push({ draw_date, allSolved, allPlayed });

    for (const r of dayResults) {
      if (r.status !== 'solved') continue;

      if (r.nb_tries >= 1 && r.nb_tries <= 6) guessDistribution[r.nb_tries]++;

      if (fastestSolve === null || r.time_seconds < fastestSolve.time_seconds) {
        fastestSolve = { time_seconds: r.time_seconds, draw_date, order_index: r.order_index };
      }
    }

    if (allSolved) {
      const sumTime = dayResults.reduce((sum, r) => sum + (r.time_seconds || 0), 0);
      if (fastestDay === null || sumTime < fastestDay.total_time) {
        fastestDay = { draw_date, total_time: sumTime };
      }
    }
  }

  return {
    guessDistribution,
    fastestSolve,
    fastestDay,
    streakSolved: computeStreak(dayStatus, 'allSolved', todayKey),
    streakPlayed: computeStreak(dayStatus, 'allPlayed', todayKey),
  };
}

function computeStreak(dayStatus, key, todayKey) {
  let longest = 0;
  let running = 0;

  for (const day of dayStatus) {
    if (day[key]) {
      running++;
      if (running > longest) longest = running;
    } else {
      running = 0;
    }
  }

  let current = 0;
  for (let i = dayStatus.length - 1; i >= 0; i--) {
    const day = dayStatus[i];
    if (day.draw_date === todayKey && !day[key]) continue; // today unfinished — don't break streak yet
    if (day[key]) {
      current++;
    } else {
      break;
    }
  }

  return { current, longest };
}
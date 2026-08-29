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

  let solvedTimeSum = 0;
  let solvedTimeCount = 0;
  let solvedTimeSumFiltered = 0;
  let solvedTimeCountFiltered = 0;
  const OUTLIER_THRESHOLD_SECONDS = 30 * 60;

  let daysAllSolved = 0;
  let daysAllPlayed = 0;
  let daysStarted = 0;

  for (const { draw_date, total } of dateCounts) {
    const dayResults = byDate.get(draw_date) ?? [];
    const solvedCount = dayResults.filter((r) => r.status === 'solved').length;
    const playedCount = dayResults.filter((r) => r.nb_tries > 0).length;
    const allSolved = total > 0 && solvedCount === total;
    const allPlayed = total > 0 && playedCount === total;
    const anyPlayed = playedCount > 0;

    dayStatus.push({ draw_date, allSolved, allPlayed });

    if (allSolved) daysAllSolved++;
    if (allPlayed) daysAllPlayed++;
    if (anyPlayed) daysStarted++;

    for (const r of dayResults) {
      if (r.status !== 'solved') continue;

      if (r.nb_tries >= 1 && r.nb_tries <= 6) guessDistribution[r.nb_tries]++;

      if (fastestSolve === null || r.time_seconds < fastestSolve.time_seconds) {
        fastestSolve = { time_seconds: r.time_seconds, draw_date, order_index: r.order_index };
      }

      solvedTimeSum += r.time_seconds;
      solvedTimeCount++;

      if (r.time_seconds <= OUTLIER_THRESHOLD_SECONDS) {
        solvedTimeSumFiltered += r.time_seconds;
        solvedTimeCountFiltered++;
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
    avgWordTime: solvedTimeCount > 0 ? solvedTimeSum / solvedTimeCount : null,
    avgWordTimeFiltered: solvedTimeCountFiltered > 0 ? solvedTimeSumFiltered / solvedTimeCountFiltered : null,
    daysAllSolved,
    daysAllPlayed,
    daysStarted,
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
    if (day.draw_date === todayKey && !day[key]) continue;
    if (day[key]) {
      current++;
    } else {
      break;
    }
  }

  return { current, longest };
}

export function computeRankCounts(leaderboardRows, userId) {
  const byDate = new Map();
  for (const row of leaderboardRows) {
    if (!byDate.has(row.draw_date)) byDate.set(row.draw_date, []);
    byDate.get(row.draw_date).push(row);
  }

  let top1 = 0;
  let top3 = 0;
  let top5 = 0;

  for (const rows of byDate.values()) {
    const sorted = rows.slice().sort((a, b) => {
      if (b.words_found !== a.words_found) return b.words_found - a.words_found;
      return a.total_time - b.total_time;
    });

    const rank = sorted.findIndex((r) => r.user_id === userId) + 1;
    if (rank === 0) continue;

    if (rank <= 1) top1++;
    if (rank <= 3) top3++;
    if (rank <= 5) top5++;
  }

  return { top1, top3, top5 };
}
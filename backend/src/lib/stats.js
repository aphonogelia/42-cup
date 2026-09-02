function quantile(sortedValues, q) {
  if (sortedValues.length === 0) return null;
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
}

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
  const solvedTimes = [];
  const OUTLIER_THRESHOLD_SECONDS = 30 * 60;

  let daysAllSolved = 0;
  let daysAllPlayed = 0;
  let daysStarted = 0;

  let wordsFound = 0;
  let wordsStarted = 0;

  const daysBreakdownMap = new Map(); // key: `${solvedCount}/${total}` -> day count

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
    if (anyPlayed) {
      daysStarted++;
      const key = `${solvedCount}/${total}`;
      daysBreakdownMap.set(key, (daysBreakdownMap.get(key) ?? 0) + 1);
    }

    for (const r of dayResults) {
      if (r.nb_tries > 0) wordsStarted++;

      if (r.status !== 'solved') continue;

      wordsFound++;

      if (r.nb_tries >= 1 && r.nb_tries <= 6) guessDistribution[r.nb_tries]++;

      if (fastestSolve === null || r.time_seconds < fastestSolve.time_seconds) {
        fastestSolve = {
          time_seconds: r.time_seconds,
          draw_date,
          order_index: r.order_index,
          answer: r.answer,
        };
      }

      solvedTimeSum += r.time_seconds;
      solvedTimeCount++;
      solvedTimes.push(r.time_seconds);

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

  const daysBreakdown = [...daysBreakdownMap.entries()]
    .map(([key, count]) => {
      const [solved, total] = key.split('/').map(Number);
      return { solved, total, count };
    })
    .sort((a, b) => b.total - a.total || b.solved - a.solved);

  const sortedSolvedTimes = solvedTimes.slice().sort((a, b) => a - b);
  const wordTimeQuartiles = {
    q1: quantile(sortedSolvedTimes, 0.25),
    q2: quantile(sortedSolvedTimes, 0.5),
    q3: quantile(sortedSolvedTimes, 0.75),
  };

  return {
    guessDistribution,
    fastestSolve,
    fastestDay,
    avgWordTime: solvedTimeCount > 0 ? solvedTimeSum / solvedTimeCount : null,
    avgWordTimeFiltered: solvedTimeCountFiltered > 0 ? solvedTimeSumFiltered / solvedTimeCountFiltered : null,
    wordTimeQuartiles,
    daysAllSolved,
    daysAllPlayed,
    daysStarted,
    wordsFound,
    wordsStarted,
    daysBreakdown,
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
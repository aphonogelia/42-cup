// Tunable rules for the monthly + global leaderboards. They are sent to the
// leaderboard_period() RPC and returned to the frontend as `thresholds`, so the
// UI never hardcodes them.
//
// score (seconds, lower is better) =
//     median word cost
//   x (1 + failPenaltyWeight x share of started words left unsolved)
//   x (1 - longevity bonus)
// where a solved word costs: time + tryPenaltySeconds x (tries - 1)
//
// longevity bonus = longevityMax x min(complete days / window, 1), where the
// window is the number of days of the month (monthly board) or
// allTimeLongevityDays (all-time board).
export const LEADERBOARD_RULES = {
    monthlyMinDays: 7,        // complete days needed to be ranked on a month (a month is also only listed once it has this many days)
    globalMinDays: 15,        // complete days needed to be ranked on the all-time board
    tryPenaltySeconds: 20,    // cost of each extra try
    failPenaltyWeight: 2,     // each 1% of started words left unsolved makes the score failPenaltyWeight % worse
    longevityMax: 0.10,       // max score reduction for participation
    allTimeLongevityDays: 60, // complete days needed for the full bonus on the global board
};
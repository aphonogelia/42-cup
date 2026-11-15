// Single source of truth for the monthly + global leaderboard rules. Every
// value is passed explicitly to leaderboard_period() and returned to the
// frontend as `thresholds`, so neither SQL nor the UI hardcodes them.
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
    monthlyMinDays: 5,        // complete days needed to be ranked on a month (a month is also only listed once it has this many days)
    globalMinDays: 15,        // complete days needed to be ranked on the all-time board
    tryPenaltySeconds: 20,    // cost of each extra try
    failPenaltyWeight: 3,     // each 1% of started words left unsolved makes the score failPenaltyWeight % worse
    longevityMax: 0.10,       // max score reduction for participation
    allTimeLongevityDays: 60, // complete days needed for the full bonus on the global board
};
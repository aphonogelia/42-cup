// Tunable rules for the monthly + global leaderboards. They are sent to the
// leaderboard_period() RPC and returned to the frontend as `thresholds`, so the
// UI never hardcodes them.
//
// score (seconds, lower is better) =
//     median word cost
//   x (1 + fail rate)
//   x (1 - longevity bonus)
// where a solved word costs: time + tryPenaltySeconds x (tries - 1)
export const LEADERBOARD_RULES = {
    minDays: 10,              // complete days needed to be ranked
    tryPenaltySeconds: 30,    // cost of each extra try
    longevityMax: 0.10,       // max score reduction for participation
    allTimeLongevityDays: 60, // complete days needed for the full bonus on the global board
};
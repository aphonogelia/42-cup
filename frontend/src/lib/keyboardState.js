const FEEDBACK_ORDER = { correct: 3, present: 2, absent: 1 };

// Reduces a set of guesses down to the best-known feedback per letter,
// for coloring the on-screen keyboard (correct beats present beats absent).
export function computeLetterStates(guesses) {
    const states = {};
    for (const g of guesses) {
        g.guess.split('').forEach((ch, i) => {
            const fb = g.feedback[i];
            if (!states[ch] || FEEDBACK_ORDER[fb] > FEEDBACK_ORDER[states[ch]]) {
                states[ch] = fb;
            }
        });
    }
    return states;
}
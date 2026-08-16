import { supabase } from '../supabase.js';

function getGaps(guesses) {
    const gaps = [];

    for (let i = 1; i < guesses.length; i++) {
        const previous = new Date(guesses[i - 1].created_at).getTime();
        const current = new Date(guesses[i].created_at).getTime();

        gaps.push((current - previous) / 1000);
    }

    return gaps;
}

function standardDeviation(values) {
    if (values.length === 0) return null;

    const mean =
        values.reduce((sum, value) => sum + value, 0) / values.length;

    const variance =
        values.reduce(
            (sum, value) => sum + ((value - mean) ** 2),
            0
        ) / values.length;

    return Math.sqrt(variance);
}

function analyseWord(guesses, answer) {
    const gaps = getGaps(guesses);

    const hasFastGap = gaps.some((gap) => gap < 1);

    const deviation = standardDeviation(gaps);

    const average = gaps.length
        ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length
        : null;

    const hasLowVariance =
        gaps.length >= 3 &&
        deviation < 0.15 &&
        average < 3;

    const firstGuess = guesses[0]?.guess?.toLowerCase();

    const firstGuessIsAnswer =
        firstGuess &&
        answer &&
        firstGuess === answer.toLowerCase();

    return {
        hasFastGap,
        hasLowVariance,
        firstGuessIsAnswer,
        gaps,
    };
}

async function sendTelegram(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        throw new Error('Missing Telegram configuration');
    }

    const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
            }),
        }
    );

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram error: ${body}`);
    }
}

export async function checkPlayerForCheating(userId, drawDate, login) {
    const { data: results, error } = await supabase
        .from('word_results')
        .select(`
            id,
            word_id,
            status,
            guesses (
                guess,
                created_at
            ),
            words!inner (
                draw_date,
                answer
            )
        `)
        .eq('user_id', userId)
        .eq('words.draw_date', drawDate);

    if (error) throw error;

    const words = results.filter(
        (result) => result.status !== 'in_progress'
    );

    const analyses = words.map((word) => {
        const guesses = (word.guesses ?? []).sort(
            (a, b) =>
                new Date(a.created_at) - new Date(b.created_at)
        );

        return {
            ...word,
            ...analyseWord(guesses, word.words.answer),
        };
    });

    const fastGapWords = analyses.filter(
        (word) => word.hasFastGap
    );

    const lowVarianceWords = analyses.filter(
        (word) => word.hasLowVariance
    );

    const firstGuessAnswerWords = analyses.filter(
        (word) => word.firstGuessIsAnswer
    );

    const allFiveFirstGuessesAreAnswers =
        words.length === 5 &&
        firstGuessAnswerWords.length === 5;

    const flagged =
        fastGapWords.length > 0 ||
        lowVarianceWords.length >= 3 ||
        allFiveFirstGuessesAreAnswers;

    if (!flagged) {
        return false;
    }

    const reasons = [];

    if (fastGapWords.length > 0) {
        reasons.push(`fast gap (${fastGapWords.length} words)`);
    }

    if (lowVarianceWords.length >= 3) {
        reasons.push(
            `low variance (${lowVarianceWords.length} words)`
        );
    }

    if (allFiveFirstGuessesAreAnswers) {
        reasons.push('all 5 answers as first guesses');
    }

    const reason = reasons.join(', ');

    // IMPORTANT: don't gate on the row coming back from .select() — if the
    // client's role has INSERT but not SELECT rights on flagged_users (e.g.
    // an RLS policy gap), the insert commits fine but the select-back comes
    // back empty with NO error, and we'd silently skip the Telegram message.
    // Only insertError (specifically a 23505 unique violation, meaning this
    // user/draw_date was already flagged) should decide whether we bail out.
    const { error: insertError } = await supabase
        .from('flagged_users')
        .insert({
            user_id: userId,
            draw_date: drawDate,
            reason,
            fast_gap_words: fastGapWords.length,
            low_variance_words: lowVarianceWords.length,
        });

    if (insertError) {
        // Unique constraint on (user_id, draw_date) means the player was
        // already flagged for this draw — don't re-send the alert.
        if (insertError.code === '23505') {
            return true;
        }

        throw insertError;
    }

    const message = [
        '🚨 Wordle flag',
        '',
        `User: ${login}`,
        `Date: ${drawDate}`,
        '',
        `Reason: ${reason}`,
        `Fast-gap words: ${fastGapWords.length}`,
        `Low-variance words: ${lowVarianceWords.length}`,
        `First guess = answer: ${firstGuessAnswerWords.length}/5`,
    ].join('\n');

    await sendTelegram(message);

    return true;
}
export function validateHardMode(guess, previousGuesses) {
  const requiredPositions = {};
  const requiredLetters = {};

  for (const previous of previousGuesses) {
    const word = previous.guess.toLowerCase();
    const feedback = previous.feedback;

    const minLetters = {};

    feedback.forEach((state, index) => {
      const letter = word[index];

      if (state === "correct") {
        requiredPositions[index] = letter;
        minLetters[letter] = (minLetters[letter] || 0) + 1;
      }

      if (state === "present") {
        minLetters[letter] = (minLetters[letter] || 0) + 1;
      }
    });

    for (const [letter, count] of Object.entries(minLetters)) {
      requiredLetters[letter] = Math.max(
        requiredLetters[letter] || 0,
        count
      );
    }
  }


  // Check green letters
  for (const [index, letter] of Object.entries(requiredPositions)) {
    if (guess[index] !== letter) {
      return {
        valid: false,
        error: `Hard mode: letter ${letter.toUpperCase()} must stay in position ${Number(index) + 1}`,
      };
    }
  }


  // Check yellow/green letters exist
  for (const [letter, count] of Object.entries(requiredLetters)) {
    const found =
      guess.split("").filter((c) => c === letter).length;

    if (found < count) {
      return {
        valid: false,
        error: `Hard mode: guess must contain ${letter.toUpperCase()} (${count} times)`,
      };
    }
  }

  return { valid: true };
}
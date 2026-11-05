const DICTIONARY_URL = '/guesses.txt';

let dictionaryPromise;

function loadDictionary() {
  if (!dictionaryPromise) {
    dictionaryPromise = fetch(DICTIONARY_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load guess dictionary (${response.status})`);
        }
        return response.text();
      })
      .then((text) => new Set(
        text
          .split(/\r?\n/)
          .map((word) => word.trim().toLowerCase())
          .filter(Boolean)
      ));
  }

  return dictionaryPromise;
}

export async function isAllowedGuess(word) {
  try {
    const dictionary = await loadDictionary();
    return dictionary.has(word.toLowerCase());
  } catch (error) {
    console.error('Local guess validation unavailable; using server validation.', error);
    return null;
  }
}

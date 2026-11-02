from pathlib import Path
import csv
from wordfreq import zipf_frequency


def load_words(filename):
    return {
        line.strip().lower()
        for line in Path(filename).read_text(encoding="utf-8").splitlines()
        if len(line.strip()) == 5
        and line.strip().isalpha()
    }


# Load word lists
new = load_words("new_copy.txt")
guesses = load_words("guesses.txt")

# Sort all guesses
guesses_sorted = sorted(guesses)

# Write data to CSV
with open("guess_data.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)

    writer.writerow([
        "word",
        "zipf",
        "in_new",
        "ends_with_s",
    ])

    for word in guesses_sorted:
        writer.writerow([
            word,
            zipf_frequency(word, "en"),
            word in new,
            word.endswith("s"),
        ])

print(f"guess_data.csv: {len(guesses_sorted)} words")

import re
import requests
from bs4 import BeautifulSoup

URL = "https://wordfinder.yourdictionary.com/wordle/answers/"

response = requests.get(
    URL,
    headers={"User-Agent": "Mozilla/5.0"},
    timeout=30,
)
response.raise_for_status()

soup = BeautifulSoup(response.text, "html.parser")
answers = {}

for table in soup.find_all("table"):
    for row in table.find_all("tr"):
        cells = [
            cell.get_text(" ", strip=True)
            for cell in row.find_all(["td", "th"])
        ]

        # Expected columns: Date | Wordle # | Answer
        if len(cells) < 3:
            continue

        # IMPORTANT: read the puzzle number from column 2,
        # not the date in column 1.
        match = re.fullmatch(r"\s*#?\s*(\d{1,4})\s*", cells[1])
        if not match:
            continue

        puzzle_number = int(match.group(1))
        if not 1 <= puzzle_number <= 1954:
            continue

        # Extract the five-letter word from the answer column.
        candidates = re.findall(
            r"\b[A-Z]{5}\b",
            cells[2].upper()
        )

        if candidates:
            answers[puzzle_number] = candidates[-1]

# Validate before writing, so an incomplete file isn't mistaken
# for a successful extraction.
missing = [
    n for n in range(1, 1955)
    if n not in answers
]

if 1954 not in answers:
    raise RuntimeError(
        f"Puzzle #1954 not found. Extracted {len(answers)} answers. "
        "Inspect the page HTML before writing the file."
    )

if len(answers) < 1900:
    raise RuntimeError(
        f"Only {len(answers)} answers extracted; refusing "
        "to write an incomplete file."
    )

with open("wordle_answers.txt", "w", encoding="utf-8") as f:
    for n in range(1, 1955):
        f.write(answers[n] + "\n")

print(f"Saved {len(answers)} answers to wordle_answers.txt")
print(f"First answer (#1): {answers.get(1)}")
print(f"Latest answer (#1954): {answers[1954]}")
print(f"Missing puzzle numbers: {missing}")

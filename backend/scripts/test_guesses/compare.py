
from pathlib import Path

def load_words(filename):
    return {
        line.strip().lower()
        for line in Path(filename).read_text(encoding="utf-8").splitlines()
        if len(line.strip()) == 5
        and line.strip().isalpha()
    }

old = load_words("old.txt")
new = load_words("new.txt")

both = sorted(old & new)
old_only = sorted(old - new)
new_only = sorted(new - old)

groups = {
    "both.txt": both,
    "old_only.txt": old_only,
    "new_only.txt": new_only,
}

for filename, words in groups.items():
    Path(filename).write_text(
        "".join(word + "\n" for word in words),
        encoding="utf-8",
    )
    print(f"{filename}: {len(words)} words")

print(f"\nOld unique words: {len(old)}")
print(f"New unique words: {len(new)}")
print(f"In both: {len(both)}")
print(f"Old only: {len(old_only)}")
print(f"New only: {len(new_only)}")
print(
    "\nCheck:",
    len(old) == len(both) + len(old_only)
    and len(new) == len(both) + len(new_only),
)

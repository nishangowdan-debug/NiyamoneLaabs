# Sales deck — Sree Diagnostics client walkthrough

Generates a 27-slide, brand-styled `.pptx` ready for the client visit.

## Build the deck (no Python needed)

```bash
# from the repo root
npm install --no-save pptxgenjs
node tools/sales-deck/build_deck.mjs
# → tools/sales-deck/Niyamone-SreeDiagnostics-Walkthrough.pptx
```

Python alternative (if you ever want it):
```bash
pip install python-pptx lxml
python tools/sales-deck/build_deck.py
```

## Add the screenshots
Drop PNGs into `tools/sales-deck/screenshots/` using the filenames in
[SCREENSHOTS.md](SCREENSHOTS.md). Re-run the build — the placeholders
get replaced with your real shots.

## Customising
Edit the `WALKTHROUGH` and `TRUST` lists at the bottom of
[build_deck.py](build_deck.py). Each entry is a tuple of
`(section_label, headline, bullets[], screenshot, caption, saves)`.
Bullets ≤ 4. Headline ≤ 60 chars. Caption ≤ 90 chars.

## Files in this folder
- `PROMPT.md`     — the reusable prompt you can hand to any AI tool to
                    regenerate this deck from scratch.
- `build_deck.py` — the pptx generator.
- `SCREENSHOTS.md`— capture checklist with exact filenames.
- `screenshots/`  — drop folder.
- `Niyamone-SreeDiagnostics-Walkthrough.pptx` — the output (gitignored).

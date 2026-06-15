# Wordle Image Designer

Paint a 5×6 Wordle grid and get a valid word sequence that matches your pattern.

**[Open the tool](https://ppoiuy.github.io/wordle-image-designer/)**

## How it works

1. Set the answer word
2. Paint the grid with green, yellow, and white tiles
3. Lock any row to a specific word using the input field beside it — pattern auto-computes, hard mode enforces forward and backward
4. Click **Generate Words** to find real words matching your pattern

## Features

- **Per-row word locking** — pin any row to a word; useful for reconstructing someone's game from their starting word and shared colors
- **Click to lock** — click any word in the alternatives list to lock that row instantly
- **Hard mode enforcement** — absent letters excluded, greens fixed, yellows reused; constraints accumulate across all locked rows
- Drag to paint multiple tiles at once
- Swap colors, flip grid horizontally or vertically
- Save and load grid presets
- Undo / redo (Ctrl+Z / Ctrl+Y)
- Session saved automatically between visits
- Hotkeys: `1`/`Q` white, `2`/`W` yellow, `3`/`E` green

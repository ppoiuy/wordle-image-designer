// Pre-built set for O(1) target inclusion checks
const BASE_WORDS_SET = new Set(WORDS);

let _wordListCache = null;
let _wordListTarget = null;

function getWordList(t) {
  if (_wordListCache && _wordListTarget === t) return _wordListCache;
  _wordListTarget = t;
  _wordListCache = BASE_WORDS_SET.has(t) ? WORDS : [...WORDS, t];
  return _wordListCache;
}

// ─── Cached DOM refs (set in init) ──────────────────────────────────────────
let elGrid, elWinRowNote, elUndoBtn, elRedoBtn, elResults, elSequence, elTargetValid, elTargetInput, elPresetList, elPresetNameInput, elStartInput, elStartValid;

// ─── History ────────────────────────────────────────────────────────────────
const MAX_HISTORY = 50;
const history = [];
const redoStack = [];

function snapshotGrid(g = grid) { return g.map(row => [...row]); }

function syncHistoryButtons() {
  elUndoBtn.disabled = history.length === 0;
  elRedoBtn.disabled = redoStack.length === 0;
}

function pushHistory() {
  history.push(snapshotGrid());
  if (history.length > MAX_HISTORY) history.shift();
  redoStack.length = 0;
  syncHistoryButtons();
}

function undo() {
  if (!history.length) return;
  redoStack.push(snapshotGrid());
  grid = history.pop();
  syncHistoryButtons();
  renderGrid();
}

function redo() {
  if (!redoStack.length) return;
  history.push(snapshotGrid());
  grid = redoStack.pop();
  syncHistoryButtons();
  renderGrid();
}

// ─── State ──────────────────────────────────────────────────────────────────
let currentBrush = 'green';
let grid = []; // 6 rows × 5 cols, each cell: 'white'|'yellow'|'green'

function initGrid() {
  grid = Array.from({length: 6}, () => ['white','white','white','white','white']);
}

// Return the index of the first all-green row (-1 if none)
function findWinRow() {
  for (let r = 0; r < 6; r++) {
    const row = grid[r];
    if (row[0]==='green'&&row[1]==='green'&&row[2]==='green'&&row[3]==='green'&&row[4]==='green') return r;
  }
  return -1;
}

// ─── Render Grid ────────────────────────────────────────────────────────────
function renderGrid() {
  elGrid.innerHTML = '';
  const winRow = findWinRow();

  // When forced start is active, compute row 0's real pattern to display
  const forcedRow0Pattern = (forcedStart && elTargetInput && elTargetInput.value.length === 5)
    ? computePattern(forcedStart, elTargetInput.value)
    : null;

  for (let r = 0; r < 6; r++) {
    const isWin        = winRow === r;
    const isAfterWin   = winRow !== -1 && r > winRow;
    const isForcedRow  = forcedStart && r === 0;

    const rowDiv = document.createElement('div');
    rowDiv.className = 'grid-row';
    if (isAfterWin) rowDiv.classList.add('after-win');
    if (isForcedRow) rowDiv.classList.add('forced-row');

    const lbl = document.createElement('div');
    lbl.className = 'row-label';
    lbl.textContent = r + 1;
    if (isWin) lbl.classList.add('win');
    if (isForcedRow) lbl.classList.add('forced');
    rowDiv.appendChild(lbl);

    for (let c = 0; c < 5; c++) {
      const tile = document.createElement('div');
      let color;
      if (isAfterWin) {
        color = 'absent';
      } else if (isForcedRow && forcedRow0Pattern) {
        color = forcedRow0Pattern[c];
      } else {
        color = grid[r][c];
      }
      tile.className = `tile color-${color}`;
      tile.dataset.r = r;
      tile.dataset.c = c;

      if (isAfterWin) {
        tile.title = 'This row is after the winning guess — unused';
      } else if (isForcedRow) {
        tile.title = `Locked to "${forcedStart}" — pattern auto-computed`;
        tile.classList.add('tile-locked');
      } else {
        tile.addEventListener('click', onTileClick);
        tile.addEventListener('mouseenter', onTileEnter);
        if (isWin) tile.title = 'Win row — all green = target word guessed correctly';
      }
      rowDiv.appendChild(tile);
    }

    elGrid.appendChild(rowDiv);
  }

  if (winRow === -1) {
    elWinRowNote.textContent = 'Paint a row all green to mark the winning guess';
    elWinRowNote.style.color = '#c9b458';
  } else {
    elWinRowNote.textContent = `✓ Win row: row ${winRow + 1} — rows after are unused`;
    elWinRowNote.style.color = '#6aaa64';
  }
  saveSession();
}

function onTileClick(e) {
  pushHistory();
  grid[+e.currentTarget.dataset.r][+e.currentTarget.dataset.c] = currentBrush;
  renderGrid();
}

function onTileEnter(e) {
  if (e.buttons === 1) onTileClick(e);
}

let _activeBrushBtn = null;
function setBrush(color) {
  currentBrush = color;
  if (_activeBrushBtn) _activeBrushBtn.classList.remove('active');
  _activeBrushBtn = document.getElementById(`brush-${color}`);
  _activeBrushBtn.classList.add('active');
}

function clearGrid() {
  pushHistory();
  initGrid();
  renderGrid();
}

function swapColors(a, b) {
  pushHistory();
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 5; c++) {
      if (grid[r][c] === a) grid[r][c] = b;
      else if (grid[r][c] === b) grid[r][c] = a;
    }
  }
  renderGrid();
}

function flipGrid(direction) {
  pushHistory();
  if (direction === 'horizontal') {
    for (let r = 0; r < 6; r++) grid[r].reverse();
  } else {
    grid.reverse();
  }
  renderGrid();
}

// ─── Wordle Logic ────────────────────────────────────────────────────────────
// Returns true if guess produces exactly pattern against target
function matchesPattern(guess, target, pattern) {
  const targetUsed = [false,false,false,false,false];
  const guessUsed  = [false,false,false,false,false];
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) { targetUsed[i] = guessUsed[i] = true; }
  }
  for (let i = 0; i < 5; i++) {
    if (guessUsed[i]) continue;
    let found = false;
    for (let j = 0; j < 5; j++) {
      if (targetUsed[j]) continue;
      if (guess[i] === target[j]) { targetUsed[j] = true; found = true; break; }
    }
    if (found !== (pattern[i] === 'yellow')) return false;
  }
  return true;
}

// Compute what pattern guess produces against target (returns array of 'green'|'yellow'|'white')
function computePattern(guess, target) {
  const pattern     = ['white','white','white','white','white'];
  const targetUsed  = [false,false,false,false,false];
  const guessUsed   = [false,false,false,false,false];
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) {
      pattern[i] = 'green';
      targetUsed[i] = guessUsed[i] = true;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (guessUsed[i]) continue;
    for (let j = 0; j < 5; j++) {
      if (targetUsed[j]) continue;
      if (guess[i] === target[j]) {
        pattern[i] = 'yellow';
        targetUsed[j] = true;
        break;
      }
    }
  }
  return pattern;
}

function findWordsForPattern(desiredPattern, target, words, limit = 20) {
  const results = [];
  for (const w of words) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if ((desiredPattern[i] === 'green') !== (w[i] === target[i])) { ok = false; break; }
    }
    if (ok && matchesPattern(w, target, desiredPattern)) {
      results.push(w);
      if (results.length >= limit) break;
    }
  }
  return results;
}

// ─── Hard-mode forward constraint helpers ────────────────────────────────────

// Build cumulative hard-mode constraints from a list of prior {word, pattern} pairs.
// greenAt:     position -> letter (must appear at that exact position)
// mustContain: letters that must appear somewhere (from yellows)
// mustExclude: letters that must NOT appear at all (scored white with no green/yellow hit)
function buildHardModeConstraints(priorGuesses) {
  const greenAt     = {};
  const mustContain = new Set();
  const mustExclude = new Set();
  for (const { word, pattern } of priorGuesses) {
    // First pass: find letters with at least one green or yellow hit
    const hasHit = new Set();
    for (let i = 0; i < 5; i++) {
      if (pattern[i] === 'green' || pattern[i] === 'yellow') hasHit.add(word[i]);
    }
    for (let i = 0; i < 5; i++) {
      if (pattern[i] === 'green') {
        greenAt[i] = word[i];
      } else if (pattern[i] === 'yellow') {
        mustContain.add(word[i]);
      } else if (pattern[i] === 'white' && !hasHit.has(word[i])) {
        // Truly absent — not present in target at all
        mustExclude.add(word[i]);
      }
    }
  }
  return { greenAt, mustContain, mustExclude };
}

function satisfiesHardMode(candidate, { greenAt, mustContain, mustExclude }) {
  for (const [pos, letter] of Object.entries(greenAt)) {
    if (candidate[+pos] !== letter) return false;
  }
  for (const letter of mustContain) {
    if (!candidate.includes(letter)) return false;
  }
  for (const letter of mustExclude) {
    if (candidate.includes(letter)) return false;
  }
  return true;
}

// Find words matching desiredPattern against target AND satisfying cumulative hard-mode constraints
function findWordsForPatternHard(desiredPattern, target, words, constraints, limit) {
  const results = [];
  for (const w of words) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if ((desiredPattern[i] === 'green') !== (w[i] === target[i])) { ok = false; break; }
    }
    if (!ok) continue;
    if (!matchesPattern(w, target, desiredPattern)) continue;
    if (!satisfiesHardMode(w, constraints)) continue;
    results.push(w);
    if (results.length >= limit) break;
  }
  return results;
}

// ─── Reverse constraint helpers ───────────────────────────────────────────────
// Return true if `nextWord` is a legal hard-mode follow-up after `word` produced `pattern`.
function isHardModeLegal(word, pattern, nextWord) {
  for (let i = 0; i < 5; i++) {
    if (pattern[i] === 'green' && nextWord[i] !== word[i]) return false;
  }
  for (let i = 0; i < 5; i++) {
    if (pattern[i] === 'yellow' && !nextWord.includes(word[i])) return false;
  }
  return true;
}

// Find words for a row in reverse mode: matches pattern AND nextWord is a valid
// hard-mode continuation from this word's result.
function findWordsForPatternReverse(desiredPattern, target, words, nextWord, limit) {
  const results = [];
  for (const w of words) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if ((desiredPattern[i] === 'green') !== (w[i] === target[i])) { ok = false; break; }
    }
    if (!ok) continue;
    if (!matchesPattern(w, target, desiredPattern)) continue;
    if (!isHardModeLegal(w, desiredPattern, nextWord)) continue;
    results.push(w);
    if (results.length >= limit) break;
  }
  return results;
}

// ─── Generate ────────────────────────────────────────────────────────────────
let useRandom   = true;
let altLimit    = Infinity;
let useReverse  = false;
let forcedStart = '';   // locked row-0 word; empty = disabled

function generateWords() {
  const target = elTargetInput.value;

  if (target.length !== 5) {
    elTargetValid.textContent = '⚠ Target must be exactly 5 letters';
    return;
  }
  elTargetValid.textContent = '';

  // Validate forced start word if set
  if (forcedStart && !BASE_WORDS_SET.has(forcedStart)) {
    elStartValid.textContent = '⚠ Starting word not in word list';
    elStartValid.style.color = '#f87';
    return;
  }

  const winRow = findWinRow();
  elResults.innerHTML = `<div class="status-msg info"><span class="spinner"></span> Finding words…</div>`;

  setTimeout(() => {
    const words = getWordList(target);
    const found = [];
    let allFound = true;
    const lastRow = winRow === -1 ? 5 : winRow;

    if (forcedStart) {
      // ── FORCED START + cumulative forward hard-mode ──────────────────────────
      // Row 0 is locked to forcedStart. Its pattern is fully determined by
      // computePattern(forcedStart, target) — we override the painted grid[0]
      // so that the hard-mode constraints are always consistent with the painted
      // patterns on rows 1+. Each subsequent row must satisfy the cumulative
      // hard-mode constraints built from every prior chosen word's REAL scored pattern.
      const chosen       = new Array(lastRow + 1).fill(null);
      const alts         = new Array(lastRow + 1).fill(null).map(() => []);
      const realPatterns = new Array(lastRow + 1).fill(null);

      const row0RealPattern = computePattern(forcedStart, target);
      chosen[0]       = forcedStart;
      alts[0]         = [forcedStart];
      realPatterns[0] = row0RealPattern;

      for (let r = 1; r <= lastRow; r++) {
        const isWin = r === winRow;
        if (isWin) {
          chosen[r]       = target;
          alts[r]         = [target];
          realPatterns[r] = ['green','green','green','green','green'];
          continue;
        }
        // Cumulative hard-mode constraints from all prior real scored patterns
        const priorGuesses = [];
        for (let p = 0; p < r; p++) {
          if (chosen[p] && realPatterns[p]) {
            priorGuesses.push({ word: chosen[p], pattern: realPatterns[p] });
          }
        }
        const constraints = buildHardModeConstraints(priorGuesses);
        // The user has painted grid[r] to show what pattern they observed in the real game.
        // We find words that: (a) produce that exact painted pattern against target,
        // AND (b) satisfy all accumulated hard-mode constraints.
        let matches = findWordsForPatternHard(grid[r], target, words, constraints, altLimit);
        if (matches.length === 0) {
          matches = findWordsForPattern(grid[r], target, words, altLimit);
        }
        const picked = matches.length
          ? (useRandom ? matches[Math.floor(Math.random() * matches.length)] : matches[0])
          : null;
        chosen[r]       = picked;
        alts[r]         = matches;
        realPatterns[r] = picked ? computePattern(picked, target) : null;
      }

      for (let r = 0; r <= lastRow; r++) {
        const isWin  = r === winRow;
        const word   = chosen[r];
        // Show row 0 with its real computed pattern, not the user-painted one
        const displayPattern = r === 0 ? row0RealPattern : grid[r];
        if (word) {
          found.push({ row: r + 1, word, pattern: displayPattern, isWin, alternatives: alts[r], forcedRowMismatch: false });
        } else {
          found.push({ row: r + 1, word: null, pattern: displayPattern, isWin: false, alternatives: [], forcedRowMismatch: false });
          allFound = false;
        }
      }

    } else if (useReverse && lastRow > 0) {
      // ── REVERSE mode: last→first, each row must allow next row as hard-mode follow-up ──
      const chosen = new Array(lastRow + 1).fill(null);
      const alts   = new Array(lastRow + 1).fill(null).map(() => []);

      chosen[lastRow] = winRow !== -1 ? target : null;
      alts[lastRow]   = winRow !== -1 ? [target] : [];

      for (let r = lastRow - 1; r >= 0; r--) {
        const nextWord = chosen[r + 1];
        let matches;
        if (!nextWord) {
          matches = findWordsForPattern(grid[r], target, words, altLimit);
        } else {
          matches = findWordsForPatternReverse(grid[r], target, words, nextWord, altLimit);
          if (matches.length === 0) matches = findWordsForPattern(grid[r], target, words, altLimit);
        }
        chosen[r] = matches.length
          ? (useRandom ? matches[Math.floor(Math.random() * matches.length)] : matches[0])
          : null;
        alts[r] = matches;
      }

      for (let r = 0; r <= lastRow; r++) {
        const isWin = r === winRow;
        const word  = isWin ? target : chosen[r];
        if (word) {
          found.push({ row: r + 1, word, pattern: grid[r], isWin, alternatives: alts[r], forcedRowMismatch: false });
        } else {
          found.push({ row: r + 1, word: null, pattern: grid[r], isWin: false, alternatives: [], forcedRowMismatch: false });
          allFound = false;
        }
      }

    } else {
      // ── NORMAL (forward, unconstrained) mode ────────────────────────────────
      for (let r = 0; r <= lastRow; r++) {
        const isWin   = r === winRow;
        const matches = isWin ? [target] : findWordsForPattern(grid[r], target, words, altLimit);
        const word    = matches.length
          ? (useRandom ? matches[Math.floor(Math.random() * matches.length)] : matches[0])
          : null;
        if (word) {
          found.push({ row: r + 1, word, pattern: grid[r], isWin, alternatives: matches, forcedRowMismatch: false });
        } else {
          found.push({ row: r + 1, word: null, pattern: grid[r], isWin: false, alternatives: [], forcedRowMismatch: false });
          allFound = false;
        }
      }
    }

    // Render results
    elResults.innerHTML = '';
    const statusEl = document.createElement('div');
    statusEl.className = allFound ? 'status-msg success' : 'status-msg error';
    statusEl.textContent = allFound
      ? `✓ All ${found.length} row${found.length !== 1 ? 's' : ''} matched.`
      : '⚠ Some rows could not be matched — see below.';
    elResults.appendChild(statusEl);

    found.forEach(({ row, word, pattern, isWin, alternatives, forcedRowMismatch }) => {
      const div = document.createElement('div');
      div.className = 'result-row';
      if (isWin) div.classList.add('win');
      if (forcedRowMismatch) div.classList.add('mismatch');

      const header = document.createElement('div');
      header.className = 'result-row-header';

      const wLabel = document.createElement('div');
      wLabel.className = 'result-word' + (isWin ? ' win' : !word ? ' notfound' : '');
      const forceTag = (forcedStart && row === 1) ? ' 🔒' : '';
      wLabel.textContent = word ? `${row}. ${word}${isWin ? ' ✓' : ''}${forceTag}` : `${row}. ?`;

      const status = document.createElement('div');
      status.className = 'row-status ' + (word ? 'found' : 'notfound');
      status.textContent = forcedRowMismatch ? '⚠ mismatch' : word ? (isWin ? 'WIN' : '✓ found') : '✗ none';
      if (forcedRowMismatch) status.style.color = '#f87';

      header.appendChild(wLabel);
      header.appendChild(status);
      div.appendChild(header);

      const tilesDiv = document.createElement('div');
      tilesDiv.className = 'result-tiles';
      pattern.forEach((color, i) => {
        const mt = document.createElement('div');
        mt.className = `mini-tile color-${color}`;
        mt.textContent = word ? word[i] : '?';
        tilesDiv.appendChild(mt);
      });
      div.appendChild(tilesDiv);

      if (forcedRowMismatch) {
        const mismatchEl = document.createElement('div');
        mismatchEl.className = 'result-note';
        mismatchEl.textContent = `⚠ "${forcedStart}" doesn't match this row's painted pattern against the target`;
        div.appendChild(mismatchEl);
      } else if (!word) {
        const noteEl = document.createElement('div');
        noteEl.className = 'result-note';
        noteEl.textContent = 'No valid word found for this pattern';
        div.appendChild(noteEl);
      } else if (alternatives.length) {
        const altsDiv = document.createElement('div');
        altsDiv.className = 'result-alts';
        alternatives.forEach(alt => {
          const w = document.createElement('div');
          w.className = 'result-alt-word';
          w.textContent = alt;
          altsDiv.appendChild(w);
        });
        div.appendChild(altsDiv);
      }

      elResults.appendChild(div);
    });

    // Play order panel
    elSequence.innerHTML = '';
    if (allFound) {
      found.forEach(({ word }) => {
        const w = document.createElement('div');
        w.className = 'result-sequence-word';
        w.textContent = word;
        elSequence.appendChild(w);
      });
    } else {
      elSequence.innerHTML = '<div class="status-msg info">Fix unmatched rows to see play order</div>';
    }
  }, 50);
}

// ─── Session persistence ──────────────────────────────────────────────────────
const SESSION_KEY = 'wordle-designer-session';

let _saveTimer = null;
function saveSession() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ grid, target: elTargetInput.value }));
    } catch {}
  }, 400);
}

function restoreSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s) return;
    if (Array.isArray(s.grid) && s.grid.length === 6) grid = snapshotGrid(s.grid);
    if (s.target) elTargetInput.value = s.target;
  } catch {}
}

// ─── Presets ─────────────────────────────────────────────────────────────────
const PRESETS_KEY = 'wordle-designer-presets';

function loadPresetsFromStorage() {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY)) || {}; }
  catch { return {}; }
}

function savePreset() {
  const name = elPresetNameInput.value.trim();
  if (!name) { elPresetNameInput.focus(); return; }
  const presets = loadPresetsFromStorage();
  if (presets[name] && !confirm(`Overwrite preset "${name}"?`)) return;
  presets[name] = snapshotGrid();
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  renderPresets();
}

function loadPreset(name) {
  const presets = loadPresetsFromStorage();
  if (!presets[name]) return;
  pushHistory();
  grid = snapshotGrid(presets[name]);
  renderGrid();
}

function deletePreset(name) {
  if (!confirm(`Delete preset "${name}"?`)) return;
  const presets = loadPresetsFromStorage();
  delete presets[name];
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  renderPresets();
}

const COLOR_HEX = { white: '#ffffff', yellow: '#c9b458', green: '#6aaa64' };

function renderPresets() {
  const presets = loadPresetsFromStorage();
  elPresetList.innerHTML = '';
  Object.keys(presets).forEach(name => {
    const item = document.createElement('div');
    item.className = 'preset-list-item';

    const miniGrid = document.createElement('div');
    miniGrid.className = 'preset-mini-grid';
    presets[name].forEach(row => {
      row.forEach(color => {
        const cell = document.createElement('div');
        cell.className = 'preset-mini-cell';
        cell.style.background = COLOR_HEX[color];
        miniGrid.appendChild(cell);
      });
    });

    const nameEl = document.createElement('div');
    nameEl.className = 'preset-name';
    nameEl.textContent = name;
    nameEl.title = name;

    const loadBtn = document.createElement('button');
    loadBtn.className = 'preset-btn load';
    loadBtn.textContent = 'Load';
    loadBtn.onclick = () => loadPreset(name);

    const delBtn = document.createElement('button');
    delBtn.className = 'preset-btn del';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete preset';
    delBtn.onclick = () => deletePreset(name);

    item.appendChild(miniGrid);
    item.appendChild(nameEl);
    item.appendChild(loadBtn);
    item.appendChild(delBtn);
    elPresetList.appendChild(item);
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────
elGrid            = document.getElementById('grid');
elWinRowNote      = document.getElementById('win-row-note');
elUndoBtn         = document.getElementById('undo-btn');
elRedoBtn         = document.getElementById('redo-btn');
elResults         = document.getElementById('results');
elSequence        = document.getElementById('sequence');
elTargetValid     = document.getElementById('target-valid');
elTargetInput     = document.getElementById('target-input');
elPresetList      = document.getElementById('preset-list');
elPresetNameInput = document.getElementById('preset-name-input');
elStartInput      = document.getElementById('start-input');
elStartValid      = document.getElementById('start-valid');

initGrid();
restoreSession();
renderGrid();
setBrush('green');
renderPresets();
document.getElementById('random-toggle').addEventListener('change', function() { useRandom = this.checked; });
document.getElementById('reverse-toggle').addEventListener('change', function() { useReverse = this.checked; });

// Forced start word toggle
document.getElementById('start-toggle').addEventListener('change', function() {
  const box = document.getElementById('start-word-box');
  box.style.display = this.checked ? 'block' : 'none';
  if (!this.checked) {
    elStartInput.value = '';
    elStartValid.textContent = '';
    forcedStart = '';
    renderGrid();
  } else {
    elStartInput.focus();
  }
});

// Forced start word input
elStartInput.addEventListener('input', function() {
  const val = this.value.toUpperCase().replace(/[^A-Z]/g, '');
  this.value = val;
  forcedStart = val.length === 5 ? val : '';
  if (val.length === 0) {
    elStartValid.textContent = '';
  } else if (val.length < 5) {
    elStartValid.style.color = '#f87';
    elStartValid.textContent = `${5 - val.length} more letter${5 - val.length !== 1 ? 's' : ''} needed`;
  } else {
    if (BASE_WORDS_SET.has(val)) {
      elStartValid.style.color = '#6aaa64';
      elStartValid.textContent = '✓ Valid word';
      renderGrid();
    } else {
      elStartValid.style.color = '#f87';
      elStartValid.textContent = '⚠ Not in word list';
      forcedStart = '';
      renderGrid();
    }
  }
});
const elAltLimit = document.getElementById('alt-limit');
elAltLimit.addEventListener('change', function() { altLimit = Math.max(1, +this.value || 1); this.value = altLimit; });
document.getElementById('alt-unlimited').addEventListener('change', function() {
  altLimit = this.checked ? Infinity : (+elAltLimit.value || 20);
  elAltLimit.disabled = this.checked;
});

const dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
document.getElementById('wordle-today-link').href = `https://www.google.com/search?q=wordle+answer+${encodeURIComponent(dateLabel)}`;

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.target.tagName !== 'INPUT') {
    switch (e.key) {
      case '1': case 'q': case 'Q': setBrush('white');  break;
      case '2': case 'w': case 'W': setBrush('yellow'); break;
      case '3': case 'e': case 'E': setBrush('green');  break;
    }
  }
});

// Validate target input live
elTargetInput.addEventListener('input', function() {
  const val = this.value.toUpperCase().replace(/[^A-Z]/g, '');
  this.value = val;
  if (val.length > 0 && val.length < 5) {
    const rem = 5 - val.length;
    elTargetValid.style.color = '#f87';
    elTargetValid.textContent = `${rem} more letter${rem !== 1 ? 's' : ''} needed`;
  } else if (val.length === 5) {
    elTargetValid.style.color = '#6aaa64';
    elTargetValid.textContent = '✓ Valid length';
    if (forcedStart) renderGrid(); // update forced row 0 pattern
  } else {
    elTargetValid.textContent = '';
  }
  saveSession();
});

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
let elGrid, elWinRowNote, elUndoBtn, elRedoBtn, elResults, elSequence,
    elTargetValid, elTargetInput, elPresetList, elPresetNameInput;

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
let grid = [];

// Per-row locked words: lockedWords[r] = 'CRANE' or '' if unlocked
// lockedValid[r] = true/false/null (null = empty)
const lockedWords = ['','','','','',''];
const lockedValid = [null,null,null,null,null,null]; // null=empty, true=valid+consistent, false=invalid

function initGrid() {
  grid = Array.from({length: 6}, () => ['white','white','white','white','white']);
}

function findWinRow() {
  for (let r = 0; r < 6; r++) {
    const row = grid[r];
    if (row.every(c => c === 'green')) return r;
  }
  return -1;
}

// ─── Wordle Logic ────────────────────────────────────────────────────────────
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

function computePattern(guess, target) {
  const pattern    = ['white','white','white','white','white'];
  const targetUsed = [false,false,false,false,false];
  const guessUsed  = [false,false,false,false,false];
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) { pattern[i] = 'green'; targetUsed[i] = guessUsed[i] = true; }
  }
  for (let i = 0; i < 5; i++) {
    if (guessUsed[i]) continue;
    for (let j = 0; j < 5; j++) {
      if (targetUsed[j]) continue;
      if (guess[i] === target[j]) { pattern[i] = 'yellow'; targetUsed[j] = true; break; }
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

// ─── Hard-mode constraint helpers ────────────────────────────────────────────
// Build cumulative constraints from a list of {word, pattern} pairs.
// Uses REAL computed patterns (not painted grid).
function buildHardModeConstraints(priorGuesses) {
  const greenAt     = {};
  const mustContain = new Set();
  const mustExclude = new Set();
  for (const { word, pattern } of priorGuesses) {
    const hasHit = new Set();
    for (let i = 0; i < 5; i++) {
      if (pattern[i] === 'green' || pattern[i] === 'yellow') hasHit.add(word[i]);
    }
    for (let i = 0; i < 5; i++) {
      if (pattern[i] === 'green') {
        greenAt[i] = word[i];
      } else if (pattern[i] === 'yellow') {
        mustContain.add(word[i]);
      } else if (!hasHit.has(word[i])) {
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
function isHardModeLegal(word, pattern, nextWord) {
  for (let i = 0; i < 5; i++) {
    if (pattern[i] === 'green' && nextWord[i] !== word[i]) return false;
  }
  for (let i = 0; i < 5; i++) {
    if (pattern[i] === 'yellow' && !nextWord.includes(word[i])) return false;
  }
  return true;
}

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

// ─── Bidirectional lock validation ──────────────────────────────────────────
// Check if a word at row `r` is consistent with all other locked rows.
// Returns array of error strings (empty = valid).
function checkLockConsistency(r, word, target) {
  if (!target || target.length !== 5) return [];
  const errors = [];
  const myPattern = computePattern(word, target);

  // Forward check: all locked rows BEFORE r must allow `word` as a hard-mode continuation
  const priorLocked = [];
  for (let p = 0; p < r; p++) {
    if (lockedWords[p] && lockedValid[p] === true) {
      priorLocked.push({ word: lockedWords[p], pattern: computePattern(lockedWords[p], target) });
    }
  }
  if (priorLocked.length > 0) {
    const constraints = buildHardModeConstraints(priorLocked);
    if (!satisfiesHardMode(word, constraints)) {
      errors.push('violates hard mode rules from earlier locked rows');
    }
  }

  // Reverse check: all locked rows AFTER r must be valid hard-mode continuations from `word`
  for (let q = r + 1; q < 6; q++) {
    if (lockedWords[q] && lockedValid[q] === true) {
      if (!isHardModeLegal(word, myPattern, lockedWords[q])) {
        errors.push(`row ${q+1} lock (${lockedWords[q]}) couldn't follow this word in hard mode`);
      }
      // Also check that lockedWords[q] satisfies forward constraints including myPattern
      const forwardGuesses = [...priorLocked, { word, pattern: myPattern }];
      const fwdConstraints = buildHardModeConstraints(forwardGuesses);
      if (!satisfiesHardMode(lockedWords[q], fwdConstraints)) {
        errors.push(`row ${q+1} lock (${lockedWords[q]}) violates hard mode constraints including this word`);
      }
    }
  }

  return errors;
}

// Revalidate all locked rows against each other and update their status indicators
function revalidateAllLocks() {
  const target = elTargetInput ? elTargetInput.value : '';
  for (let r = 0; r < 6; r++) {
    const word = lockedWords[r];
    const inp  = document.getElementById(`lock-input-${r}`);
    const msg  = document.getElementById(`lock-msg-${r}`);
    if (!inp || !msg) continue;
    if (!word) {
      lockedValid[r] = null;
      msg.textContent = '';
      inp.style.borderColor = '';
      continue;
    }
    if (word.length < 5) {
      lockedValid[r] = false;
      continue; // partial — already handled in input listener
    }
    if (!BASE_WORDS_SET.has(word) && word !== target) {
      lockedValid[r] = false;
      msg.textContent = '⚠ not in word list';
      msg.style.color = '#f87';
      inp.style.borderColor = '#f87';
      continue;
    }
    if (!target || target.length !== 5) {
      lockedValid[r] = true; // can't check without target
      msg.textContent = '✓';
      msg.style.color = '#6aaa64';
      inp.style.borderColor = '#6aaa64';
      continue;
    }
    const errs = checkLockConsistency(r, word, target);
    if (errs.length === 0) {
      lockedValid[r] = true;
      msg.textContent = '✓';
      msg.style.color = '#6aaa64';
      inp.style.borderColor = '#6aaa64';
    } else {
      lockedValid[r] = false;
      msg.textContent = '⚠ ' + errs[0];
      msg.style.color = '#f87';
      inp.style.borderColor = '#f87';
    }
  }
}

// ─── Render Grid ────────────────────────────────────────────────────────────
function renderGrid() {
  elGrid.innerHTML = '';
  const winRow = findWinRow();
  const target = elTargetInput ? elTargetInput.value : '';

  for (let r = 0; r < 6; r++) {
    const isWin      = winRow === r;
    const isAfterWin = winRow !== -1 && r > winRow;
    const locked     = lockedWords[r].length === 5 && lockedValid[r] === true;
    const lockedPattern = (locked && target.length === 5)
      ? computePattern(lockedWords[r], target) : null;

    const rowDiv = document.createElement('div');
    rowDiv.className = 'grid-row';
    if (isAfterWin) rowDiv.classList.add('after-win');
    if (locked) rowDiv.classList.add('locked-row');

    // Row number label
    const lbl = document.createElement('div');
    lbl.className = 'row-label' + (isWin ? ' win' : '') + (locked ? ' locked' : '');
    lbl.textContent = r + 1;
    rowDiv.appendChild(lbl);

    // Tiles
    for (let c = 0; c < 5; c++) {
      const tile = document.createElement('div');
      let color;
      if (isAfterWin)           color = 'absent';
      else if (lockedPattern)   color = lockedPattern[c];
      else                      color = grid[r][c];

      tile.className = `tile color-${color}`;
      tile.dataset.r = r;
      tile.dataset.c = c;

      if (isAfterWin || locked) {
        tile.classList.add('tile-locked');
        tile.title = locked ? `Locked to "${lockedWords[r]}"` : 'After win row';
      } else {
        tile.addEventListener('click', onTileClick);
        tile.addEventListener('mouseenter', onTileEnter);
      }
      rowDiv.appendChild(tile);
    }

    // Lock input area (to the right of tiles)
    const lockArea = document.createElement('div');
    lockArea.className = 'lock-area';

    const lockInp = document.createElement('input');
    lockInp.type = 'text';
    lockInp.id = `lock-input-${r}`;
    lockInp.className = 'lock-input';
    lockInp.maxLength = 5;
    lockInp.placeholder = 'lock…';
    lockInp.value = lockedWords[r];
    lockInp.title = 'Lock this row to a specific word (enforces hard mode)';
    if (isAfterWin) { lockInp.disabled = true; lockInp.style.opacity = '0.25'; }

    lockInp.addEventListener('input', function() {
      const val = this.value.toUpperCase().replace(/[^A-Z]/g, '');
      this.value = val;
      lockedWords[r] = val;

      const msg = document.getElementById(`lock-msg-${r}`);
      if (val.length === 0) {
        lockedValid[r] = null;
        msg.textContent = '';
        this.style.borderColor = '';
        renderGrid(); // re-render to unlock tiles
        revalidateAllLocks();
      } else if (val.length < 5) {
        lockedValid[r] = false;
        msg.textContent = `${5 - val.length} more`;
        msg.style.color = '#888';
        this.style.borderColor = '#555';
      } else {
        // 5 letters — validate
        const tgt = elTargetInput.value;
        if (!BASE_WORDS_SET.has(val) && val !== tgt) {
          lockedValid[r] = false;
          msg.textContent = '⚠ not in list';
          msg.style.color = '#f87';
          this.style.borderColor = '#f87';
        } else {
          lockedValid[r] = true; // tentative, revalidate will correct
          revalidateAllLocks();
          renderGrid();
        }
      }
    });

    const lockMsg = document.createElement('div');
    lockMsg.id = `lock-msg-${r}`;
    lockMsg.className = 'lock-msg';

    lockArea.appendChild(lockInp);
    lockArea.appendChild(lockMsg);
    rowDiv.appendChild(lockArea);

    elGrid.appendChild(rowDiv);
  }

  // Restore validation messages after re-render
  revalidateAllLocks();

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
  const r = +e.currentTarget.dataset.r;
  if (lockedWords[r].length === 5 && lockedValid[r] === true) return;
  pushHistory();
  grid[r][+e.currentTarget.dataset.c] = currentBrush;
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
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 5; c++) {
      if (grid[r][c] === a) grid[r][c] = b;
      else if (grid[r][c] === b) grid[r][c] = a;
    }
  renderGrid();
}

function flipGrid(direction) {
  pushHistory();
  if (direction === 'horizontal') for (let r = 0; r < 6; r++) grid[r].reverse();
  else grid.reverse();
  renderGrid();
}

// ─── Generate ────────────────────────────────────────────────────────────────
let useRandom  = true;
let altLimit   = Infinity;
let useReverse = false;

function generateWords() {
  const target = elTargetInput.value;
  if (target.length !== 5) {
    elTargetValid.textContent = '⚠ Target must be exactly 5 letters';
    return;
  }
  elTargetValid.textContent = '';

  const winRow  = findWinRow();
  const lastRow = winRow === -1 ? 5 : winRow;

  elResults.innerHTML = `<div class="status-msg info"><span class="spinner"></span> Finding words…</div>`;

  setTimeout(() => {
    const words    = getWordList(target);
    const found    = [];
    let   allFound = true;

    // chosen[r] = final word for row r; realPatterns[r] = computePattern of chosen[r] vs target
    const chosen       = new Array(lastRow + 1).fill(null);
    const alts         = new Array(lastRow + 1).fill(null).map(() => []);
    const realPatterns = new Array(lastRow + 1).fill(null);

    // Seed locked rows first
    for (let r = 0; r <= lastRow; r++) {
      if (r === winRow) {
        chosen[r]       = target;
        alts[r]         = [target];
        realPatterns[r] = ['green','green','green','green','green'];
      } else if (lockedWords[r] && lockedValid[r] === true) {
        chosen[r]       = lockedWords[r];
        alts[r]         = [lockedWords[r]];
        realPatterns[r] = computePattern(lockedWords[r], target);
      }
    }

    const anyLocked = chosen.some(w => w !== null);

    if (anyLocked || !useReverse) {
      // ── FORWARD mode (with or without locked rows) ───────────────────────────
      // Walk forward; for each unlocked row build cumulative constraints from
      // all prior rows (locked or already chosen).
      for (let r = 0; r <= lastRow; r++) {
        if (chosen[r] !== null) continue; // already seeded
        const priorGuesses = [];
        for (let p = 0; p < r; p++) {
          if (chosen[p] && realPatterns[p]) {
            priorGuesses.push({ word: chosen[p], pattern: realPatterns[p] });
          }
        }
        let matches;
        if (priorGuesses.length > 0) {
          const constraints = buildHardModeConstraints(priorGuesses);
          matches = findWordsForPatternHard(grid[r], target, words, constraints, altLimit);
          if (matches.length === 0) matches = findWordsForPattern(grid[r], target, words, altLimit);
        } else {
          matches = findWordsForPattern(grid[r], target, words, altLimit);
        }

        // Also apply reverse constraint if next row is locked
        let nextLocked = null;
        for (let q = r + 1; q <= lastRow; q++) {
          if (chosen[q]) { nextLocked = chosen[q]; break; }
        }
        if (nextLocked && matches.length > 0) {
          const revFiltered = matches.filter(w => isHardModeLegal(w, computePattern(w, target), nextLocked));
          if (revFiltered.length > 0) matches = revFiltered;
        }

        const picked = matches.length
          ? (useRandom ? matches[Math.floor(Math.random() * matches.length)] : matches[0])
          : null;
        chosen[r]       = picked;
        alts[r]         = matches;
        realPatterns[r] = picked ? computePattern(picked, target) : null;
      }

    } else {
      // ── REVERSE mode (no locked rows) ────────────────────────────────────────
      for (let r = lastRow - 1; r >= 0; r--) {
        if (chosen[r] !== null) continue;
        const nextWord = chosen[r + 1];
        let matches;
        if (!nextWord) {
          matches = findWordsForPattern(grid[r], target, words, altLimit);
        } else {
          matches = findWordsForPatternReverse(grid[r], target, words, nextWord, altLimit);
          if (matches.length === 0) matches = findWordsForPattern(grid[r], target, words, altLimit);
        }
        const picked = matches.length
          ? (useRandom ? matches[Math.floor(Math.random() * matches.length)] : matches[0])
          : null;
        chosen[r]       = picked;
        alts[r]         = matches;
        realPatterns[r] = picked ? computePattern(picked, target) : null;
      }
    }

    // Build results display
    for (let r = 0; r <= lastRow; r++) {
      const isWin    = r === winRow;
      const word     = chosen[r];
      const isLocked = !!(lockedWords[r] && lockedValid[r] === true);
      // Display pattern: for locked rows use real computed pattern; otherwise use painted grid
      const displayPattern = (isLocked || isWin) ? realPatterns[r] : grid[r];
      if (word) {
        found.push({ row: r + 1, word, pattern: displayPattern, isWin, isLocked, alternatives: alts[r] });
      } else {
        found.push({ row: r + 1, word: null, pattern: displayPattern, isWin: false, isLocked, alternatives: [] });
        allFound = false;
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

    found.forEach(({ row, word, pattern, isWin, isLocked, alternatives }) => {
      const div = document.createElement('div');
      div.className = 'result-row' + (isWin ? ' win' : '') + (isLocked ? ' locked-result' : '');

      const header = document.createElement('div');
      header.className = 'result-row-header';

      const wLabel = document.createElement('div');
      wLabel.className = 'result-word' + (isWin ? ' win' : !word ? ' notfound' : '');
      const tag = isLocked ? ' 🔒' : isWin ? ' ✓' : '';
      wLabel.textContent = word ? `${row}. ${word}${tag}` : `${row}. ?`;

      const status = document.createElement('div');
      status.className = 'row-status ' + (word ? 'found' : 'notfound');
      status.textContent = word ? (isWin ? 'WIN' : isLocked ? 'LOCKED' : '✓ found') : '✗ none';

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

      if (!word) {
        const noteEl = document.createElement('div');
        noteEl.className = 'result-note';
        noteEl.textContent = 'No valid word found for this pattern';
        div.appendChild(noteEl);
      } else if (!isLocked && alternatives.length > 1) {
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
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY)) || {}; } catch { return {}; }
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
        cell.style.background = COLOR_HEX[color] || '#3a3a3c';
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

initGrid();
restoreSession();
renderGrid();
setBrush('green');
renderPresets();

document.getElementById('random-toggle').addEventListener('change', function() { useRandom = this.checked; });
document.getElementById('reverse-toggle').addEventListener('change', function() { useReverse = this.checked; });

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
    e.preventDefault(); undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault(); redo();
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.target.tagName !== 'INPUT') {
    switch (e.key) {
      case '1': case 'q': case 'Q': setBrush('white');  break;
      case '2': case 'w': case 'W': setBrush('yellow'); break;
      case '3': case 'e': case 'E': setBrush('green');  break;
    }
  }
});

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
    revalidateAllLocks();
    renderGrid();
  } else {
    elTargetValid.textContent = '';
  }
  saveSession();
});

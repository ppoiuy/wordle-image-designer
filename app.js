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
let elGrid, elWinRowNote, elUndoBtn, elRedoBtn, elResults, elTargetValid, elTargetInput, elPresetList, elPresetNameInput;

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

  for (let r = 0; r < 6; r++) {
    const isWin = winRow === r;
    const isAfterWin = winRow !== -1 && r > winRow;

    const rowDiv = document.createElement('div');
    rowDiv.className = 'grid-row';
    if (isAfterWin) rowDiv.classList.add('after-win');

    const lbl = document.createElement('div');
    lbl.className = 'row-label';
    lbl.textContent = r + 1;
    if (isWin) lbl.classList.add('win');
    rowDiv.appendChild(lbl);

    for (let c = 0; c < 5; c++) {
      const tile = document.createElement('div');
      const color = isAfterWin ? 'absent' : grid[r][c];
      tile.className = `tile color-${color}`;
      tile.dataset.r = r;
      tile.dataset.c = c;

      if (isAfterWin) {
        tile.title = 'This row is after the winning guess — unused';
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

// Find a word that scores the desired pattern against target
function findWordForPattern(desiredPattern, target, words) {
  for (const w of words) {
    let ok = true;
    for (let i = 0; i < 5; i++) {
      if ((desiredPattern[i] === 'green') !== (w[i] === target[i])) { ok = false; break; }
    }
    if (ok && matchesPattern(w, target, desiredPattern)) return w;
  }
  return null;
}

// ─── Generate ────────────────────────────────────────────────────────────────
function generateWords() {
  const target = elTargetInput.value;

  if (target.length !== 5) {
    elTargetValid.textContent = '⚠ Target must be exactly 5 letters';
    return;
  }
  elTargetValid.textContent = '';

  const winRow = findWinRow();

  elResults.innerHTML = `<div class="status-msg info"><span class="spinner"></span> Finding words…</div>`;

  setTimeout(() => {
    const words = getWordList(target);
    const found = [];
    let allFound = true;

    const lastRow = winRow === -1 ? 5 : winRow;

    for (let r = 0; r <= lastRow; r++) {
      const desired = grid[r];
      const isWin = r === winRow;
      const word = isWin ? target : findWordForPattern(desired, target, words);

      if (word) {
        found.push({ row: r + 1, word, pattern: desired, isWin });
      } else {
        found.push({ row: r + 1, word: null, pattern: desired, isWin: false });
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

    found.forEach(({ row, word, pattern, isWin }) => {
      const div = document.createElement('div');
      div.className = 'result-row';
      if (isWin) div.classList.add('win');

      const header = document.createElement('div');
      header.className = 'result-row-header';

      const wLabel = document.createElement('div');
      wLabel.className = 'result-word' + (isWin ? ' win' : !word ? ' notfound' : '');
      wLabel.textContent = word ? `${row}. ${word}${isWin ? ' ✓' : ''}` : `${row}. ?`;

      const status = document.createElement('div');
      status.className = 'row-status ' + (word ? 'found' : 'notfound');
      status.textContent = word ? (isWin ? 'WIN' : '✓ found') : '✗ none';

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
      }

      elResults.appendChild(div);
    });

    // Summary sequence
    if (allFound) {
      const seqDiv = document.createElement('div');
      seqDiv.className = 'result-sequence';
      const seqLabel = document.createElement('div');
      seqLabel.className = 'result-sequence-label';
      seqLabel.textContent = '▶ Play in order:';
      seqDiv.appendChild(seqLabel);
      found.forEach(({ word }) => {
        const w = document.createElement('div');
        w.className = 'result-sequence-word';
        w.textContent = word;
        seqDiv.appendChild(w);
      });
      elResults.appendChild(seqDiv);
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
elTargetValid     = document.getElementById('target-valid');
elTargetInput     = document.getElementById('target-input');
elPresetList      = document.getElementById('preset-list');
elPresetNameInput = document.getElementById('preset-name-input');

initGrid();
restoreSession();
renderGrid();
setBrush('green');
renderPresets();

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
  } else {
    elTargetValid.textContent = '';
  }
  saveSession();
});

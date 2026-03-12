// === Screen Annotation Tool - Core Drawing Engine ===

const { invoke } = window.__TAURI__ ? window.__TAURI__.core : { invoke: async () => null };

// --- Custom Cursors ---
function buildPencilCursor(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.5-4.5L17 4a2 2 0 0 1 3 3L7.5 19.5Z"/><path d="M15 6l3 3"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 22, crosshair`;
}

const laserCursor = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="#FF3B30" opacity="0.9"/><circle cx="8" cy="8" r="2" fill="white" opacity="0.7"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 8, crosshair`;
})();

// --- State Management ---
const state = {
  currentTool: 'pen',
  currentColor: '#FF3B30',
  lineWidth: 3,
  isDrawing: false,
  startX: 0,
  startY: 0,
  // Operation history (for undo)
  history: [],
  redoStack: [],
};

// --- Canvas Initialization ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resetDrawState() {
  ctx.filter = 'none';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalCompositeOperation = 'source-over';
}

function beginStroke(color, width, alpha = 1) {
  ctx.save();
  resetDrawState();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
}

function beginFill(color, alpha = 1) {
  ctx.save();
  resetDrawState();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
}

function paintSoftDisk(x, y, radius) {
  const r = Math.max(0.5, radius);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  redrawAll();
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
resetDrawState();

function updateCursor() {
  if (state.currentTool === 'text') {
    canvas.style.cursor = 'text';
  } else if (state.currentTool === 'laser') {
    canvas.style.cursor = laserCursor;
  } else {
    canvas.style.cursor = buildPencilCursor(state.currentColor);
  }
}
updateCursor();

// --- Save/Restore Canvas Snapshot ---
function saveSnapshot() {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  state.history.push(data);
  state.redoStack = [];
  // Keep up to 50 steps
  if (state.history.length > 50) state.history.shift();
}

function undo() {
  if (state.history.length === 0) return;
  const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  state.redoStack.push(current);
  const prev = state.history.pop();
  ctx.putImageData(prev, 0, 0);
}

function redo() {
  if (state.redoStack.length === 0) return;
  const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  state.history.push(current);
  const next = state.redoStack.pop();
  ctx.putImageData(next, 0, 0);
}

function clearCanvas() {
  resetDrawState();
  ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));
  state.history = [];
  state.redoStack = [];
  penPoints = [];
  laserTrail = [];
  previewSnapshot = null;
}

function redrawAll() {
  // Preserve content on window resize (simplified)
}

// --- Drawing Tool Implementation ---

// High precision pen - Collect points
let penPoints = [];

function drawPreciseStroke(from, to, color, width, alpha = 1) {
  if (!from || !to) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const radius = Math.max(width / 2, 0.5);

  beginFill(color, alpha);
  if (distance < 0.01) {
    paintSoftDisk(from.x, from.y, radius);
    ctx.restore();
    return;
  }

  const angle = Math.atan2(dy, dx);
  const nx = Math.sin(angle) * radius;
  const ny = -Math.cos(angle) * radius;

  ctx.beginPath();
  ctx.moveTo(from.x + nx, from.y + ny);
  ctx.lineTo(to.x + nx, to.y + ny);
  ctx.arc(to.x, to.y, radius, angle - Math.PI / 2, angle + Math.PI / 2);
  ctx.lineTo(from.x - nx, from.y - ny);
  ctx.arc(from.x, from.y, radius, angle + Math.PI / 2, angle - Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  paintSoftDisk(to.x, to.y, radius);
  ctx.restore();
}

function drawTapPoint(pos, color, width, alpha = 1) {
  beginFill(color, alpha);
  const radius = Math.max(width / 2, 0.5);
  paintSoftDisk(pos.x, pos.y, radius);
  ctx.restore();
}

function drawArrow(x1, y1, x2, y2, color, width) {
  const headLen = Math.max(width * 4, 12);
  const angle = Math.atan2(y2 - y1, x2 - x1);

  beginStroke(color, width);

  // Line segment
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrow head
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCheck(x, y, size, color, width) {
  beginStroke(color, width);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.5, y);
  ctx.lineTo(x - size * 0.1, y + size * 0.4);
  ctx.lineTo(x + size * 0.5, y - size * 0.4);
  ctx.stroke();
  ctx.restore();
}

function drawRect(x1, y1, x2, y2, color, width) {
  beginStroke(color, width);
  ctx.beginPath();
  ctx.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  ctx.stroke();
  ctx.restore();
}

function drawEllipse(x1, y1, x2, y2, color, width) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;

  beginStroke(color, width);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawLine(x1, y1, x2, y2, color, width) {
  beginStroke(color, width);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

// --- Highlighter Stroke ---
// Draws the full stroke path in one pass with a single alpha layer,
// preventing transparency overlap at segment joints.
function drawHighlightStroke(points, color, width, alpha) {
  if (points.length < 2) return;
  ctx.save();
  resetDrawState();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

// --- Freehand Path (for check preview) ---
function drawFreehandPath(points, color, width) {
  if (points.length < 2) return;
  beginStroke(color, width);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

// --- Point Bounds Helper ---
function getPointsBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

// --- Laser Pointer Effect ---
let laserTrail = [];
let laserAnimFrame = null;

function animateLaser() {
  const now = Date.now();
  laserTrail = laserTrail.filter(p => now - p.t < 800);

  restorePreview();

  if (laserTrail.length > 1) {
    for (let i = 1; i < laserTrail.length; i++) {
      const age = now - laserTrail[i].t;
      if (age > 800) continue;
      const alpha = 1 - age / 800;
      ctx.save();
      ctx.globalAlpha = alpha * 0.8;
      ctx.strokeStyle = '#FF3B30';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#FF3B30';
      ctx.shadowBlur = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(laserTrail[i - 1].x, laserTrail[i - 1].y);
      ctx.lineTo(laserTrail[i].x, laserTrail[i].y);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (laserTrail.length > 0) {
    laserAnimFrame = requestAnimationFrame(animateLaser);
  } else {
    laserAnimFrame = null;
    restorePreview();
  }
}

// --- Temporary Snapshot for Drag Preview ---
let previewSnapshot = null;

function savePreview() {
  previewSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function restorePreview() {
  if (previewSnapshot) {
    ctx.putImageData(previewSnapshot, 0, 0);
  }
}

// --- Mouse Event Handling ---
canvas.addEventListener('mousedown', onMouseDown);
canvas.addEventListener('mousemove', onMouseMove);
canvas.addEventListener('mouseup', onMouseUp);
canvas.addEventListener('mouseleave', onMouseUp);

function getPos(e) {
  return { x: e.clientX, y: e.clientY };
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  const pos = getPos(e);
  state.isDrawing = true;
  state.startX = pos.x;
  state.startY = pos.y;

  const tool = state.currentTool;

  if (tool === 'pen') {
    penPoints = [pos];
    saveSnapshot();
    drawTapPoint(pos, state.currentColor, state.lineWidth, 1);
  } else if (tool === 'marker') {
    penPoints = [pos];
    saveSnapshot();
    savePreview();
  } else if (tool === 'laser') {
    laserTrail = [];
    savePreview();
    laserTrail.push({ ...pos, t: Date.now() });
    if (!laserAnimFrame) laserAnimFrame = requestAnimationFrame(animateLaser);
  } else if (tool === 'text') {
    showTextInput(pos.x, pos.y);
    state.isDrawing = false;
    return;
  } else if (tool === 'check') {
    penPoints = [pos];
    saveSnapshot();
    savePreview();
  } else {
    // Shape tool - save preview snapshot
    saveSnapshot();
    savePreview();
  }
}

function onMouseMove(e) {
  if (!state.isDrawing) return;
  const pos = getPos(e);
  const tool = state.currentTool;

  if (tool === 'pen') {
    const prev = penPoints[penPoints.length - 1];
    penPoints.push(pos);
    drawPreciseStroke(prev, pos, state.currentColor, state.lineWidth, 1);
  } else if (tool === 'marker') {
    penPoints.push(pos);
    // Redraw full highlight stroke each frame for correct transparency blending
    restorePreview();
    drawHighlightStroke(penPoints, state.currentColor, state.lineWidth * 4, 0.35);
  } else if (tool === 'check') {
    penPoints.push(pos);
    // Show freehand preview while drawing
    restorePreview();
    drawFreehandPath(penPoints, state.currentColor, state.lineWidth + 1);
  } else if (tool === 'laser') {
    laserTrail.push({ ...pos, t: Date.now() });
  } else {
    // Shape preview
    restorePreview();
    if (tool === 'arrow') {
      drawArrow(state.startX, state.startY, pos.x, pos.y, state.currentColor, state.lineWidth);
    } else if (tool === 'line') {
      drawLine(state.startX, state.startY, pos.x, pos.y, state.currentColor, state.lineWidth);
    } else if (tool === 'rect') {
      drawRect(state.startX, state.startY, pos.x, pos.y, state.currentColor, state.lineWidth);
    } else if (tool === 'ellipse') {
      drawEllipse(state.startX, state.startY, pos.x, pos.y, state.currentColor, state.lineWidth);
    }
  }
}

function onMouseUp(e) {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  const pos = getPos(e);
  const tool = state.currentTool;

  if (tool === 'pen') {
    penPoints = [];
  } else if (tool === 'marker') {
    // Final highlight stroke is already drawn on canvas
    penPoints = [];
  } else if (tool === 'check') {
    // Auto-correct freehand drawing to a clean checkmark
    if (penPoints.length >= 2) {
      restorePreview();
      const bounds = getPointsBounds(penPoints);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      const size = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 24);
      drawCheck(cx, cy, size, state.currentColor, state.lineWidth + 1);
    }
    penPoints = [];
  } else if (tool === 'laser') {
    // Laser trail fades out via animation loop, nothing to do here
  }

  if (tool !== 'laser') {
    previewSnapshot = null;
  }
}

// --- Text Tool ---
const textInput = document.getElementById('text-input');

function showTextInput(x, y) {
  textInput.style.display = 'block';
  textInput.style.left = x + 'px';
  textInput.style.top = y + 'px';
  textInput.style.color = state.currentColor;
  textInput.value = '';
  // Delay focus to ensure the element is rendered and the panel can accept input
  requestAnimationFrame(() => textInput.focus());
}

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    commitText();
  } else if (e.key === 'Escape') {
    textInput.style.display = 'none';
  }
});

textInput.addEventListener('blur', () => {
  if (textInput.value.trim()) {
    commitText();
  } else {
    textInput.style.display = 'none';
  }
});

function commitText() {
  const text = textInput.value.trim();
  if (!text) {
    textInput.style.display = 'none';
    return;
  }

  saveSnapshot();
  const x = parseInt(textInput.style.left);
  const y = parseInt(textInput.style.top);

  ctx.save();
  ctx.fillStyle = state.currentColor;
  ctx.font = '18px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
  ctx.textBaseline = 'top';

  const lines = text.split('\n');
  lines.forEach((line, i) => {
    ctx.fillText(line, x + 4, y + 4 + i * 24);
  });
  ctx.restore();

  textInput.style.display = 'none';
  textInput.value = '';
}

// --- Toolbar Interaction ---
const sizeSlider = document.getElementById('size-slider');
const sizeValue = document.getElementById('size-value');

function updateLineWidth(width) {
  const normalized = Math.max(1, Math.min(24, width));
  state.lineWidth = normalized;
  sizeSlider.value = String(normalized);
  sizeValue.textContent = `${normalized}px`;
}

updateLineWidth(state.lineWidth);

sizeSlider.addEventListener('input', (e) => {
  e.stopPropagation();
  updateLineWidth(parseInt(e.target.value, 10));
});

sizeSlider.addEventListener('mousedown', (e) => {
  e.stopPropagation();
});

// Color Selection
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentColor = btn.dataset.color;
    updateCursor();
  });
});

// Tool Selection
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentTool = btn.dataset.tool;

    updateCursor();
  });
});

// Undo
document.getElementById('undo-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  undo();
});

// Clear
document.getElementById('clear-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  clearCanvas();
});

const toolbar = document.getElementById('toolbar');
const settingsBtn = document.getElementById('settings-btn');
const inlineShortcutSettings = document.getElementById('inline-shortcut-settings');
const shortcutChip = document.getElementById('shortcut-chip');

let currentToggleShortcut = 'CommandOrControl+Shift+D';
let isRecordingShortcut = false;

function formatShortcutForDisplay(shortcut) {
  return shortcut
    .split('+')
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      if (lower === 'commandorcontrol' || lower === 'command' || lower === 'cmd' || lower === 'super') return '⌘';
      if (lower === 'control' || lower === 'ctrl') return '⌃';
      if (lower === 'shift') return '⇧';
      if (lower === 'alt' || lower === 'option') return '⌥';
      if (lower.startsWith('key') && token.length === 4) return token.slice(3).toUpperCase();
      if (lower.startsWith('digit')) return token.slice(5);
      return token.length === 1 ? token.toUpperCase() : token;
    })
    .join('');
}

function setToolbarShortcutHint(shortcut) {
  toolbar.dataset.shortcutHint = `${formatShortcutForDisplay(shortcut)} Toggle · Esc Exit`;
}

function updateShortcutChip(shortcut = currentToggleShortcut) {
  shortcutChip.textContent = formatShortcutForDisplay(shortcut);
}

function showInlineSettings() {
  inlineShortcutSettings.classList.remove('hidden');
}

function hideInlineSettings() {
  inlineShortcutSettings.classList.add('hidden');
  stopRecordingShortcut(true);
}

function startRecordingShortcut() {
  isRecordingShortcut = true;
  shortcutChip.classList.add('recording');
  shortcutChip.textContent = 'Press keys…';
}

function stopRecordingShortcut(restoreDisplay = true) {
  isRecordingShortcut = false;
  shortcutChip.classList.remove('recording');
  if (restoreDisplay) {
    updateShortcutChip();
  }
}

function keyTokenFromCode(code) {
  if (!code) return null;
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code;
  if (code.startsWith('Numpad')) return code;

  const codeMap = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: '\'',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Space: 'Space',
    Tab: 'Tab',
    Enter: 'Enter',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
  };

  return codeMap[code] || null;
}

function buildShortcutFromKeyEvent(e) {
  const modifierCodes = new Set([
    'MetaLeft', 'MetaRight',
    'ControlLeft', 'ControlRight',
    'ShiftLeft', 'ShiftRight',
    'AltLeft', 'AltRight',
  ]);
  if (modifierCodes.has(e.code)) return null;

  const keyToken = keyTokenFromCode(e.code);
  if (!keyToken) return null;

  const parts = [];
  if (e.metaKey) parts.push('Command');
  if (e.ctrlKey) parts.push('Control');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (parts.length === 0) return null;

  parts.push(keyToken);
  return parts.join('+');
}

async function refreshShortcutFromBackend() {
  try {
    const shortcut = await invoke('get_toggle_shortcut');
    if (shortcut && typeof shortcut === 'string') {
      currentToggleShortcut = shortcut;
    }
  } catch (_) { }

  setToolbarShortcutHint(currentToggleShortcut);
  updateShortcutChip(currentToggleShortcut);
}

async function applyShortcut(shortcut) {
  try {
    const saved = await invoke('set_toggle_shortcut', { shortcut });
    currentToggleShortcut = saved;
    setToolbarShortcutHint(saved);
    updateShortcutChip(saved);
  } catch (_) {
    updateShortcutChip(currentToggleShortcut);
  }
}

settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (inlineShortcutSettings.classList.contains('hidden')) {
    showInlineSettings();
  } else {
    hideInlineSettings();
  }
});

shortcutChip.addEventListener('click', (e) => {
  e.stopPropagation();
  showInlineSettings();
  if (isRecordingShortcut) {
    stopRecordingShortcut(true);
  } else {
    startRecordingShortcut();
  }
});

document.addEventListener('keydown', (e) => {
  if (!isRecordingShortcut) return;

  const shortcut = buildShortcutFromKeyEvent(e);
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    stopRecordingShortcut(true);
    return;
  }

  if (!shortcut) {
    return;
  }

  stopRecordingShortcut(false);
  applyShortcut(shortcut);
}, true);

function openInlineSettings(shortcut, autoRecord = false) {
  if (typeof shortcut === 'string' && shortcut) {
    currentToggleShortcut = shortcut;
  }
  setToolbarShortcutHint(currentToggleShortcut);
  updateShortcutChip(currentToggleShortcut);
  showInlineSettings();
  if (autoRecord) {
    startRecordingShortcut();
  }
}

// --- Keyboard Shortcuts ---
document.addEventListener('keydown', (e) => {
  if (isRecordingShortcut) {
    return;
  }

  // Cmd+Z Undo
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
  // Cmd+Shift+Z Redo
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    redo();
  }
  // Escape - Notify Rust backend to exit
  if (e.key === 'Escape') {
    e.preventDefault();
    clearCanvas();
    try {
      invoke('hide_window');
    } catch (_) { }
  }
});

// Prevent mouse events on toolbar from passing to canvas
document.getElementById('toolbar').addEventListener('mousedown', (e) => {
  e.stopPropagation();
});

refreshShortcutFromBackend();
window.__floatinkOpenInlineSettingsFromRust = (shortcut) => {
  const value = typeof shortcut === 'string' && shortcut ? shortcut : currentToggleShortcut;
  openInlineSettings(value, true);
};

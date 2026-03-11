// === 屏幕标注工具 - 核心绘图引擎 ===

const { invoke } = window.__TAURI__ ? window.__TAURI__.core : { invoke: () => {} };

// --- 状态管理 ---
const state = {
  currentTool: 'pen',
  currentColor: '#FF3B30',
  lineWidth: 3,
  isDrawing: false,
  startX: 0,
  startY: 0,
  // 操作历史（用于撤销）
  history: [],
  redoStack: [],
  // 文字工具状态
  textMode: false,
};

// --- Canvas 初始化 ---
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

// --- 保存/恢复画布快照 ---
function saveSnapshot() {
  const dpr = window.devicePixelRatio || 1;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  state.history.push(data);
  state.redoStack = [];
  // 最多保留 50 步
  if (state.history.length > 50) state.history.shift();
}

function undo() {
  if (state.history.length === 0) return;
  const dpr = window.devicePixelRatio || 1;
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
  // 当窗口大小变化时保持内容（暂简化处理）
}

// --- 绘图工具实现 ---

// 高精度画笔 - 收集点
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

  // 线段
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // 箭头
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

// --- 激光笔效果 ---
let laserTrail = [];
let laserAnimFrame = null;

function animateLaser() {
  const now = Date.now();
  // 清除已经消失的轨迹点
  laserTrail = laserTrail.filter(p => now - p.t < 800);

  if (laserTrail.length > 1) {
    // 需要在上一帧基础上重绘，但这里简单重绘激光效果层
    // 实际上激光笔只在临时层绘制
  }

  if (laserTrail.length > 0 || state.currentTool === 'laser') {
    laserAnimFrame = requestAnimationFrame(animateLaser);
  }
}

// --- 拖拽预览用的临时快照 ---
let previewSnapshot = null;

function savePreview() {
  previewSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function restorePreview() {
  if (previewSnapshot) {
    ctx.putImageData(previewSnapshot, 0, 0);
  }
}

// --- 鼠标事件处理 ---
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

  if (tool === 'pen' || tool === 'marker') {
    penPoints = [pos];
    saveSnapshot();
    const alpha = tool === 'marker' ? 0.35 : 1;
    const width = tool === 'marker' ? state.lineWidth * 4 : state.lineWidth;
    drawTapPoint(pos, state.currentColor, width, alpha);
  } else if (tool === 'laser') {
    laserTrail = [{ ...pos, t: Date.now() }];
    if (!laserAnimFrame) animateLaser();
  } else if (tool === 'text') {
    showTextInput(pos.x, pos.y);
    state.isDrawing = false;
    return;
  } else if (tool === 'check') {
    // 对勾直接画
    saveSnapshot();
    const size = 30;
    drawCheck(pos.x, pos.y, size, state.currentColor, state.lineWidth + 1);
    state.isDrawing = false;
    return;
  } else {
    // 形状工具 - 保存预览快照
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
    const prev = penPoints[penPoints.length - 1];
    penPoints.push(pos);
    drawPreciseStroke(prev, pos, state.currentColor, state.lineWidth * 4, 0.35);
  } else if (tool === 'laser') {
    laserTrail.push({ ...pos, t: Date.now() });
    // 绘制激光笔效果（临时红色发光线条）
    restorePreview();
    if (!previewSnapshot) savePreview();
    const now = Date.now();
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
  } else {
    // 形状预览
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

  if (tool === 'pen' || tool === 'marker') {
    penPoints = [];
  } else if (tool === 'laser') {
    // 激光笔结束后清除轨迹（淡出效果）
    setTimeout(() => {
      if (!state.isDrawing) {
        restorePreview();
        laserTrail = [];
      }
    }, 800);
  }

  previewSnapshot = null;
}

// --- 文字工具 ---
const textInput = document.getElementById('text-input');

function showTextInput(x, y) {
  textInput.style.display = 'block';
  textInput.style.left = x + 'px';
  textInput.style.top = y + 'px';
  textInput.style.color = state.currentColor;
  textInput.value = '';
  textInput.focus();
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

// --- 工具栏交互 ---
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

// 颜色选择
document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentColor = btn.dataset.color;
  });
});

// 工具选择
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentTool = btn.dataset.tool;

    // 更新光标
    if (state.currentTool === 'text') {
      canvas.style.cursor = 'text';
    } else if (state.currentTool === 'laser') {
      canvas.style.cursor = 'none';
    } else {
      canvas.style.cursor = 'crosshair';
    }
  });
});

// 撤销
document.getElementById('undo-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  undo();
});

// 清除
document.getElementById('clear-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  clearCanvas();
});

// --- 键盘快捷键 ---
document.addEventListener('keydown', (e) => {
  // Cmd+Z 撤销
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
  // Cmd+Shift+Z 重做
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    redo();
  }
  // Escape - 通知 Rust 后端退出
  if (e.key === 'Escape') {
    e.preventDefault();
    clearCanvas();
    try {
      invoke('hide_window');
    } catch (_) {}
  }
});

// 阻止工具栏上的鼠标事件传递到画布
document.getElementById('toolbar').addEventListener('mousedown', (e) => {
  e.stopPropagation();
});

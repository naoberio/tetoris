const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const gameOverEl = document.getElementById("game-over");
const restartButton = document.getElementById("restart");
const playerLabel = document.getElementById("player-label");
const bestScoreEl = document.getElementById("best-score");
const topScoresEl = document.getElementById("top-scores");
const finalScoreEl = document.getElementById("final-score");
const titleScreen = document.getElementById("title-screen");
const startForm = document.getElementById("start-form");
const nameInput = document.getElementById("player-name");
const bestPreviewScore = document.getElementById("best-preview-score");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas ? nextCanvas.getContext("2d") : null;

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const STORAGE_KEY = "tetoris_scores";

const COLORS = {
  I: "#60a5fa",
  O: "#facc15",
  T: "#c084fc",
  S: "#34d399",
  Z: "#f87171",
  J: "#38bdf8",
  L: "#fb923c",
};

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

const LINE_SCORES = [0, 100, 300, 500, 800];
const CLEAR_EFFECT_MS = 180;
const BGM_SRC = "/SE/BGM/BGM.mp3";
const BGM_VOLUME = 0.1;

const SOUND_FILES = {
  move: "/SE/move/move01.wav",
  rotate: "/SE/round/round.wav",
  drop: "",
  clear: "/SE/deleate/deleate-02.wav",
  gameOver: "/SE/gameover/gameover-03.wav",
};

const SOUND_VOLUMES = {
  move: 0.9,
  rotate: 0.9,
  drop: 0.6,
  clear: 0.7,
  gameOver: 1.0,
};

const FALLBACK_RANKING = [
  { name: "NEO", score: 1200 },
  { name: "ARC", score: 980 },
  { name: "PIX", score: 760 },
  { name: "JPN", score: 540 },
  { name: "CPU", score: 320 },
];

let board = createBoard();
let current = null;
let nextPiece = null;
let nextDrop = 0;
let score = 0;
let lines = 0;
let level = 1;
let gameOver = false;
let playerName = "";
let isActive = false;
let hasFinalized = false;
let scoreRecords = [];
let animationFrameId = null;
let clearingRows = [];
let clearUntil = 0;
let spawnAfterClear = false;
let audioCtx = null;
const soundCache = new Map();
let bgmAudio = null;

const SWIPE_THRESHOLD = 24;
const LONG_SWIPE_THRESHOLD = 90;
const TAP_THRESHOLD = 8;
const SWIPE_COOLDOWN_MS = 70;
let touchStart = null;
let lastSwipeAt = 0;

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function loadScores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    scoreRecords = raw ? JSON.parse(raw) : [];
  } catch {
    scoreRecords = [];
  }
}

function persistScores() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scoreRecords));
}

function getBestScore(name) {
  return scoreRecords
    .filter((entry) => entry.name === name)
    .reduce((best, entry) => Math.max(best, entry.score), 0);
}

function getTopScores(limit = 5) {
  return [...scoreRecords]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(a.timestamp) - new Date(b.timestamp);
    })
    .slice(0, limit);
}

function updateScoreboard() {
  const best = playerName ? getBestScore(playerName) : 0;
  playerLabel.textContent = playerName || "-";
  bestScoreEl.textContent = best.toString();
  bestPreviewScore.textContent = playerName ? best.toString() : "-";

  topScoresEl.innerHTML = "";
  const topScores = getTopScores();
  const entries = topScores.length > 0 ? topScores : FALLBACK_RANKING;
  entries.forEach((entry, index) => {
    const li = document.createElement("li");
    const rank = document.createElement("span");
    const name = document.createElement("span");
    const score = document.createElement("span");
    rank.textContent = String(index + 1).padStart(2, "0");
    name.textContent = entry.name;
    score.textContent = entry.score.toString();
    li.append(rank, name, score);
    topScoresEl.appendChild(li);
  });
}

function randomPiece() {
  const types = Object.keys(SHAPES);
  const type = types[Math.floor(Math.random() * types.length)];
  const shape = SHAPES[type].map((row) => [...row]);
  return {
    type,
    shape,
  };
}

function rotate(matrix) {
  return matrix[0].map((_, index) => matrix.map((row) => row[index]).reverse());
}

function collision(piece, offsetX = 0, offsetY = 0, shapeOverride) {
  const shape = shapeOverride ?? piece.shape;
  for (let y = 0; y < shape.length; y += 1) {
    for (let x = 0; x < shape[y].length; x += 1) {
      if (!shape[y][x]) continue;
      const newX = piece.x + x + offsetX;
      const newY = piece.y + y + offsetY;
      if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
      if (newY >= 0 && board[newY][newX]) return true;
    }
  }
  return false;
}

function canMove(piece, dx, dy) {
  return !collision(piece, dx, dy);
}

function canRotate(piece, rotatedShape) {
  if (!collision(piece, 0, 0, rotatedShape)) return 0;
  if (!collision(piece, -1, 0, rotatedShape)) return -1;
  if (!collision(piece, 1, 0, rotatedShape)) return 1;
  return null;
}

function mergePiece(piece) {
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && piece.y + y >= 0) {
        board[piece.y + y][piece.x + x] = piece.type;
      }
    });
  });
}

function findFullRows() {
  const rows = [];
  board.forEach((row, y) => {
    if (row.every((cell) => cell)) rows.push(y);
  });
  return rows;
}

function startLineClear(rows, now) {
  clearingRows = rows;
  clearUntil = now + CLEAR_EFFECT_MS;
  spawnAfterClear = true;
  playLineClearSound();
}

function applyLineClear() {
  if (clearingRows.length === 0) return;
  const cleared = clearingRows.length;
  board = board.filter((_, index) => !clearingRows.includes(index));

  while (board.length < ROWS) {
    board.unshift(Array(COLS).fill(0));
  }

  lines += cleared;
  score += LINE_SCORES[cleared] * level;
  level = Math.floor(lines / 10) + 1;
  clearingRows = [];

  if (spawnAfterClear) {
    spawnPiece();
    spawnAfterClear = false;
  }
}

function spawnPiece() {
  if (!nextPiece) {
    nextPiece = randomPiece();
  }
  current = nextPiece;
  current.x = Math.floor((COLS - current.shape[0].length) / 2);
  current.y = -1;
  nextPiece = randomPiece();
  drawNextPiece();
  if (!canMove(current, 0, 1)) {
    gameOver = true;
    if (gameOverEl) gameOverEl.hidden = false;
    playGameOverSound();
    finalizeGame();
  }
}

function resetGame() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  gameOver = false;
  hasFinalized = false;
  if (gameOverEl) gameOverEl.hidden = true;
  nextPiece = null;
  spawnPiece();
}

function lockPiece() {
  if (current.y < 0) {
    gameOver = true;
    if (gameOverEl) gameOverEl.hidden = false;
    playGameOverSound();
    finalizeGame();
    return;
  }
  mergePiece(current);
  current = null;
  const fullRows = findFullRows();
  if (fullRows.length > 0) {
    startLineClear(fullRows, performance.now());
  } else {
    spawnPiece();
  }
}

function dropPiece() {
  if (!canMove(current, 0, 1)) {
    lockPiece();
  } else {
    current.y += 1;
  }
}

function hardDrop() {
  let distance = 0;
  while (canMove(current, 0, distance + 1)) {
    distance += 1;
  }
  current.y += distance;
  lockPiece();
  nextDrop = 0;
}

function drawFixedCellGridLines(targetCtx, cellSize) {
  targetCtx.save();
  targetCtx.strokeStyle = "rgba(15, 23, 42, 0.55)";
  targetCtx.lineWidth = 1;
  targetCtx.beginPath();
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!board[y][x]) continue;
      const px = x * cellSize + 0.5;
      const py = y * cellSize + 0.5;
      targetCtx.rect(px, py, cellSize - 1, cellSize - 1);
    }
  }
  targetCtx.stroke();
  targetCtx.restore();
}

function drawPieceOutline(targetCtx, piece, cellSize) {
  const occupied = new Set();
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      occupied.add(`${x},${y}`);
    });
  });
  targetCtx.save();
  targetCtx.strokeStyle = "rgba(248, 250, 252, 0.85)";
  targetCtx.lineWidth = 2;
  targetCtx.lineJoin = "round";
  targetCtx.beginPath();
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      const baseX = (piece.x + x) * cellSize;
      const baseY = (piece.y + y) * cellSize;
      const left = `${x - 1},${y}`;
      const right = `${x + 1},${y}`;
      const up = `${x},${y - 1}`;
      const down = `${x},${y + 1}`;
      if (!occupied.has(left)) {
        targetCtx.moveTo(baseX + 0.5, baseY + 0.5);
        targetCtx.lineTo(baseX + 0.5, baseY + cellSize - 0.5);
      }
      if (!occupied.has(right)) {
        targetCtx.moveTo(baseX + cellSize - 0.5, baseY + 0.5);
        targetCtx.lineTo(baseX + cellSize - 0.5, baseY + cellSize - 0.5);
      }
      if (!occupied.has(up)) {
        targetCtx.moveTo(baseX + 0.5, baseY + 0.5);
        targetCtx.lineTo(baseX + cellSize - 0.5, baseY + 0.5);
      }
      if (!occupied.has(down)) {
        targetCtx.moveTo(baseX + 0.5, baseY + cellSize - 0.5);
        targetCtx.lineTo(baseX + cellSize - 0.5, baseY + cellSize - 0.5);
      }
    });
  });
  targetCtx.stroke();
  targetCtx.restore();
}

function drawCell(x, y, type) {
  ctx.fillStyle = COLORS[type];
  ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1;
  ctx.strokeRect(x * BLOCK_SIZE + 0.5, y * BLOCK_SIZE + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
}

function draw(time = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) drawCell(x, y, cell);
    });
  });
  drawFixedCellGridLines(ctx, BLOCK_SIZE);

  if (current) {
    current.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value && current.y + y >= 0) {
          drawCell(current.x + x, current.y + y, current.type);
        }
      });
    });
    if (current.y >= 0) {
      drawPieceOutline(ctx, current, BLOCK_SIZE);
    }
  }

  if (clearingRows.length > 0) {
    const remaining = Math.max(0, clearUntil - time);
    const ratio = Math.min(1, remaining / CLEAR_EFFECT_MS);
    const alpha = 0.15 + (1 - ratio) * 0.65;
    ctx.fillStyle = `rgba(248, 250, 252, ${alpha})`;
    clearingRows.forEach((y) => {
      ctx.fillRect(0, y * BLOCK_SIZE, canvas.width, BLOCK_SIZE);
    });
  }

  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
  if (finalScoreEl) finalScoreEl.textContent = score;
}

function drawNextPiece() {
  if (!nextCtx || !nextPiece) return;
  const size = Math.floor(nextCanvas.width / 4);
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = nextPiece.shape;
  const shapeWidth = shape[0].length * size;
  const shapeHeight = shape.length * size;
  const offsetX = Math.floor((nextCanvas.width - shapeWidth) / 2);
  const offsetY = Math.floor((nextCanvas.height - shapeHeight) / 2);
  shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!value) return;
      nextCtx.fillStyle = COLORS[nextPiece.type];
      nextCtx.fillRect(offsetX + x * size, offsetY + y * size, size, size);
      nextCtx.strokeStyle = "#0f172a";
      nextCtx.lineWidth = 1;
      nextCtx.strokeRect(offsetX + x * size + 0.5, offsetY + y * size + 0.5, size - 1, size - 1);
    });
  });
}

function update(time = 0) {
  if (!isActive) {
    draw(time);
    animationFrameId = requestAnimationFrame(update);
    return;
  }

  if (gameOver) {
    draw(time);
    animationFrameId = requestAnimationFrame(update);
    return;
  }

  if (clearingRows.length > 0) {
    if (time >= clearUntil) {
      applyLineClear();
    }
    draw(time);
    animationFrameId = requestAnimationFrame(update);
    return;
  }

  if (!nextDrop) nextDrop = time;
  const speed = Math.max(100, 800 - (level - 1) * 60);

  if (time - nextDrop > speed) {
    dropPiece();
    nextDrop = time;
  }

  draw(time);
  animationFrameId = requestAnimationFrame(update);
}

document.addEventListener("keydown", (event) => {
  if (gameOver || !isActive || !current || clearingRows.length > 0) return;

  switch (event.code) {
    case "ArrowLeft":
      if (canMove(current, -1, 0)) {
        current.x -= 1;
        playMoveSound();
      }
      break;
    case "ArrowRight":
      if (canMove(current, 1, 0)) {
        current.x += 1;
        playMoveSound();
      }
      break;
    case "ArrowDown":
      if (canMove(current, 0, 1)) {
        current.y += 1;
        playMoveSound(220);
      }
      break;
    case "ArrowUp": {
      const rotated = rotate(current.shape);
      const kick = canRotate(current, rotated);
      if (kick !== null) {
        current.shape = rotated;
        current.x += kick;
        playRotateSound();
      }
      break;
    }
    case "Space":
      hardDrop();
      playDropSound();
      break;
    default:
      return;
  }
  draw();
});

function handleTapOrSwipe(deltaX, deltaY, distance) {
  if (!current) return;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (distance <= TAP_THRESHOLD) {
    const rotated = rotate(current.shape);
    if (!collision(current, 0, 0, rotated)) {
      current.shape = rotated;
      playRotateSound();
      draw();
    }
    return;
  }
  if (absX > absY) {
    if (deltaX > 0 && !collision(current, 1, 0)) {
      current.x += 1;
      playMoveSound();
    } else if (deltaX < 0 && !collision(current, -1, 0)) {
      current.x -= 1;
      playMoveSound();
    }
  } else if (deltaY > 0) {
    if (absY >= LONG_SWIPE_THRESHOLD) {
      hardDrop();
      playDropSound();
    } else if (!collision(current, 0, 1)) {
      current.y += 1;
      playMoveSound(220);
    }
  } else if (deltaY < 0) {
    const rotated = rotate(current.shape);
    if (!collision(current, 0, 0, rotated)) {
      current.shape = rotated;
      playRotateSound();
    }
  }
  draw();
}

function bindTouchControls() {
  if (!canvas) return;
  const onPointerDown = (event) => {
    if (gameOver || !isActive || clearingRows.length > 0) return;
    touchStart = {
      x: event.clientX,
      y: event.clientY,
      time: performance.now(),
    };
  };
  const onPointerMove = (event) => {
    if (!touchStart || gameOver || !isActive || clearingRows.length > 0 || !current) return;
    const now = performance.now();
    if (now - lastSwipeAt < SWIPE_COOLDOWN_MS) return;
    const deltaX = event.clientX - touchStart.x;
    const deltaY = event.clientY - touchStart.y;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD && Math.abs(deltaY) < SWIPE_THRESHOLD) return;
    handleTapOrSwipe(deltaX, deltaY, Math.hypot(deltaX, deltaY));
    touchStart = { x: event.clientX, y: event.clientY, time: now };
    lastSwipeAt = now;
  };
  const onPointerUp = (event) => {
    if (!touchStart || gameOver || !isActive || clearingRows.length > 0) return;
    const deltaX = event.clientX - touchStart.x;
    const deltaY = event.clientY - touchStart.y;
    const distance = Math.hypot(deltaX, deltaY);
    const elapsed = performance.now() - touchStart.time;
    if (elapsed < 300) {
      handleTapOrSwipe(deltaX, deltaY, distance);
    }
    touchStart = null;
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", () => {
    touchStart = null;
  });
}

if (restartButton) {
  restartButton.addEventListener("click", () => {
    resetGame();
    nextDrop = 0;
    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(update);
    }
  });
}

startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  playerName = nameInput.value.trim() || "Player";
  titleScreen.hidden = true;
  isActive = true;
  getAudioContext();
  startBgm();
  updateScoreboard();
  resetGame();
  nextDrop = 0;
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(update);
  }
});

nameInput.addEventListener("input", () => {
  const previewName = nameInput.value.trim();
  bestPreviewScore.textContent = previewName ? getBestScore(previewName).toString() : "-";
});

function finalizeGame() {
  if (hasFinalized || !playerName) return;
  hasFinalized = true;
  const entry = {
    name: playerName,
    score,
    timestamp: new Date().toISOString(),
  };
  scoreRecords.push(entry);
  persistScores();
  updateScoreboard();
}

loadScores();
updateScoreboard();
animationFrameId = requestAnimationFrame(update);
bindTouchControls();

function getAudioContext() {
  if (!window.AudioContext) return null;
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function getAudioElement(src) {
  if (!src) return null;
  if (soundCache.has(src)) return soundCache.get(src);
  const audio = new Audio(src);
  audio.preload = "auto";
  soundCache.set(src, audio);
  return audio;
}

function startBgm() {
  if (!BGM_SRC) return;
  if (!bgmAudio) {
    bgmAudio = new Audio(BGM_SRC);
    bgmAudio.loop = true;
    bgmAudio.volume = BGM_VOLUME;
  }
  bgmAudio.play().catch(() => {});
}

function playSound(type, fallback) {
  const src = SOUND_FILES[type];
  if (src) {
    const audio = getAudioElement(src);
    if (!audio) return;
    audio.volume = SOUND_VOLUMES[type] ?? 0.7;
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  if (fallback) fallback();
}

function playTone(frequency, duration = 0.06, type = "square", volume = 0.06) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playMoveSound(frequency = 260) {
  playSound("move", () => playTone(frequency, 0.03, "square", 0.04));
}

function playRotateSound() {
  playSound("rotate", () => playTone(520, 0.04, "square", 0.05));
}

function playDropSound() {
  playSound("drop", () => playTone(140, 0.06, "square", 0.05));
}

function playLineClearSound() {
  playSound("clear", () => {
    playTone(660, 0.05, "square", 0.06);
    playTone(880, 0.06, "square", 0.05);
  });
}

function playGameOverSound() {
  playSound("gameOver", () => {
    playTone(220, 0.1, "square", 0.07);
    playTone(110, 0.14, "square", 0.06);
  });
}

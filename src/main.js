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

let board = createBoard();
let current = null;
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
  if (topScores.length === 0) {
    const li = document.createElement("li");
    li.textContent = "まだスコアがありません";
    topScoresEl.appendChild(li);
    return;
  }
  topScores.forEach((entry) => {
    const li = document.createElement("li");
    li.textContent = `${entry.name} - ${entry.score}`;
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
    x: Math.floor((COLS - shape[0].length) / 2),
    y: 0,
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

function mergePiece(piece) {
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && piece.y + y >= 0) {
        board[piece.y + y][piece.x + x] = piece.type;
      }
    });
  });
}

function clearLines() {
  let cleared = 0;
  board = board.filter((row) => {
    if (row.every((cell) => cell)) {
      cleared += 1;
      return false;
    }
    return true;
  });

  while (board.length < ROWS) {
    board.unshift(Array(COLS).fill(0));
  }

  if (cleared > 0) {
    lines += cleared;
    score += LINE_SCORES[cleared] * level;
    level = Math.floor(lines / 10) + 1;
  }
}

function spawnPiece() {
  current = randomPiece();
  current.y = -1;
  if (collision(current, 0, 1)) {
    gameOver = true;
    gameOverEl.hidden = false;
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
  gameOverEl.hidden = true;
  spawnPiece();
}

function dropPiece() {
  if (collision(current, 0, 1)) {
    mergePiece(current);
    clearLines();
    spawnPiece();
  } else {
    current.y += 1;
  }
}

function hardDrop() {
  if (collision(current, 0, 1)) {
    dropPiece();
    return;
  }

  while (!collision(current, 0, 1)) {
    current.y += 1;
  }
  current.y -= 1;
  dropPiece();
}

function drawCell(x, y, type) {
  ctx.fillStyle = COLORS[type];
  ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 1;
  ctx.strokeRect(x * BLOCK_SIZE + 0.5, y * BLOCK_SIZE + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell) drawCell(x, y, cell);
    });
  });

  if (current) {
    current.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value && current.y + y >= 0) {
          drawCell(current.x + x, current.y + y, current.type);
        }
      });
    });
  }

  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
  finalScoreEl.textContent = score;
}

function update(time = 0) {
  if (!isActive) {
    draw();
    animationFrameId = requestAnimationFrame(update);
    return;
  }

  if (gameOver) {
    draw();
    animationFrameId = requestAnimationFrame(update);
    return;
  }

  if (!nextDrop) nextDrop = time;
  const speed = Math.max(100, 800 - (level - 1) * 60);

  if (time - nextDrop > speed) {
    dropPiece();
    nextDrop = time;
  }

  draw();
  animationFrameId = requestAnimationFrame(update);
}

document.addEventListener("keydown", (event) => {
  if (gameOver || !isActive) return;

  switch (event.code) {
    case "ArrowLeft":
      if (!collision(current, -1, 0)) current.x -= 1;
      break;
    case "ArrowRight":
      if (!collision(current, 1, 0)) current.x += 1;
      break;
    case "ArrowDown":
      if (!collision(current, 0, 1)) current.y += 1;
      break;
    case "ArrowUp": {
      const rotated = rotate(current.shape);
      if (!collision(current, 0, 0, rotated)) current.shape = rotated;
      break;
    }
    case "Space":
      hardDrop();
      break;
    default:
      return;
  }
  draw();
});

restartButton.addEventListener("click", () => {
  resetGame();
  nextDrop = 0;
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(update);
  }
});

startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  playerName = nameInput.value.trim() || "Player";
  titleScreen.hidden = true;
  isActive = true;
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

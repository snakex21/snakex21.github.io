const cells = document.querySelectorAll('.cell');
const resetButton = document.querySelector('#reset');
const startButton = document.querySelector('#start');
const resultX = document.querySelector('#result-x');
const resultO = document.querySelector('#result-o');

let currentPlayer;
let winner;
let playerXScore = 0;
let playerOScore = 0;
let gameStarted = false;

function startGame(mark) {
  currentPlayer = mark;
  gameStarted = true;
  startButton.style.display = 'none';
  resetButton.style.display = 'inline-block';
}

function handleCellClick(e) {
  const cell = e.target;
  if (!gameStarted || cell.classList.contains('X') || cell.classList.contains('O')) {
    return;
  }
  placeMark(cell, currentPlayer);
  swapTurn();
  winner = checkWin();
  if (winner) {
    endGame();
  } else if (isBoardFull()) {
    draw();
  }
}

function placeMark(cell, mark) {
  cell.classList.add(mark);
  cell.textContent = mark;
}

function swapTurn() {
  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
}

function checkWin() {
  const lines = [
    // wiersze
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    // kolumny
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    // przekątne
    [0, 4, 8],
    [2, 4, 6]
  ];
  for (let i = 0; i < lines.length; i++) {
    const [a, b, c] = lines[i];
    if (cells[a].classList.contains(currentPlayer) &&
      cells[b].classList.contains(currentPlayer) &&
      cells[c].classList.contains(currentPlayer)) {
      return currentPlayer;
    }
  }
  return null;
}

function isBoardFull() {
  return Array.from(cells).every(cell => {
    return cell.classList.contains('X') || cell.classList.contains('O');
  });
}

function endGame() {
  if (winner === 'X') {
    playerXScore++;
    resultX.textContent = `Gracz X: ${playerXScore}`;
    alert('Wygrał gracz X!');
  } else if (winner === 'O') {
    playerOScore++;
    resultO.textContent = `Gracz O: ${playerOScore}`;
    alert('Wygrał gracz O!');
  }
  gameStarted = false;
}

function draw() {
  alert('Remis!');
  gameStarted = false;
}

function resetBoard() {
  currentPlayer = 'X';
  winner = null;
}

resetButton.addEventListener('click', () => {
  cells.forEach(cell => {
    cell.classList.remove('X', 'O');
    cell.textContent = '';
  });
  resetBoard();
  playerXScore = 0;
  playerOScore = 0;
  resultX.textContent = 'Gracz X: 0';
  resultO.textContent = 'Gracz O: 0';
  gameStarted = false;
  startButton.style.display = 'inline-block';
});

startButton.addEventListener('click', () => {
  const mark = prompt("Wybierz znak: X lub O");
  if (mark === "X" || mark === "O") {
    startGame(mark);
  } else {
    alert("Nieprawidłowy znak! Wybierz X lub O.");
  }
});

function startGame(mark) {
  currentPlayer = mark;
  gameStarted = true;
  startButton.style.display = 'none';
  resetButton.style.display = 'inline-block';
  document.querySelector('.board').style.display = 'block';
}
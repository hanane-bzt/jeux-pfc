const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = 3000;

let players = [];
let choices = {};
let scores = {};
let rounds = 10;

// Configurer les sessions
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Assurez-vous que 'secure' est false pour les tests en local
}));

// Middleware pour parser les données POST
app.use(express.urlencoded({ extended: true }));

// Middleware d'authentification
const authMiddleware = (req, res, next) => {
  if (req.session.user || req.path === '/login' || req.path === '/login.html') {
    return next();
  } else {
    return res.redirect('/login.html');
  }
};

app.use(authMiddleware);

// Servir les fichiers statiques dans le répertoire public
app.use(express.static(path.join(__dirname, 'public')));

// Route pour /login
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  const { username } = req.body;
  if (username) {
    req.session.user = username;
    return res.redirect('/');
  }
  res.redirect('/login');
});

// Route pour /
app.get('/', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
  const username = socket.handshake.query.username;
  if (!username) {
    socket.disconnect();
    return;
  }

  if (players.length >= 2) {
    socket.emit('message', 'Le jeu est plein.');
    socket.disconnect();
    return;
  }

  console.log(`${username} connecté`);
  players.push({ id: socket.id, username: username });

  socket.on('playerChoice', (choice) => {
    choices[socket.id] = choice;
    io.emit('playerChoiceReceived', { player: username, choice: choice });
    if (Object.keys(choices).length === 2) {
      determineWinner();
      choices = {};
      rounds--;
      if (rounds === 0) {
        resetGame();
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`${username} déconnecté`);
    players = players.filter(player => player.id !== socket.id);
    delete choices[socket.id];
  });
});

function determineWinner() {
  const [player1, player2] = players;
  const choice1 = choices[player1.id];
  const choice2 = choices[player2.id];

  let result;
  if (choice1 === choice2) {
    result = 'Égalité !';
  } else if (
    (choice1 === 'pierre' && (choice2 === 'ciseaux' || choice2 === 'puits')) ||
    (choice1 === 'feuille' && (choice2 === 'pierre' || choice2 === 'puits')) ||
    (choice1 === 'ciseaux' && (choice2 === 'feuille' || choice2 === 'puits')) ||
    (choice1 === 'puits' && (choice2 === 'pierre' || choice2 === 'ciseaux'))
  ) {
    result = `${player1.username} gagne !`;
    scores[player1.username] = (scores[player1.username] || 0) + 1;
  } else {
    result = `${player2.username} gagne !`;
    scores[player2.username] = (scores[player2.username] || 0) + 1;
  }

  io.to(player1.id).emit('gameResult', { message: result });
  io.to(player2.id).emit('gameResult', { message: result });
  io.emit('scoreUpdate', scores);
}

function resetGame() {
  rounds = 10;
  scores = {};
  io.emit('scoreUpdate', scores);
}

server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});

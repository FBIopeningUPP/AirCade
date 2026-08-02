import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'aircade-dev-secret-change-me';
const JWT_EXPIRY = '7d';

const users = new Map();
const scores = new Map();
const rooms = {};

const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

app.post('/api/auth/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  if (username.length > 12) {
    return res.status(400).json({ error: 'username too long (max 12)' });
  }
  if (users.has(username.toLowerCase())) {
    return res.status(400).json({ error: 'username taken' });
  }
  const hash = await hashPassword(password);
  const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  users.set(username.toLowerCase(), { userId, username, passwordHash: hash });
  scores.set(userId, []);
  const token = generateToken(userId);
  res.json({ token, username, userId });
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  const user = users.get(username.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'user not found' });
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'incorrect password' });
  }
  const token = generateToken(user.userId);
  res.json({ token, username: user.username, userId: user.userId });
});

const authMiddleware = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'token required' });
  }
  const token = auth.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'invalid token' });
  }
  req.userId = decoded.userId;
  next();
};

app.post('/api/score', authMiddleware, (req, res) => {
  const { score } = req.body;
  if (score === undefined || score === null) {
    return res.status(400).json({ error: 'score required' });
  }
  const s = parseInt(score, 10);
  if (isNaN(s)) {
    return res.status(400).json({ error: 'score must be integer' });
  }
  const userScores = scores.get(req.userId) || [];
  userScores.push({ score: s, ts: Date.now() });
  scores.set(req.userId, userScores);
  res.json({ ok: true });
});

app.get('/api/leaderboard', (req, res) => {
  const allScores = [];
  for (const [userId, userScores] of scores.entries()) {
    const user = Array.from(users.values()).find(u => u.userId === userId);
    const username = user?.username || 'Unknown';
    for (const s of userScores) {
      allScores.push({ username, score: s.score, ts: s.ts });
    }
  }
  allScores.sort((a, b) => b.score - a.score);
  res.json(allScores.slice(0, 10));
});

app.get('/api/profile', authMiddleware, (req, res) => {
  const user = Array.from(users.values()).find(u => u.userId === req.userId);
  if (!user) return res.status(404).json({ error: 'not found' });
  const userScores = scores.get(req.userId) || [];
  const bestScore = userScores.length > 0 ? Math.max(...userScores.map(s => s.score)) : 0;
  res.json({ username: user.username, userId: user.userId, bestScore, totalGames: userScores.length });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  let currentRoom = null;
  let currentUserId = null;

  socket.on('authenticate', (data) => {
    const { token } = data;
    const decoded = verifyToken(token);
    if (decoded) {
      currentUserId = decoded.userId;
      socket.emit('authenticated', { userId: currentUserId });
    } else {
      socket.emit('authError', 'invalid token');
    }
  });

  // Gameplay Events
  socket.on('createRoom', (data) => {
    const { playerName } = data;
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) {
      roomCode = generateRoomCode();
    }

    rooms[roomCode] = {
      players: {},
      hostId: socket.id
    };

    rooms[roomCode].players[socket.id] = {
      id: socket.id,
      userId: currentUserId,
      name: playerName || 'Player',
      x: 4096 / 2,
      y: 4096 / 2,
      anim: 'idle_down',
      isHost: true
    };

    socket.join(roomCode);
    currentRoom = roomCode;

    console.log(`Room ${roomCode} created by ${socket.id}`);

    socket.emit('roomJoined', {
      roomCode,
      players: Object.values(rooms[roomCode].players),
      isHost: true,
      myId: socket.id
    });
  });

  socket.on('joinRoom', (data) => {
    const { roomCode, playerName } = data;
    const code = roomCode.toUpperCase();

    if (rooms[code]) {
      if (Object.keys(rooms[code].players).length >= 4) {
        socket.emit('error', 'Room is full (max 4 players)');
        return;
      }

      rooms[code].players[socket.id] = {
        id: socket.id,
        userId: currentUserId,
        name: playerName || 'Player',
        x: 4096 / 2,
        y: 4096 / 2,
        anim: 'idle_down',
        isHost: false
      };

      socket.join(code);
      currentRoom = code;

      socket.emit('roomJoined', {
        roomCode: code,
        players: Object.values(rooms[code].players),
        isHost: false,
        myId: socket.id
      });

      // Notify others in room
      socket.to(code).emit('playerJoined', rooms[code].players[socket.id]);
      console.log(`${socket.id} joined room ${code}`);
    } else {
      socket.emit('error', 'Room not found');
    }
  });

  socket.on('scanLocal', () => {
    // Return the first available room (for seamless local feel)
    const availableRoomCode = Object.keys(rooms).find(code => Object.keys(rooms[code].players).length < 4);
    if (availableRoomCode) {
      const host = Object.values(rooms[availableRoomCode].players).find(p => p.isHost);
      socket.emit('survivorFound', { roomCode: availableRoomCode, hostName: host?.name || 'Unknown' });
    } else {
      socket.emit('scanFailed', 'No local broadcasts found');
    }
  });

  socket.on('startGame', () => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[socket.id]?.isHost) {
      console.log(`Starting game in room ${currentRoom}`);
      io.to(currentRoom).emit('gameStarted');
    }
  });

  // Gameplay Events
  socket.on('playerMove', (data) => {
    if (currentRoom && rooms[currentRoom] && rooms[currentRoom].players[socket.id]) {
      const p = rooms[currentRoom].players[socket.id];
      p.x = data.x;
      p.y = data.y;
      p.anim = data.anim;
      // Broadcast to everyone else in the room
      socket.to(currentRoom).emit('playerMoved', { id: socket.id, x: p.x, y: p.y, anim: p.anim });
    }
  });
  
  socket.on('resourceGathered', (data) => {
    // data = { type: 'tree' | 'rock' | 'radio', x: 123, y: 123 }
    if (currentRoom) {
      socket.to(currentRoom).emit('resourceGathered', data);
    }
  });
  
  socket.on('craftCampfire', (data) => {
    if (currentRoom) {
      socket.to(currentRoom).emit('craftCampfire', data);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].players[socket.id];
      socket.to(currentRoom).emit('playerLeft', socket.id);
      
      // If room is empty, delete it
      if (Object.keys(rooms[currentRoom].players).length === 0) {
        delete rooms[currentRoom];
        console.log(`Room ${currentRoom} deleted`);
      } else {
        // If host left, reassign host (just pick the first one)
        const pList = Object.values(rooms[currentRoom].players);
        if (!pList.find(p => p.isHost)) {
          const newHost = pList[0];
          newHost.isHost = true;
          io.to(newHost.id).emit('hostAssigned');
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Multiplayer Server running on port ${PORT}`);
  console.log(`REST API available on port ${PORT}`);
});
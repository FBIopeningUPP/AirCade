import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store active rooms: roomCode -> { players: { socketId: { name, x, y, anim, isHost } } }
const rooms = {};

const generateRoomCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  let currentRoom = null;

  socket.on('createRoom', (data) => {
    const { playerName } = data;
    let roomCode = generateRoomCode();
    while (rooms[roomCode]) {
      roomCode = generateRoomCode();
    }
    
    rooms[roomCode] = {
      players: {}
    };
    
    rooms[roomCode].players[socket.id] = {
      id: socket.id,
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

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Multiplayer Server running on port ${PORT}`);
});

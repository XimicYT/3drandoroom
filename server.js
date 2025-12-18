const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// ALLOW CORS: This tells the server to accept connections from external websites
const io = new Server(server, {
  cors: {
    origin: "*", // Allow any website to connect (safe for this project)
    methods: ["GET", "POST"]
  }
});

// We no longer serve static files here because Netlify does that.
app.get('/', (req, res) => {
  res.send('Server is running. Connect via the Netlify frontend.');
});

let players = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (username) => {
    players[socket.id] = {
      x: 0,
      y: 0.5,
      z: 0,
      color: Math.random() * 0xffffff,
      username: username
    };
    socket.emit('init', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, ...players[socket.id] });
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].z = data.z;
      socket.broadcast.emit('updatePlayer', { id: socket.id, x: data.x, z: data.z });
    }
  });

  socket.on('chat', (msg) => {
    if (players[socket.id]) {
      io.emit('chatMessage', { user: players[socket.id].username, text: msg });
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('removePlayer', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

let players = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (username) => {
    players[socket.id] = {
      x: 0, y: 2, z: 0,        // Start in the air
      ry: 0,                   // Rotation Y (Yaw)
      color: Math.random() * 0xffffff,
      username: username
    };
    socket.emit('init', players);
    socket.broadcast.emit('newPlayer', { id: socket.id, ...players[socket.id] });
  });

  socket.on('move', (data) => {
    if (players[socket.id]) {
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      players[socket.id].z = data.z;
      players[socket.id].ry = data.ry; // Sync rotation
      
      socket.broadcast.emit('updatePlayer', { 
        id: socket.id, 
        x: data.x, y: data.y, z: data.z, ry: data.ry 
      });
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

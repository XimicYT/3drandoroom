const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from any URL (for development/Render)
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));

let players = {};
let currentItId = null; // Track the Socket ID of the player who is "It"

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('joinGame', (data) => {
    // 1. Initialize the new player object
    players[socket.id] = {
      id: socket.id,
      username: data.username || "Guest",
      x: 0,
      y: 5, // Start slightly in the air
      z: 0,
      yaw: 0,
      // Assign a random neon color (avoiding dark colors)
      color: Math.floor(Math.random() * 16777215)
    };

    // 2. TAG LOGIC: If this is the first player, they become IT automatically
    if (Object.keys(players).length === 1) {
      currentItId = socket.id;
    }

    // 3. Send current state to the NEW player
    socket.emit('currentPlayers', players);

    // 4. Broadcast the new player to EVERYONE else
    socket.broadcast.emit('newPlayer', {
      id: socket.id,
      player: players[socket.id]
    });

    // 5. SYNC TAG STATE: Tell the new player who is currently IT
    if (currentItId) {
      // We send 'silent: true' so the new player sees the colors correctly
      // but doesn't get "Stunned" immediately upon joining.
      socket.emit('tag', { targetId: currentItId, silent: true });
    }
  });

  // Handle Movement Updates
  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      players[socket.id].z = movementData.z;
      players[socket.id].yaw = movementData.yaw;

      // Broadcast to others
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: movementData.x,
        y: movementData.y,
        z: movementData.z,
        yaw: movementData.yaw
      });
    }
  });

  // --- TAG EVENT HANDLER ---
  socket.on('tag', (data) => {
    // Ensure the target actually exists
    if (data.targetId && players[data.targetId]) {
      console.log(`Tag Event: ${socket.id} tagged ${data.targetId}`);
      
      currentItId = data.targetId;

      // Broadcast to EVERYONE (including sender)
      // This triggers the red glow update and the stun screen on the victim
      io.emit('tag', { 
        targetId: currentItId, 
        silent: data.silent || false // Silent is false by default (triggers stun)
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Remove player from state
    delete players[socket.id];
    
    // Tell everyone else
    io.emit('playerDisconnected', socket.id);

    // --- FAILSAFE: If "IT" left the game ---
    if (socket.id === currentItId) {
      const remainingIds = Object.keys(players);
      
      if (remainingIds.length > 0) {
        // Pick a random remaining player to be IT
        const randomId = remainingIds[Math.floor(Math.random() * remainingIds.length)];
        currentItId = randomId;
        
        console.log(`IT player left. New IT is: ${currentItId}`);
        
        // Broadcast new tag state (not silent, so they know they are it)
        io.emit('tag', { targetId: currentItId, silent: false });
      } else {
        // No players left
        currentItId = null;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

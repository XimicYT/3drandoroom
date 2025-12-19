const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let players = {};
let currentIt = null; // Track who is IT

io.on("connection", (socket) => {
  console.log("Player joined:", socket.id);

  // 1. Initialize Player
  players[socket.id] = { 
    x: 0, y: 5, z: 0, yaw: 0, 
    id: socket.id 
  };

  // 2. Auto-Assign IT: If they are the first/only player, they are IT.
  if (Object.keys(players).length === 1 || !currentIt) {
    currentIt = socket.id;
  }

  // 3. Send Initial State
  socket.emit("currentPlayers", players);
  socket.emit("updateIt", currentIt); // Tell them who is IT immediately
  
  // 4. Notify Others
  socket.broadcast.emit("newPlayer", players[socket.id]);

  // --- MOVEMENT ---
  socket.on("playerMovement", (movementData) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...movementData };
      socket.broadcast.emit("playerMoved", { 
        id: socket.id, ...movementData 
      });
    }
  });

  // --- TAG LOGIC ---
  socket.on("tagPlayer", (victimId) => {
    // Security: Only the current "IT" player can tag someone
    if (socket.id === currentIt && players[victimId]) {
      currentIt = victimId; // Swap roles
      
      // Broadcast the event so everyone updates colors/UI
      io.emit("tagMade", { newIt: victimId, oldIt: socket.id });
    }
  });

  // --- DISCONNECT ---
  socket.on("disconnect", () => {
    console.log("Player left:", socket.id);
    delete players[socket.id];
    io.emit("playerDisconnected", socket.id);

    // If the "IT" player leaves, pick a random new one
    if (socket.id === currentIt) {
      const remainingIds = Object.keys(players);
      if (remainingIds.length > 0) {
        const randomIndex = Math.floor(Math.random() * remainingIds.length);
        currentIt = remainingIds[randomIndex];
        io.emit("updateIt", currentIt);
      } else {
        currentIt = null;
      }
    }
  });
});

server.listen(3000, () => console.log("Tag Server running on port 3000"));

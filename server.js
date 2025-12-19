const express = require('express');
const app = express();
const http = require('http').createServer(app);
const cors = require('cors');

// 1. Enable CORS for Express
app.use(cors());

// 2. Setup Socket.io with CORS
const io = require('socket.io')(http, {
    cors: {
        // Allow connections from your Netlify site (or any site for now)
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

const players = {};

// Basic health check endpoint
app.get('/', (req, res) => {
    res.send('Game Server is Running!');
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    players[socket.id] = {
        x: 0, y: 2, z: 5,
        yaw: 0,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    };

    socket.emit('currentPlayers', players);

    socket.broadcast.emit('newPlayer', { 
        id: socket.id, 
        player: players[socket.id] 
    });

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].z = movementData.z;
            players[socket.id].yaw = movementData.yaw;
            
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: players[socket.id].x,
                y: players[socket.id].y,
                z: players[socket.id].z,
                yaw: players[socket.id].yaw
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

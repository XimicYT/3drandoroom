const express = require('express');
const app = express();
const http = require('http').createServer(app);
const cors = require('cors');

app.use(cors());

const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const players = {};

app.get('/', (req, res) => res.send('Game Server Running'));

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // We wait for the client to send "joinGame" before adding them to the list
    socket.on('joinGame', (userData) => {
        players[socket.id] = {
            x: 0, y: 2, z: 0, // Start in the center room
            yaw: 0,
            color: '#' + Math.floor(Math.random()*16777215).toString(16),
            username: userData.username || `Player ${socket.id.substr(0,4)}`
        };

        // Send existing players to the new guy
        socket.emit('currentPlayers', players);
        
        // Notify others
        socket.broadcast.emit('newPlayer', { 
            id: socket.id, 
            player: players[socket.id] 
        });
    });

    socket.on('playerMovement', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].yaw = data.yaw;
            
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
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server on port ${PORT}`));

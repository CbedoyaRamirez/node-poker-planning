// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors'); // Para permitir conexiones desde Angular

const app = express();
const server = http.createServer(app);

// Configuración de CORS para Socket.IO
const io = socketIo(server, {
    cors: {
        origin: "https://app-poker-planning.vercel.app", // La URL de tu aplicación Angular
        methods: ["GET", "POST"]
    }
});

// --- Estado Global del Servidor ---
// En una aplicación real, esto se almacenaría en una base de datos.
const sessions = {}; // Almacenará los estados de las sesiones de Planning Poker

// --- Funciones Auxiliares ---
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 9);
}

function calculateAverage(votes) {
    const numericVotes = Object.values(votes)
        .filter(vote => typeof vote === 'number' && !isNaN(vote));
    if (numericVotes.length === 0) return 0;
    const sum = numericVotes.reduce((acc, curr) => acc + curr, 0);
    return sum / numericVotes.length;
}

// --- Manejo de Conexiones de Socket.IO ---
io.on('connection', (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);

    // Evento: El cliente se une a una sesión
    socket.on('join_session', ({ sessionId, playerName }) => {
        if (!sessionId) {
            sessionId = generateUniqueId(); // Crear una nueva sesión si no se proporciona ID
            sessions[sessionId] = {
                id: sessionId,
                name: `Sesión ${sessionId}`,
                currentStory: '',
                status: 'Esperando jugadores...',
                players: {}, // { socketId: { id, name, vote, hasVoted } }
                roundActive: false,
                cardsRevealed: false
            };
            console.log(`Nueva sesión creada: ${sessionId}`);
        }

        if (!sessions[sessionId]) {
            // Manejar caso donde la sesión no existe (ej. el cliente intenta unirse a una que no existe)
            socket.emit('session_error', 'La sesión no existe.');
            return;
        }

        socket.join(sessionId); // Unir el socket a una "sala" (la sesión)

        const playerId = socket.id;
        sessions[sessionId].players[playerId] = {
            id: playerId,
            name: playerName || `Jugador ${generateUniqueId()}`,
            vote: null,
            hasVoted: false
        };

        console.log(`Jugador ${playerName} (${playerId}) se unió a la sesión ${sessionId}`);

        // Emitir el estado actual de la sesión a todos en esa sala
        io.to(sessionId).emit('session_state_update', sessions[sessionId]);
    });

    // Evento: El host inicia una nueva ronda
    socket.on('start_round', ({ sessionId, story }) => {
        if (!sessions[sessionId]) return;

        sessions[sessionId].currentStory = story;
        sessions[sessionId].status = 'Votación abierta';
        sessions[sessionId].roundActive = true;
        sessions[sessionId].cardsRevealed = false;
        
        // Resetear votos de todos los jugadores
        Object.values(sessions[sessionId].players).forEach(player => {
            player.vote = null;
            player.hasVoted = false;
        });

        io.to(sessionId).emit('session_state_update', sessions[sessionId]);
    });

    // Evento: Un jugador envía su voto
    socket.on('submit_vote', ({ sessionId, vote }) => {
        if (!sessions[sessionId] || !sessions[sessionId].roundActive || sessions[sessionId].cardsRevealed) {
            socket.emit('vote_error', 'No puedes votar en este momento.');
            return;
        }

        const player = sessions[sessionId].players[socket.id];
        if (player) {
            player.vote = vote;
            player.hasVoted = true;
            console.log(`Jugador ${player.name} votó ${vote} en sesión ${sessionId}`);
            io.to(sessionId).emit('session_state_update', sessions[sessionId]);
        }
    });

    // Evento: El host revela las cartas
    socket.on('reveal_cards', (sessionId) => {
        if (!sessions[sessionId] || !sessions[sessionId].roundActive || sessions[sessionId].cardsRevealed) return;

        sessions[sessionId].cardsRevealed = true;
        sessions[sessionId].status = 'Cartas reveladas';
        io.to(sessionId).emit('session_state_update', sessions[sessionId]);
    });

    // Evento: El host resetea la ronda
    socket.on('reset_round', (sessionId) => {
        if (!sessions[sessionId]) return;

        sessions[sessionId].currentStory = '';
        sessions[sessionId].status = 'Esperando votos...';
        sessions[sessionId].roundActive = false;
        sessions[sessionId].cardsRevealed = false;
        
        // Resetear votos de todos los jugadores
        Object.values(sessions[sessionId].players).forEach(player => {
            player.vote = null;
            player.hasVoted = false;
        });

        io.to(sessionId).emit('session_state_update', sessions[sessionId]);
    });

    // Evento: Desconexión de cliente
    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`);
        // Eliminar al jugador de todas las sesiones donde pudiera estar
        for (const sessionId in sessions) {
            if (sessions[sessionId].players[socket.id]) {
                const playerName = sessions[sessionId].players[socket.id].name;
                delete sessions[sessionId].players[socket.id];
                io.to(sessionId).emit('session_state_update', sessions[sessionId]);
                console.log(`Jugador ${playerName} (${socket.id}) salió de la sesión ${sessionId}`);
            }
            // Opcional: Si la sesión se queda vacía, eliminarla
            if (Object.keys(sessions[sessionId].players).length === 0 && !sessions[sessionId].currentStory) {
                 delete sessions[sessionId];
                 console.log(`Sesión ${sessionId} eliminada por estar vacía.`);
            }
        }
    });
});

// Ruta de prueba para verificar que el servidor está corriendo
app.get('/', (req, res) => {
    res.send('Planning Poker Backend está funcionando con Socket.IO!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de Socket.IO escuchando en el puerto ${PORT}`);
});
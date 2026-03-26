let db;
let roomsRef;
let currentRoomId = null;
let unsubscribeRoom = null;

async function initFirebaseDB() {
    try {
        if (typeof firebase === 'undefined') {
            console.warn('Firebase SDK не загружен');
            return false;
        }
        
        db = firebase.database();
        roomsRef = db.ref('rooms');
        
        console.log('Firebase Database инициализирована');
        return true;
    } catch (error) {
        console.error('Ошибка инициализации БД:', error);
        return false;
    }
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < CONFIG.ROOM_CODE_LENGTH; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function createRoom(roomName, maxPlayers, hostId, hostName) {
    const roomCode = generateRoomCode();
    const roomData = {
        code: roomCode,
        name: roomName || 'Комната',
        maxPlayers: maxPlayers,
        hostId: hostId,
        status: 'waiting',
        createdAt: Date.now(),
        players: {},
        generators: {},
        gameState: null
    };
    
    try {
        const newRoomRef = roomsRef.child(roomCode);
        await newRoomRef.set(roomData);
        
        currentRoomId = roomCode;
        console.log('Комната создана:', roomCode);
        return { success: true, roomId: roomCode, roomData };
    } catch (error) {
        console.error('Ошибка создания комнаты:', error);
        return { success: false, error: error.message };
    }
}

async function joinRoom(roomCode, playerId, playerName) {
    try {
        const roomRef = roomsRef.child(roomCode.toUpperCase());
        const snapshot = await roomRef.once('value');
        
        if (!snapshot.exists()) {
            return { success: false, error: 'Комната не найдена' };
        }
        
        const roomData = snapshot.val();
        
        if (Object.keys(roomData.players).length >= roomData.maxPlayers) {
            return { success: false, error: 'Комната полна' };
        }
        
        if (roomData.status === 'playing') {
            return { success: false, error: 'Игра уже началась' };
        }
        
        const playerData = {
            id: playerId,
            name: playerName || 'Игрок',
            role: null,
            ready: false,
            connected: true,
            joinedAt: Date.now()
        };
        
        await roomRef.child('players').child(playerId).set(playerData);
        
        currentRoomId = roomCode.toUpperCase();
        console.log('Присоединился к комнате:', roomCode);
        
        return { success: true, roomId: roomCode.toUpperCase(), roomData };
    } catch (error) {
        console.error('Ошибка присоединения:', error);
        return { success: false, error: error.message };
    }
}

async function leaveRoom(roomCode, playerId) {
    try {
        const roomRef = roomsRef.child(roomCode);
        
        await roomRef.child('players').child(playerId).remove();
        
        const snapshot = await roomRef.child('players').once('value');
        const players = snapshot.val();
        
        if (!players || Object.keys(players).length === 0) {
            await roomRef.remove();
            console.log('Комната удалена');
        } else {
            const hostId = (await roomRef.child('hostId').once('value')).val();
            
            if (hostId === playerId) {
                const newHostId = Object.keys(players)[0];
                await roomRef.child('hostId').set(newHostId);
            }
        }
        
        currentRoomId = null;
        return { success: true };
    } catch (error) {
        console.error('Ошибка выхода:', error);
        return { success: false, error: error.message };
    }
}

function subscribeToRoom(roomCode, callbacks) {
    if (unsubscribeRoom) unsubscribeRoom();
    
    const roomRef = roomsRef.child(roomCode);
    
    unsubscribeRoom = roomRef.on('value', (snapshot) => {
        if (callbacks.onUpdate) {
            callbacks.onUpdate(snapshot.val());
        }
    }, (error) => {
        if (callbacks.onError) {
            callbacks.onError(error);
        }
    });
    
    return unsubscribeRoom;
}

function unsubscribeFromRoom() {
    if (unsubscribeRoom) {
        unsubscribeRoom();
        unsubscribeRoom = null;
    }
}

async function updatePlayerReady(roomCode, playerId, ready) {
    try {
        await roomsRef.child(roomCode).child('players').child(playerId).child('ready').set(ready);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function startGame(roomCode) {
    try {
        const roomRef = roomsRef.child(roomCode);
        const snapshot = await roomRef.child('players').once('value');
        const players = snapshot.val();
        
        const playerIds = Object.keys(players);
        const killerIndex = Math.floor(Math.random() * playerIds.length);
        
        const updates = {};
        
        playerIds.forEach((id, index) => {
            if (index === killerIndex) {
                updates[`players/${id}/role`] = 'killer';
            } else {
                updates[`players/${id}/role`] = 'survivor';
            }
        });
        
        const generators = {};
        for (let i = 1; i <= CONFIG.GENERATOR_COUNT; i++) {
            generators[i] = {
                id: i,
                repaired: false,
                progress: 0,
                repairingBy: null
            };
        }
        
        updates['status'] = 'playing';
        updates['generators'] = generators;
        updates['startedAt'] = Date.now();
        
        await roomRef.update(updates);
        
        console.log('Игра началась:', roomCode);
        return { success: true };
    } catch (error) {
        console.error('Ошибка начала игры:', error);
        return { success: false, error: error.message };
    }
}

async function updatePlayerPosition(roomCode, playerId, x, y, rotation) {
    try {
        await roomsRef.child(roomCode).child('players').child(playerId).update({
            x: x,
            y: y,
            rotation: rotation,
            lastUpdate: Date.now()
        });
    } catch (error) {
        console.error('Ошибка обновления позиции:', error);
    }
}

async function updateGenerator(roomCode, generatorId, data) {
    try {
        await roomsRef.child(roomCode).child('generators').child(generatorId).update(data);
    } catch (error) {
        console.error('Ошибка обновления генератора:', error);
    }
}

async function setPlayerCaught(roomCode, playerId) {
    try {
        await roomsRef.child(roomCode).child('players').child(playerId).update({
            caught: true,
            caughtAt: Date.now()
        });
    } catch (error) {
        console.error('Ошибка:', error);
    }
}

async function endGame(roomCode, result) {
    try {
        await roomsRef.child(roomCode).update({
            status: 'finished',
            result: result,
            endedAt: Date.now()
        });
        
        setTimeout(async () => {
            await roomsRef.child(roomCode).remove();
        }, 30000);
        
        return { success: true };
    } catch (error) {
        console.error('Ошибка завершения:', error);
        return { success: false, error: error.message };
    }
}

function getCurrentRoomId() {
    return currentRoomId;
}
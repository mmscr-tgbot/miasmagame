let db;
let roomsRef;
let currentRoomId = null;
let unsubscribeRoom = null;
let firebaseReady = false;

function initFirebaseDB() {
    return new Promise((resolve, reject) => {
        console.log('Проверка firebase:', typeof firebase);
        
        if (typeof firebase === 'undefined') {
            console.error('Firebase НЕ загружен!');
            reject(new Error('Firebase SDK не загружен'));
            return;
        }
        
        try {
            db = firebase.database();
            roomsRef = db.ref('rooms');
            firebaseReady = true;
            console.log('Firebase Database готова');
            resolve(true);
        } catch (error) {
            console.error('Ошибка Firebase Database:', error);
            reject(error);
        }
    });
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < CONFIG.ROOM_CODE_LENGTH; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function createRoom(roomName, maxPlayers, hostId, hostName) {
    console.log('createRoom вызвана, firebaseReady:', firebaseReady);
    
    if (!firebaseReady) {
        console.error('Firebase НЕ готова!');
        return Promise.reject(new Error('Firebase не готова'));
    }
    
    const roomCode = generateRoomCode();
    console.log('Код комнаты:', roomCode);
    
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
    
    console.log('Данные комнаты:', roomData);
    console.log('Запись в Firebase...');
    
    return roomsRef.child(roomCode).set(roomData)
        .then(() => {
            console.log('Комната создана в Firebase:', roomCode);
            currentRoomId = roomCode;
            return { success: true, roomId: roomCode, roomData };
        })
        .catch((error) => {
            console.error('Ошибка записи в Firebase:', error);
            return { success: false, error: error.message };
        });
}

function joinRoom(roomCode, playerId, playerName) {
    if (!firebaseReady) {
        return Promise.reject(new Error('Firebase не готова'));
    }
    
    return roomsRef.child(roomCode.toUpperCase()).once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                return { success: false, error: 'Комната не найдена' };
            }
            
            const roomData = snapshot.val();
            
            if (Object.keys(roomData.players || {}).length >= roomData.maxPlayers) {
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
            
            return roomsRef.child(roomCode.toUpperCase()).child('players').child(playerId).set(playerData)
                .then(() => {
                    currentRoomId = roomCode.toUpperCase();
                    console.log('Присоединился к комнате:', roomCode);
                    return { success: true, roomId: roomCode.toUpperCase(), roomData };
                });
        })
        .catch((error) => {
            console.error('Ошибка присоединения:', error);
            return { success: false, error: error.message };
        });
}

function leaveRoom(roomCode, playerId) {
    if (!firebaseReady) return Promise.resolve({ success: false, error: 'Firebase не готова' });
    
    return roomsRef.child(roomCode).child('players').child(playerId).remove()
        .then(() => {
            currentRoomId = null;
            return { success: true };
        })
        .catch((error) => {
            return { success: false, error: error.message };
        });
}

function subscribeToRoom(roomCode, callbacks) {
    if (!firebaseReady) return null;
    
    if (unsubscribeRoom) unsubscribeRoom();
    
    unsubscribeRoom = roomsRef.child(roomCode).on('value', (snapshot) => {
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

function updatePlayerReady(roomCode, playerId, ready) {
    if (!firebaseReady) return Promise.resolve({ success: false });
    
    return roomsRef.child(roomCode).child('players').child(playerId).child('ready').set(ready)
        .then(() => ({ success: true }))
        .catch(() => ({ success: false }));
}

function startGame(roomCode) {
    if (!firebaseReady) return Promise.resolve({ success: false, error: 'Firebase не готова' });
    
    return roomsRef.child(roomCode).once('value')
        .then((snapshot) => {
            const roomData = snapshot.val();
            const playerIds = Object.keys(roomData.players || {});
            
            if (playerIds.length < 2) {
                return { success: false, error: 'Нужно минимум 2 игрока' };
            }
            
            const killerIndex = Math.floor(Math.random() * playerIds.length);
            const updates = {};
            
            playerIds.forEach((id, index) => {
                updates[`players/${id}/role`] = index === killerIndex ? 'killer' : 'survivor';
            });
            
            const generators = {};
            for (let i = 1; i <= CONFIG.GENERATOR_COUNT; i++) {
                generators[i] = { id: i, repaired: false, progress: 0, repairingBy: null };
            }
            
            updates.status = 'playing';
            updates.generators = generators;
            updates.startedAt = Date.now();
            
            return roomsRef.child(roomCode).update(updates)
                .then(() => {
                    console.log('Игра началась:', roomCode);
                    return { success: true };
                });
        })
        .catch((error) => {
            return { success: false, error: error.message };
        });
}

function updatePlayerPosition(roomCode, playerId, x, y, rotation) {
    if (!firebaseReady) return;
    
    roomsRef.child(roomCode).child('players').child(playerId).update({
        x: x, y: y, rotation: rotation, lastUpdate: Date.now()
    }).catch(() => {});
}

function updateGenerator(roomCode, generatorId, data) {
    if (!firebaseReady) return;
    
    roomsRef.child(roomCode).child('generators').child(generatorId).update(data).catch(() => {});
}

function setPlayerCaught(roomCode, playerId) {
    if (!firebaseReady) return;
    
    roomsRef.child(roomCode).child('players').child(playerId).update({
        caught: true, caughtAt: Date.now()
    }).catch(() => {});
}

function endGame(roomCode, result) {
    if (!firebaseReady) return Promise.resolve({ success: false });
    
    return roomsRef.child(roomCode).update({
        status: 'finished', result: result, endedAt: Date.now()
    }).then(() => ({ success: true }))
    .catch(() => ({ success: false }));
}

function getCurrentRoomId() {
    return currentRoomId;
}

function isFirebaseReady() {
    return firebaseReady;
}
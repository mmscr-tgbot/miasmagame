// ═══════ ROOM MANAGER (Realtime Database) ═══════

const Room = {
    currentRoom: null,
    isHost: false,
    playerId: null,
    roomUnsubscribe: null,

    // Создать лобби
    async create(roomName, maxPlayers) {
        this.playerId = this.getTelegramUserId() || this.getCurrentUser()?.uid;

        if (!this.playerId) {
            return { success: false, error: 'Игрок не найден' };
        }

        const result = await createRoom(roomName, maxPlayers, this.playerId, 'Хост');

        if (result.success) {
            this.currentRoom = result.roomData;
            this.isHost = true;

            await joinRoom(result.roomId, this.playerId, 'Хост');

            return { success: true, roomCode: result.roomId };
        }

        return { success: false, error: result.error };
    },

    // Присоединиться к лобби
    async join(roomCode) {
        this.playerId = this.getTelegramUserId() || this.getCurrentUser()?.uid;

        if (!this.playerId) {
            return { success: false, error: 'Игрок не найден' };
        }

        const result = await joinRoom(roomCode, this.playerId, 'Игрок');

        if (result.success) {
            this.currentRoom = result.roomData;
            this.isHost = false;

            return { success: true, roomCode: result.roomId };
        }

        return { success: false, error: result.error };
    },

    // Выйти из лобби
    async leave() {
        if (this.currentRoom && this.playerId) {
            const wasKiller = (this.currentRoom.players?.[this.playerId]?.role === 'killer');

            if (wasKiller) {
                // Если убийца выходит - удаляем комнату
                await deleteRoom(this.currentRoom.code);
            } else {
                // Иначе просто удаляем игрока
                await leaveRoom(this.currentRoom.code, this.playerId);
            }

            this.currentRoom = null;
            this.isHost = false;
            this.unsubscribeFromRoom();
        }
    },

    // Установить готовность
    async setReady(ready) {
        if (this.currentRoom && this.playerId) {
            await updatePlayerReady(this.currentRoom.code, this.playerId, ready);
        }
    },

    // Начать игру
    async startGame() {
        if (this.currentRoom && this.isHost) {
            const result = await startGame(this.currentRoom.code);
            if (result.success) {
                // Initialize game session for sync
                await initGameSession(this.currentRoom.code, this.playerId, true);
                initializeGenerators(this.currentRoom.code);
            }
            return result;
        }
        return { success: false, error: 'Только хост может начать игру' };
    },

    // Получить код комнаты
    getRoomCode() {
        return this.currentRoom?.code || null;
    },

    // Получить игроков
    getPlayers() {
        return this.currentRoom?.players || {};
    },

    // Получить макс. игроков
    getMaxPlayers() {
        return this.currentRoom?.maxPlayers || 4;
    },

    // Является ли хостом
    isPlayerHost() {
        return this.isHost;
    },

    // Получить ID игрока
    getPlayerId() {
        return this.playerId;
    },

    // Подписаться на изменения комнаты
    subscribeToRoom(callbacks) {
        if (this.currentRoom) {
            this.roomUnsubscribe = subscribeToRoom(this.currentRoom.code, {
                onUpdate: (roomData) => {
                    this.currentRoom = roomData;
                    if (callbacks.onUpdate) callbacks.onUpdate(roomData);
                },
                onError: callbacks.onError
            });
            return this.roomUnsubscribe;
        }
        return null;
    },

    // Отписаться от комнаты
    unsubscribeFromRoom() {
        if (this.roomUnsubscribe) {
            this.roomUnsubscribe();
            this.roomUnsubscribe = null;
        }
    },

    // Получить ID пользователя Telegram
    getTelegramUserId() {
        try {
            if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
                const user = Telegram.WebApp.initDataUnsafe.user;
                if (user) return 'tg_' + user.id;
            }
        } catch (e) {}

        // Локальный ID
        const stored = localStorage.getItem('uid');
        if (stored) return stored;

        const id = 'g_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        localStorage.setItem('uid', id);
        return id;
    },

    // Получить текущего пользователя
    getCurrentUser() {
        const userId = this.getTelegramUserId();
        return {
            uid: userId,
            name: this.getPlayerName(),
            isTelegram: userId.startsWith('tg_')
        };
    },

    // Получить имя игрока
    getPlayerName() {
        try {
            if (typeof Telegram !== 'undefined' && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
                const user = Telegram.WebApp.initDataUnsafe.user;
                if (user) return user.first_name || 'Игрок';
            }
        } catch (e) {}
        return 'Игрок';
    }
};

// ═══════ FIREBASE ROOM FUNCTIONS ═══════

let db;
let roomsRef;
let currentRoomId = null;
let unsubscribeRoom = null;
let firebaseReady = false;

// Инициализация Firebase Database
function initFirebaseDB() {
    return new Promise((resolve, reject) => {
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

// Генерация кода комнаты
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Создать комнату
function createRoom(roomName, maxPlayers, hostId, hostName) {
    if (!firebaseReady) {
        return Promise.reject(new Error('Firebase не готова'));
    }

    const roomCode = generateRoomCode();

    const roomData = {
        code: roomCode,
        name: roomName || 'Комната',
        maxPlayers: maxPlayers || 4,
        hostId: hostId,
        hostName: hostName,
        status: 'waiting',
        createdAt: Date.now(),
        players: {
            [hostId]: {
                id: hostId,
                name: hostName,
                role: 'killer',
                isHost: true,
                ready: true,
                joinedAt: Date.now()
            }
        },
        generators: {},
        gameState: null
    };

    return roomsRef.child(roomCode).set(roomData)
        .then(() => {
            currentRoomId = roomCode;
            return { success: true, roomId: roomCode, roomData };
        })
        .catch((error) => {
            console.error('Ошибка записи в Firebase:', error);
            return { success: false, error: error.message };
        });
}

// Присоединиться к комнате
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
                name: playerName,
                role: 'survivor',
                isHost: false,
                ready: true,
                connected: true,
                joinedAt: Date.now()
            };

            return roomsRef.child(roomCode.toUpperCase()).child('players').child(playerId).set(playerData)
                .then(() => {
                    currentRoomId = roomCode.toUpperCase();
                    return { success: true, roomId: roomCode.toUpperCase(), roomData: { ...roomData, players: { ...roomData.players, [playerId]: playerData } } };
                });
        })
        .catch((error) => {
            console.error('Ошибка присоединения:', error);
            return { success: false, error: error.message };
        });
}

// Выйти из комнаты
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

// Удалить комнату
function deleteRoom(roomCode) {
    if (!firebaseReady) return Promise.resolve({ success: false, error: 'Firebase не готова' });

    return roomsRef.child(roomCode).remove()
        .then(() => {
            currentRoomId = null;
            return { success: true };
        })
        .catch((error) => {
            return { success: false, error: error.message };
        });
}

// Подписаться на изменения комнаты
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

// Отписаться от комнаты
function unsubscribeFromRoom() {
    if (unsubscribeRoom) {
        unsubscribeRoom();
        unsubscribeRoom = null;
    }
}

// Обновить готовность игрока
function updatePlayerReady(roomCode, playerId, ready) {
    if (!firebaseReady) return Promise.resolve({ success: false });

    return roomsRef.child(roomCode).child('players').child(playerId).child('ready').set(ready)
        .then(() => ({ success: true }))
        .catch(() => ({ success: false }));
}

// Начать игру
function startGame(roomCode) {
    if (!firebaseReady) return Promise.resolve({ success: false, error: 'Firebase не готова' });

    return roomsRef.child(roomCode).once('value')
        .then((snapshot) => {
            const roomData = snapshot.val();
            const playerIds = Object.keys(roomData.players || {});

            if (playerIds.length < 2) {
                return { success: false, error: 'Нужно минимум 2 игрока' };
            }

            // Случайно выбираем убийцу (не хост, если хост уже убийца)
            const killerIndex = 0; // Хост всегда убийца при создании
            const updates = {};

            playerIds.forEach((id, index) => {
                updates[`players/${id}/role`] = index === killerIndex ? 'killer' : 'survivor';
            });

            const generators = {};
            for (let i = 0; i < 5; i++) {
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

// Обновить позицию игрока
function updatePlayerPosition(roomCode, playerId, x, y, rotation) {
    if (!firebaseReady) return;

    roomsRef.child(roomCode).child('players').child(playerId).update({
        x: x, y: y, rotation: rotation, lastUpdate: Date.now()
    }).catch(() => {});
}

// Обновить генератор
function updateGenerator(roomCode, generatorId, data) {
    if (!firebaseReady) return;

    roomsRef.child(roomCode).child('generators').child(generatorId).update(data).catch(() => {});
}

// Получить текущую комнату
function getCurrentRoomId() {
    return currentRoomId;
}

// Проверить готовность Firebase
function isFirebaseReady() {
    return firebaseReady && typeof firebase !== 'undefined' && roomsRef;
}

// ═══════ EXPORTS ═══════

window.Room = Room;
window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.deleteRoom = deleteRoom;
window.subscribeToRoom = subscribeToRoom;
window.unsubscribeFromRoom = unsubscribeFromRoom;
window.updatePlayerReady = updatePlayerReady;
window.startGame = startGame;

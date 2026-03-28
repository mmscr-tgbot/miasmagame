// ═══════ FIREBASE DATABASE - GAME SYNC ═══════
// Синхронизация игры через Firebase Realtime Database

let db;
let gameSessionRef = null;
let gameUnsubscribe = null;
let firebaseReady = false;

// ═══════ INIT ═══════

function initFirebaseDB() {
    return new Promise((resolve, reject) => {
        if (typeof firebase === 'undefined') {
            console.error('Firebase НЕ загружен!');
            reject(new Error('Firebase SDK не загружен'));
            return;
        }

        try {
            db = firebase.database();
            firebaseReady = true;
            console.log('Firebase Database готова');
            resolve(true);
        } catch (error) {
            console.error('Ошибка Firebase Database:', error);
            reject(error);
        }
    });
}

function isFirebaseReady() {
    return firebaseReady && typeof firebase !== 'undefined' && db !== null && db !== undefined;
}

// ═══════ GAME SESSION SYNC ═══════

// Инициализация игровой сессии
function initGameSession(roomCode, playerId, isKiller) {
    if (!firebaseReady) return Promise.reject(new Error('Firebase не готова'));

    gameSessionRef = db.ref('gameSessions/' + roomCode);

    const playerData = {
        id: playerId,
        role: isKiller ? 'killer' : 'survivor',
        x: isKiller ? 600 : 150 + Math.random() * 100,
        y: isKiller ? 450 : 150 + Math.random() * 100,
        state: 'alive',
        health: isKiller ? null : 100,
        lastUpdate: Date.now()
    };

    return gameSessionRef.child('players').child(playerId).set(playerData)
        .then(() => {
            console.log('Игрок добавлен в сессию:', playerId);
            return true;
        });
}

// Обновить состояние игрока
function updatePlayerState(roomCode, playerId, state) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).update({
        state: state,
        lastUpdate: Date.now()
    }).catch(() => {});
}

// Обновить здоровье игрока
function updatePlayerHealth(roomCode, playerId, health) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).update({
        health: health,
        lastUpdate: Date.now()
    }).catch(() => {});
}

// Отправить позицию игрока
function sendPlayerPosition(roomCode, playerId, x, y) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).update({
        x: x,
        y: y,
        lastUpdate: Date.now()
    }).catch(() => {});
}

// Обновить прогресс генератора
function updateGeneratorProgress(roomCode, generatorId, progress, repaired, repairingBy) {
    if (!firebaseReady || !db) return;

    const updates = {
        progress: progress,
        repaired: repaired,
        lastUpdate: Date.now()
    };
    if (repairingBy !== undefined) {
        updates.repairingBy = repairingBy;
    }

    db.ref('gameSessions/' + roomCode).child('generators').child(generatorId).update(updates)
        .catch(() => {});
}

// Открыть ворота
function setGateOpened(roomCode, opened) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('gate').set({
        opened: opened,
        openedAt: opened ? Date.now() : null
    }).catch(() => {});
}

// Создать люк
function setHatchSpawned(roomCode, x, y) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('hatch').set({
        spawned: true,
        x: x,
        y: y,
        opened: true,
        closedByKiller: false
    }).catch(() => {});
}

// Закрыть люк
function closeHatch(roomCode) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('hatch').update({
        opened: false,
        closedByKiller: true
    }).catch(() => {});
}

// Повесить выжившего на крюк
function hookSurvivor(roomCode, playerId, hookId) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).update({
        state: 'hooked',
        hookedAt: Date.now(),
        hookId: hookId
    }).catch(() => {});
}

// Снять с крюка
function unhookSurvivor(roomCode, playerId) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).update({
        state: 'injured',
        health: 50,
        hookedAt: null,
        hookId: null
    }).catch(() => {});
}

// Убить игрока
function setPlayerDead(roomCode, playerId) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).update({
        state: 'dead',
        deadAt: Date.now()
    }).catch(() => {});
}

// Ранить игрока
function setPlayerInjured(roomCode, playerId) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).update({
        state: 'injured',
        health: 50,
        injuredAt: Date.now()
    }).catch(() => {});
}

// Игрок упал (dying state)
function setPlayerDying(roomCode, playerId) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).update({
        state: 'dying',
        dyingAt: Date.now()
    }).catch(() => {});
}

// Убийца несёт выжившего
function setPlayerCarrying(roomCode, killerId, survivorId) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(killerId).update({
        state: 'carrying',
        carryingId: survivorId
    }).catch(() => {});
}

// Убийца отпустил выжившего
function setPlayerIdle(roomCode, playerId) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).update({
        state: 'alive',
        carryingId: null
    }).catch(() => {});
}

// Установить результат игры
function setGameResult(roomCode, winner, message) {
    if (!firebaseReady || !db) return;

    return db.ref('gameSessions/' + roomCode).update({
        status: 'finished',
        winner: winner,
        resultMessage: message,
        endedAt: Date.now()
    }).catch(() => {});
}

// ═══════ SUBSCRIBE ═══════

// Подписаться на изменения сессии
function subscribeToGameSession(roomCode, callbacks) {
    if (!firebaseReady || !db) return null;

    if (gameUnsubscribe) gameUnsubscribe();

    const sessionRef = db.ref('gameSessions/' + roomCode);

    gameUnsubscribe = sessionRef.on('value', (snapshot) => {
        if (!snapshot.exists()) return;

        const data = snapshot.val();

        if (callbacks.onPlayersUpdate) {
            callbacks.onPlayersUpdate(data.players || {});
        }

        if (callbacks.onGeneratorsUpdate) {
            callbacks.onGeneratorsUpdate(data.generators || {});
        }

        if (callbacks.onGateUpdate && data.gate) {
            callbacks.onGateUpdate(data.gate);
        }

        if (callbacks.onHatchUpdate && data.hatch) {
            callbacks.onHatchUpdate(data.hatch);
        }

        if (callbacks.onStatusUpdate) {
            callbacks.onStatusUpdate(data.status || 'waiting');
        }

        if (callbacks.onGameResult && data.status === 'finished') {
            callbacks.onGameResult(data.winner, data.resultMessage);
        }
    }, (error) => {
        if (callbacks.onError) {
            callbacks.onError(error);
        }
    });

    return gameUnsubscribe;
}

// Отписаться от сессии
function unsubscribeFromGameSession() {
    if (gameUnsubscribe) {
        gameUnsubscribe();
        gameUnsubscribe = null;
    }
    gameSessionRef = null;
}

// Очистить сессию
function cleanupGameSession(roomCode) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).remove().catch(() => {});
}

// Выйти из сессии
function leaveGameSession(roomCode, playerId) {
    if (!firebaseReady || !db) return;

    db.ref('gameSessions/' + roomCode).child('players').child(playerId).remove()
        .catch(() => {});

    unsubscribeFromGameSession();
}

// Инициализировать генераторы
function initializeGenerators(roomCode) {
    if (!firebaseReady || !db) return;

    const generators = {};
    for (let i = 0; i < CONFIG.GENERATOR_COUNT; i++) {
        generators[i] = {
            id: i,
            progress: 0,
            repaired: false,
            repairingBy: null,
            lastUpdate: Date.now()
        };
    }

    db.ref('gameSessions/' + roomCode).child('generators').set(generators)
        .catch(() => {});
}

// Проверить все ли генераторы починены
function checkAllGeneratorsRepaired(roomCode) {
    if (!firebaseReady || !db) return false;

    return db.ref('gameSessions/' + roomCode).child('generators')
        .once('value')
        .then((snapshot) => {
            const gens = snapshot.val();
            if (!gens) return false;

            const allRepaired = Object.values(gens).every(g => g.repaired);
            return allRepaired;
        })
        .catch(() => false);
}

// ═══════ EXPORTS ═══════

window.initFirebaseDB = initFirebaseDB;
window.isFirebaseReady = isFirebaseReady;
window.initGameSession = initGameSession;
window.updatePlayerState = updatePlayerState;
window.updatePlayerHealth = updatePlayerHealth;
window.sendPlayerPosition = sendPlayerPosition;
window.updateGeneratorProgress = updateGeneratorProgress;
window.setGateOpened = setGateOpened;
window.setHatchSpawned = setHatchSpawned;
window.closeHatch = closeHatch;
window.hookSurvivor = hookSurvivor;
window.unhookSurvivor = unhookSurvivor;
window.setPlayerDead = setPlayerDead;
window.setPlayerInjured = setPlayerInjured;
window.setPlayerDying = setPlayerDying;
window.setPlayerCarrying = setPlayerCarrying;
window.setPlayerIdle = setPlayerIdle;
window.setGameResult = setGameResult;
window.subscribeToGameSession = subscribeToGameSession;
window.unsubscribeFromGameSession = unsubscribeFromGameSession;
window.cleanupGameSession = cleanupGameSession;
window.leaveGameSession = leaveGameSession;
window.initializeGenerators = initializeGenerators;
window.checkAllGeneratorsRepaired = checkAllGeneratorsRepaired;

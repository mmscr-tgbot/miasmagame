const UI = {
    screens: {},
    currentScreen: null,
    
    init() {
        this.screens = {
            loading: document.getElementById('loading-screen'),
            mainMenu: document.getElementById('main-menu'),
            createRoom: document.getElementById('create-room'),
            joinRoom: document.getElementById('join-room'),
            lobby: document.getElementById('lobby'),
            gameScreen: document.getElementById('game-screen'),
            gameOver: document.getElementById('game-over')
        };
        
        this.setupEventListeners();
    },
    
    setupEventListeners() {
        document.getElementById('btn-create-room').addEventListener('click', () => {
            this.showScreen('createRoom');
        });
        
        document.getElementById('btn-join-room').addEventListener('click', () => {
            this.showScreen('joinRoom');
        });
        
        document.getElementById('btn-back-create').addEventListener('click', () => {
            this.showScreen('mainMenu');
        });
        
        document.getElementById('btn-back-join').addEventListener('click', () => {
            this.showScreen('mainMenu');
        });
        
        document.getElementById('btn-create').addEventListener('click', async () => {
            const roomName = document.getElementById('room-name').value.trim() || 'Комната';
            const maxPlayers = parseInt(document.getElementById('max-players').value);
            
            const user = getCurrentUser();
            const userId = getTelegramUserId() || user?.uid || 'user_' + Date.now();
            const userName = 'Игрок' + userId.slice(-4);
            
            const result = await createRoom(roomName, maxPlayers, userId, userName);
            
            if (result.success) {
                await joinRoom(result.roomId, userId, userName);
                this.showScreen('lobby');
                this.updateLobby(result.roomData);
            } else {
                this.showToast('Ошибка: ' + result.error);
            }
        });
        
        document.getElementById('btn-join').addEventListener('click', async () => {
            const roomCode = document.getElementById('join-code').value.trim().toUpperCase();
            
            if (!roomCode || roomCode.length < 4) {
                this.showToast('Введите код комнаты');
                return;
            }
            
            const user = getCurrentUser();
            const userId = getTelegramUserId() || user?.uid || 'user_' + Date.now();
            const userName = 'Игрок' + userId.slice(-4);
            
            const result = await joinRoom(roomCode, userId, userName);
            
            if (result.success) {
                this.showScreen('lobby');
                this.updateLobby(result.roomData);
            } else {
                this.showToast('Ошибка: ' + result.error);
            }
        });
        
        document.getElementById('btn-start').addEventListener('click', async () => {
            const roomId = getCurrentRoomId();
            const userId = getTelegramUserId() || getCurrentUser()?.uid;
            
            if (roomId && userId) {
                const result = await startGame(roomId);
                if (!result.success) {
                    this.showToast('Ошибка: ' + result.error);
                }
            }
        });
        
        document.getElementById('btn-leave').addEventListener('click', async () => {
            const roomId = getCurrentRoomId();
            const userId = getTelegramUserId() || getCurrentUser()?.uid;
            
            if (roomId && userId) {
                await leaveRoom(roomId, userId);
                unsubscribeFromRoom();
                this.showScreen('mainMenu');
            }
        });
        
        document.getElementById('btn-back-menu').addEventListener('click', () => {
            this.showScreen('mainMenu');
        });
    },
    
    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen.classList.remove('active');
        });
        
        if (this.screens[screenName]) {
            this.screens[screenName].classList.add('active');
            this.currentScreen = screenName;
        }
        
        window.scrollTo(0, 0);
    },
    
    updateLobby(roomData) {
        const displayCode = document.getElementById('display-room-code');
        const playersList = document.getElementById('players-list');
        const lobbyStatus = document.getElementById('lobby-status');
        const btnStart = document.getElementById('btn-start');
        
        displayCode.textContent = roomData.code || '---';
        
        const players = roomData.players || {};
        const playerCount = Object.keys(players).length;
        
        playersList.innerHTML = '';
        
        const maxPlayers = roomData.maxPlayers || 4;
        
        for (let i = 0; i < maxPlayers; i++) {
            const player = players[Object.keys(players)[i]];
            
            if (player) {
                const playerEl = document.createElement('div');
                playerEl.className = 'player-slot';
                
                const statusClass = player.ready ? 'ready' : '';
                const roleClass = player.role === 'killer' ? 'killer' : (player.role === 'survivor' ? 'survivor' : '');
                
                playerEl.innerHTML = `
                    <span class="player-status ${statusClass}"></span>
                    <span>${player.name}</span>
                    ${player.role ? `<span style="margin-left: auto; font-size: 12px;">(${player.role === 'killer' ? 'Убийца' : 'Выживший'})</span>` : ''}
                `;
                
                if (roleClass) playerEl.classList.add(roleClass);
                playersList.appendChild(playerEl);
            } else {
                const emptySlot = document.createElement('div');
                emptySlot.className = 'player-slot empty';
                emptySlot.textContent = 'Ожидание игрока...';
                playersList.appendChild(emptySlot);
            }
        }
        
        if (roomData.status === 'playing') {
            lobbyStatus.textContent = 'Игра началась!';
            btnStart.disabled = true;
        } else if (playerCount >= CONFIG.MIN_PLAYERS_TO_START) {
            lobbyStatus.textContent = `Игроков: ${playerCount}/${maxPlayers}. Готовы кstart`;
            btnStart.disabled = false;
        } else {
            lobbyStatus.textContent = `Игроков: ${playerCount}/${maxPlayers}. Нужно минимум ${CONFIG.MIN_PLAYERS_TO_START}`;
            btnStart.disabled = true;
        }
        
        subscribeToRoom(roomData.code, {
            onUpdate: (data) => {
                if (data) {
                    this.updateLobby(data);
                    
                    if (data.status === 'playing') {
                        Game.start(data);
                    }
                }
            }
        });
    },
    
    showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, duration);
    },
    
    updateHUD(role, generators, exitOpen, aliveCount) {
        const roleIndicator = document.getElementById('role-indicator');
        const playerRole = document.getElementById('player-role');
        const genInfo = document.getElementById('generators-info');
        const genCount = document.getElementById('gen-count');
        const exitStatus = document.getElementById('exit-status');
        const exitState = document.getElementById('exit-state');
        const playerListHud = document.getElementById('player-list-hud');
        const aliveCountEl = document.getElementById('alive-count');
        
        roleIndicator.classList.remove('hidden');
        playerRole.textContent = role === 'killer' ? 'Убийца' : 'Выживший';
        
        genInfo.classList.remove('hidden');
        const repairedGens = Object.values(generators || {}).filter(g => g.repaired).length;
        genCount.textContent = `${repairedGens}/${CONFIG.GENERATOR_COUNT}`;
        
        exitStatus.classList.remove('hidden');
        exitState.textContent = exitOpen ? 'открыт' : 'закрыт';
        
        playerListHud.classList.remove('hidden');
        aliveCountEl.textContent = `Выжившие: ${aliveCount}`;
    },
    
    showGameOver(result, message) {
        const title = document.getElementById('game-result-title');
        const msg = document.getElementById('game-result-message');
        
        title.textContent = result === 'survivors_win' ? 'Победа выживших!' : 'Победа убийцы!';
        msg.textContent = message || (result === 'survivors_win' ? 'Все выжившие сбежали!' : 'Убийца поймал всех!');
        
        this.showScreen('gameOver');
    },
    
    showLoading(show) {
        const loading = document.getElementById('loading-screen');
        if (show) {
            loading.classList.add('active');
        } else {
            loading.classList.remove('active');
        }
    }
};
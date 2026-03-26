const Room = {
    currentRoom: null,
    isHost: false,
    playerId: null,
    
    async create(roomName, maxPlayers) {
        this.playerId = getTelegramUserId() || getCurrentUser()?.uid;
        
        const result = await createRoom(roomName, maxPlayers, this.playerId, 'Хост');
        
        if (result.success) {
            this.currentRoom = result.roomData;
            this.isHost = true;
            
            await joinRoom(result.roomId, this.playerId, 'Хост');
            
            return { success: true, roomCode: result.roomId };
        }
        
        return { success: false, error: result.error };
    },
    
    async join(roomCode) {
        this.playerId = getTelegramUserId() || getCurrentUser()?.uid;
        
        const result = await joinRoom(roomCode, this.playerId, 'Игрок');
        
        if (result.success) {
            this.currentRoom = result.roomData;
            this.isHost = false;
            
            return { success: true, roomCode: result.roomId };
        }
        
        return { success: false, error: result.error };
    },
    
    async leave() {
        if (this.currentRoom && this.playerId) {
            await leaveRoom(this.currentRoom.code, this.playerId);
            this.currentRoom = null;
            this.isHost = false;
            unsubscribeFromRoom();
        }
    },
    
    async setReady(ready) {
        if (this.currentRoom && this.playerId) {
            await updatePlayerReady(this.currentRoom.code, this.playerId, ready);
        }
    },
    
    async startGame() {
        if (this.currentRoom && this.isHost) {
            return await startGame(this.currentRoom.code);
        }
        return { success: false, error: 'Только хост может начать игру' };
    },
    
    getRoomCode() {
        return this.currentRoom?.code || null;
    },
    
    getPlayers() {
        return this.currentRoom?.players || {};
    },
    
    getMaxPlayers() {
        return this.currentRoom?.maxPlayers || 4;
    },
    
    isPlayerHost() {
        return this.isHost;
    },
    
    getPlayerId() {
        return this.playerId;
    },
    
    subscribeToRoom(callbacks) {
        if (this.currentRoom) {
            return subscribeToRoom(this.currentRoom.code, callbacks);
        }
        return null;
    }
};
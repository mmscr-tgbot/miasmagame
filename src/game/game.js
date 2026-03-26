const Game = {
    phaser: null,
    scene: null,
    player: null,
    otherPlayers: {},
    generators: {},
    roomCode: null,
    playerId: null,
    playerRole: null,
    isKiller: false,
    isPlaying: false,
    exitOpen: false,
    catchCooldown: 0,
    
    init(containerId) {
        const config = {
            type: Phaser.AUTO,
            parent: containerId,
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: '#1a1a2e',
            physics: {
                default: 'arcade',
                arcade: {
                    debug: false,
                    gravity: { y: 0 }
                }
            },
            scene: {
                preload: this.preload.bind(this),
                create: this.create.bind(this),
                update: this.update.bind(this)
            }
        };
        
        this.phaser = new Phaser.Game(config);
        
        window.addEventListener('resize', () => {
            if (this.phaser) {
                this.phaser.scale.resize(window.innerWidth, window.innerHeight);
            }
        });
    },
    
    preload() {
        this.createPlaceholderGraphics();
    },
    
    createPlaceholderGraphics() {
        const graphics = this.make.graphics();
        
        graphics.fillStyle(0xff3333);
        graphics.fillCircle(20, 20, 20);
        graphics.generateTexture('killer', 40, 40);
        graphics.clear();
        
        graphics.fillStyle(0x33ff33);
        graphics.fillCircle(15, 15, 15);
        graphics.generateTexture('survivor', 30, 30);
        graphics.clear();
        
        graphics.fillStyle(0x4444ff);
        graphics.fillRect(0, 0, 30, 30);
        graphics.generateTexture('generator', 30, 30);
        graphics.clear();
        
        graphics.fillStyle(0x222222);
        graphics.fillRect(0, 0, 40, 40);
        graphics.generateTexture('wall', 40, 40);
        graphics.clear();
        
        graphics.fillStyle(0x00ff00);
        graphics.fillRect(0, 0, 60, 20);
        graphics.generateTexture('exit', 60, 20);
        graphics.clear();
    },
    
    create() {
        this.scene = this;
        
        this.mapSize = 800;
        
        this.add.rectangle(0, 0, this.mapSize, this.mapSize, 0x1a1a2e).setOrigin(0);
        
        this.add.grid(this.mapSize / 2, this.mapSize / 2, this.mapSize, this.mapSize, 40, 40, 0x222233).setAlpha(0.3);
        
        this.createWalls();
        
        this.exitPoint = this.add.rectangle(this.mapSize - 60, this.mapSize / 2, 60, 80, 0x444444).setOrigin(0);
        
        this.cameras.main.setBounds(0, 0, this.mapSize, this.mapSize);
        this.cameras.main.setZoom(1);
        
        Input.init(this);
        
        subscribeToRoom(this.roomCode, {
            onUpdate: (data) => {
                this.onRoomUpdate(data);
            }
        });
    },
    
    createWalls() {
        const wallPositions = [
            { x: 200, y: 200, w: 20, h: 150 },
            { x: 200, y: 200, w: 150, h: 20 },
            { x: 500, y: 150, w: 20, h: 120 },
            { x: 350, y: 400, w: 180, h: 20 },
            { x: 600, y: 350, w: 20, h: 150 },
            { x: 150, y: 500, w: 120, h: 20 },
            { x: 450, y: 600, w: 20, h: 100 },
            { x: 650, y: 550, w: 100, h: 20 }
        ];
        
        wallPositions.forEach(wall => {
            this.add.rectangle(wall.x, wall.y, wall.w, wall.h, 0x333344).setOrigin(0);
        });
    },
    
    start(roomData) {
        this.roomCode = getCurrentRoomId();
        this.playerId = getTelegramUserId() || getCurrentUser()?.uid;
        
        this.isPlaying = true;
        
        UI.showScreen('gameScreen');
        
        setTimeout(() => {
            this.init('game-container');
            
            this.setupPlayer(roomData);
            this.setupGenerators(roomData.generators);
            
            const role = roomData.players[this.playerId]?.role;
            this.setRole(role);
            
            UI.updateHUD(this.playerRole, this.generators, this.exitOpen, this.countAliveSurvivors(roomData.players));
        }, 100);
    },
    
    setupPlayer(roomData) {
        const playerData = roomData.players[this.playerId];
        
        if (!playerData) return;
        
        this.playerRole = playerData.role;
        this.isKiller = playerData.role === 'killer';
        
        const texture = this.isKiller ? 'killer' : 'survivor';
        const startX = this.isKiller ? this.mapSize / 2 : 100 + Math.random() * 200;
        const startY = this.isKiller ? this.mapSize / 2 : this.mapSize - 100 - Math.random() * 200;
        
        this.player = this.phaser.scene.scenes[0].add.circle(startX, startY, this.isKiller ? 20 : 15, this.isKiller ? 0xff3333 : 0x33ff33);
        this.player.role = this.playerRole;
        
        if (this.phaser.scene.scenes[0].physics) {
            this.phaser.scene.scenes[0].physics.add.existing(this.player);
            this.player.body.setCollideWorldBounds(true);
        }
        
        this.cameras.main.startFollow(this.player);
    },
    
    setupGenerators(generatorData) {
        const positions = [
            { x: 150, y: 150 },
            { x: 650, y: 150 },
            { x: 400, y: 300 },
            { x: 150, y: 650 },
            { x: 650, y: 650 }
        ];
        
        positions.forEach((pos, index) => {
            const gen = this.phaser.scene.scenes[0].add.sprite(pos.x, pos.y, 'generator');
            gen.generatorId = index + 1;
            gen.progress = 0;
            gen.isRepaired = false;
            gen.repairingBy = null;
            
            this.generators[gen.generatorId] = gen;
        });
    },
    
    setRole(role) {
        this.playerRole = role;
        this.isKiller = role === 'killer';
        
        if (this.player) {
            this.player.setFillStyle(this.isKiller ? 0xff3333 : 0x33ff33);
            this.player.setRadius(this.isKiller ? 20 : 15);
        }
    },
    
    update(time, delta) {
        if (!this.isPlaying || !this.player || !this.phaser.scene.scenes[0]) return;
        
        const scene = this.phaser.scene.scenes[0];
        
        const joyVector = Input.getJoystickVector();
        
        const speed = this.isKiller ? CONFIG.KILLER_SPEED : CONFIG.PLAYER_SPEED;
        
        const velX = joyVector.x * speed;
        const velY = joyVector.y * speed;
        
        if (scene.player && scene.player.body) {
            scene.player.body.setVelocity(velX, velY);
            
            const pos = {
                x: scene.player.x,
                y: scene.player.y
            };
            
            if (this.roomCode && this.playerId) {
                updatePlayerPosition(this.roomCode, this.playerId, pos.x, pos.y, joyVector.angle);
            }
        }
        
        this.checkInteractions(scene);
        
        if (this.isKiller && this.catchCooldown > 0) {
            this.catchCooldown -= delta / 1000;
        }
        
        this.updateGeneratorProgress(delta);
        
        this.checkWinCondition();
    },
    
    checkInteractions(scene) {
        if (!this.player || !scene.otherPlayers) return;
        
        if (this.isKiller) {
            Object.values(scene.otherPlayers).forEach(other => {
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, other.x, other.y);
                
                if (dist < CONFIG.CATCH_DISTANCE && this.catchCooldown <= 0) {
                    this.catchSurvivor(other.playerId);
                }
            });
        } else {
            Object.values(this.generators).forEach(gen => {
                const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, gen.x, gen.y);
                
                if (dist < 50 && Input.isActionPressed()) {
                    this.repairGenerator(gen);
                }
            });
        }
    },
    
    catchSurvivor(playerId) {
        setPlayerCaught(this.roomCode, playerId);
        
        this.catchCooldown = CONFIG.CATCH_COOLDOWN;
        
        UI.showToast('Игрок пойман!');
    },
    
    repairGenerator(gen) {
        if (gen.isRepaired) return;
        
        gen.progress += 0.5;
        
        if (gen.progress >= 100) {
            gen.isRepaired = true;
            gen.setTint(0x00ff00);
            
            updateGenerator(this.roomCode, gen.generatorId, {
                repaired: true,
                progress: 100
            });
            
            UI.showToast('Генератор починен!');
            
            this.checkExitOpen();
        }
    },
    
    updateGeneratorProgress(delta) {
        Object.values(this.generators).forEach(gen => {
            if (!gen.isRepaired && gen.progress > 0) {
                gen.progress = Math.max(0, gen.progress - delta / 1000 * 5);
                
                updateGenerator(this.roomCode, gen.generatorId, {
                    progress: gen.progress
                });
            }
        });
    },
    
    checkExitOpen() {
        const repairedCount = Object.values(this.generators).filter(g => g.isRepaired).length;
        
        if (repairedCount >= CONFIG.GENERATOR_COUNT && !this.exitOpen) {
            this.exitOpen = true;
            this.exitPoint.setFillStyle(0x00ff00);
            
            UI.showToast('Выход открыт!');
        }
    },
    
    countAliveSurvivors(players) {
        if (!players) return 0;
        
        let count = 0;
        Object.values(players).forEach(p => {
            if (p.role === 'survivor' && !p.caught) {
                count++;
            }
        });
        return count;
    },
    
    checkWinCondition() {
        if (!this.roomData) return;
        
        const survivors = this.countAliveSurvivors(this.roomData.players);
        
        if (this.isKiller) {
            if (survivors === 0) {
                this.endGame('killer_win', 'Убийца поймал всех!');
            }
        } else {
            if (this.exitOpen) {
                this.endGame('survivors_win', 'Вы сбежали!');
            }
        }
    },
    
    endGame(result, message) {
        this.isPlaying = false;
        
        endGame(this.roomCode, result);
        
        UI.showGameOver(result, message);
    },
    
    onRoomUpdate(data) {
        if (!data || !data.players) return;
        
        this.roomData = data;
        
        const players = data.players;
        
        Object.keys(players).forEach(id => {
            if (id === this.playerId) return;
            
            const pData = players[id];
            
            if (!this.otherPlayers[id]) {
                const texture = pData.role === 'killer' ? 'killer' : 'survivor';
                const other = this.phaser.scene.scenes[0].add.circle(pData.x || 400, pData.y || 400, pData.role === 'killer' ? 20 : 15, pData.role === 'killer' ? 0xff3333 : 0x33ff33);
                other.playerId = id;
                other.role = pData.role;
                this.otherPlayers[id] = other;
            } else {
                const other = this.otherPlayers[id];
                other.x = pData.x || other.x;
                other.y = pData.y || other.y;
                
                if (pData.caught) {
                    other.setAlpha(0.3);
                }
            }
        });
        
        if (data.generators) {
            Object.keys(data.generators).forEach(genId => {
                const genData = data.generators[genId];
                const gen = this.generators[genId];
                
                if (gen && genData) {
                    gen.progress = genData.progress || 0;
                    gen.isRepaired = genData.repaired || false;
                    
                    if (gen.isRepaired) {
                        gen.setTint(0x00ff00);
                    }
                }
            });
        }
        
        if (this.playerRole) {
            UI.updateHUD(this.playerRole, this.generators, this.exitOpen, this.countAliveSurvivors(players));
        }
        
        if (data.status === 'finished') {
            this.isPlaying = false;
        }
    },
    
    destroy() {
        if (this.phaser) {
            this.phaser.destroy(true);
            this.phaser = null;
        }
        this.isPlaying = false;
    }
};
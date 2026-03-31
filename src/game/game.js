// ═══════ GAME ENGINE WITH MULTIPLAYER SYNC ═══════

const CONFIG = {
    PLAYER_SPEED: 145,
    KILLER_SPEED: 162,
    INJURED_SPEED: 115,
    DYING_SPEED: 18,
    GENERATOR_COUNT: 5,
    GENS_REQUIRED_FOR_EXIT: 4,
    GENERATOR_REPAIR_RATE: 100 / 28,
    GENERATOR_BREAK_RATE: 100 / 10,
    HEAL_RATE: 100 / 18,
    UNHOOK_RATE: 100 / 4,
    GATE_RATE: 100 / 20,
    HOOK_TIME: 90,
    STUN_TIME: 1.8,
    BOOST_TIME: 2.2,
    CATCH_DISTANCE: 58,
    INTERACT_DISTANCE: 62,
    CATCH_COOLDOWN: 2
};

const MAP_W = 2400;
const MAP_H = 1800;

const UI = {
    showScreen(name) {
        const screens = ['loading-screen', 'main-menu', 'role-select', 'lobby-create', 'lobby-join', 'game-screen', 'game-over'];
        screens.forEach(s => {
            const el = document.getElementById(s);
            if (el) el.classList.remove('active');
        });
        const target = document.getElementById(name);
        if (target) target.classList.add('active');
    },

    showToast(msg, duration = 2500) {
        const t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.remove('show');
        void t.offsetWidth;
        t.classList.add('show');
        if (duration > 0) setTimeout(() => t.classList.remove('show'), duration);
    },

    updateHUD(role, state, genCount, exit, hatch, alive) {
        const roleEl = document.getElementById('player-role');
        const genEl = document.getElementById('gen-count');
        const exitEl = document.getElementById('exit-state');
        const aliveEl = document.getElementById('alive-count');

        if (roleEl) {
            if (role === 'killer') {
                roleEl.textContent = 'Убийца';
            } else {
                const stateText = state === 'injured' ? '🩸Ранен' : state === 'dying' ? '💀Упал' : state === 'hooked' ? '🪝Крюк' : 'жив';
                roleEl.textContent = stateText;
            }
        }
        if (genEl) genEl.textContent = genCount + '/5';
        if (exitEl) exitEl.textContent = exit ? (hatch ? 'люк🔒' : 'открыт!') : 'закрыт';
        if (aliveEl) aliveEl.textContent = '🏃 ' + alive;
    },

    showGameOver(won, message) {
        const title = document.getElementById('game-result-title');
        const msg = document.getElementById('game-result-message');
        if (title) title.textContent = won ? '🎉 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ';
        if (msg) msg.textContent = message || '';
        this.showScreen('game-over');
    }
};

// ═══════ GAME STATE ═══════

let game = null;
let scene = null;
let player = null;
let generators = [];
let hooks = [];
let gates = [];
let pallets = [];
let hatch = null;
let staticGroup = null;

let isKiller = false;
let isMultiplayer = false;
let roomCode = null;
let playerId = null;

let exitOpen = false;
let hatchOpen = false;
let hatchClosed = false;
let survivorsAlive = 0;

let killerStun = 0;
let boostTimer = 0;
let killerSlowdown = 0;
let survivorSpeedBoost = 0;
let killerStrikeTimer = 0;
let isRoomHost = false;

function seededRandom(seed) {
    let s = seed;
    return function() {
        s = Math.sin(s * 9999) * 10000;
        return s - Math.floor(s);
    };
}

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}
let killerAttackCooldown = 0;
let actionPressed = false;
let inputVec = { x: 0, y: 0 };
let isCarryingNearHook = false;
let isNearHatch = false;
let isEscapingHatch = false;
let hatchEscapeProgress = 0;
const HATCH_ESCAPE_TIME = 1.5;
let isNearGate = false;
let isEscapingGate = false;
let gateEscapeProgress = 0;
const GATE_ESCAPE_TIME = 1.5;

let floatBars = [];
let floatBarGfx = null;
let keys = {};

let gameEnded = false;
let localPlayerId = null;

// Remote players for multiplayer
let remotePlayers = {};
let lastPosUpdate = 0;
const POS_UPDATE_INTERVAL = 50;
const POS_LERP_SPEED = 0.15; // Smooth interpolation factor (0.1-0.2 is good)

// ═══════ GAME FUNCTIONS ═══════

function startGame(killerMode, multiplayer = false, code = null, pid = null) {
    isKiller = killerMode;
    isMultiplayer = multiplayer;
    roomCode = code;
    playerId = pid || localPlayerId;

    exitOpen = false;
    hatchOpen = false;
    hatchClosed = false;
    survivorsAlive = isKiller ? 3 : 0;
    killerStun = 0;
    boostTimer = 0;
    killerSlowdown = 0;
    survivorSpeedBoost = 0;
    killerStrikeTimer = 0;
    killerAttackCooldown = 0;
    actionPressed = false;
    inputVec = { x: 0, y: 0 };
    isCarryingNearHook = false;
    isNearHatch = false;
    isEscapingHatch = false;
    hatchEscapeProgress = 0;
    isNearGate = false;
    isEscapingGate = false;
    gateEscapeProgress = 0;
    floatBars = [];
    gameEnded = false;
    remotePlayers = {};

    UI.showScreen('game-screen');
    UI.showToast(isKiller ? '🔪 Поймай всех выживших!' : '⚙️ Почини все генераторы!');

    initGame();
}

function stopGame() {
    removeControls();
    if (game) {
        game.destroy(true);
        game = null;
    }
    scene = null;
    isCarryingNearHook = false;

    // Reset any carried state when game stops
    if (player && player.carryTarget) {
        const carried = player.carryTarget;
        if (carried && carried.sprite) {
            carried.sprite.setScale(1, 1);
            if (carried.sprite.texture.key.includes('_carried')) {
                carried.sprite.setTexture(carried.tex);
            }
        }
        player.carryTarget = null;
    }

    if (isMultiplayer && roomCode) {
        leaveGameSession(roomCode, playerId);
    }
}

function initGame() {
    console.log('initGame called');
    document.getElementById('game-container').innerHTML = '';
    
    try {
        console.log('Creating Phaser.Game...');
        game = new Phaser.Game({
            type: Phaser.AUTO,
            parent: 'game-container',
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: '#1a1a1a',
            physics: {
                default: 'arcade',
                arcade: {
                    gravity: { y: 0 },
                    debug: false
                }
            },
            scene: {
                preload: preload,
                create: create,
                update: update
            },
            scale: {
                mode: Phaser.Scale.RESIZE,
                autoCenter: Phaser.Scale.CENTER_BOTH
            }
        });
        console.log('Phaser.Game created successfully');
    } catch (e) {
        console.error('Error creating Phaser.Game:', e);
        alert('Ошибка создания игры: ' + e.message);
    }
}

// ═══════ TEXTURE BUILDER ═══════

function preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Ground - detailed dark forest floor (multiple variations for variety)
    // Create 6 different ground tiles for variety
    
    function createGroundTile(variation) {
        g.clear();
        
        // Base colors based on variation
        const baseColors = [
            [0x0d1208, 0x1a2210, 0x151d0c],  // Dark green
            [0x0f1410, 0x1c2418, 0x162016],  // More gray
            [0x0a0e06, 0x182010, 0x122008],  // Darker green
            [0x121810, 0x1e2618, 0x182018],  // Purple tint
            [0x0e1212, 0x1a2222, 0x141c1c], // Blue tint
            [0x10140c, 0x1c2014, 0x161810]   // Brown tint
        ];
        
        const [base, mid, light] = baseColors[variation % baseColors.length];
        
        // Base fill
        g.fillStyle(base);
        g.fillRect(0, 0, 64, 64);
        
        // Large dirt patches
        g.fillStyle(mid);
        g.fillCircle(16, 16, 20);
        g.fillCircle(48, 48, 18);
        
        // Smaller variations
        g.fillStyle(light);
        g.fillCircle(48, 12, 12);
        g.fillCircle(12, 48, 14);
        
        // Mud puddles (some variations)
        if (variation % 2 === 0) {
            g.fillStyle(0x0a0a08, 0.5);
            g.fillEllipse(32, 32, 16, 8);
        }
        
        // Grass tufts
        const grassColors = [0x2a4015, 0x3a5020, 0x1a3010];
        g.fillStyle(grassColors[variation % grassColors.length]);
        g.fillRect(8 + (variation * 7) % 48, 10 + (variation * 5) % 44, 2, 5 + variation % 3);
        g.fillRect(20 + (variation * 11) % 36, 15 + (variation * 7) % 36, 2, 4 + variation % 4);
        g.fillRect(40 + (variation * 13) % 18, 8 + (variation * 9) % 44, 2, 5 + variation % 3);
        
        // Dead leaves
        const leafColors = [0x3a3020, 0x4a4030, 0x2a2515];
        g.fillStyle(leafColors[variation % leafColors.length], 0.6);
        g.fillRect(5 + variation * 3, 20 + variation * 5, 3, 2);
        g.fillRect(45 + variation * 2, 35 + variation * 3, 4, 2);
        g.fillRect(25 + variation * 7, 50 + variation * 2, 3, 2);
        
        // Small stones
        const stoneColors = [0x3a3a35, 0x4a4a42, 0x353530];
        g.fillStyle(stoneColors[variation % stoneColors.length]);
        g.fillCircle(15 + variation * 5, 40 + variation * 3, 2);
        g.fillCircle(50 + variation * 3, 25 + variation * 7, 2);
        g.fillCircle(35 + variation * 7, 55 + variation * 2, 2);
        
        // Dark shadows/spots
        g.fillStyle(0x050505, 0.3);
        g.fillCircle(25 + variation * 3, 30 + variation * 4, 8);
        g.fillStyle(0x080808, 0.2);
        g.fillCircle(50 + variation * 2, 45 + variation * 5, 6);
        
        // Root tendrils (some variations)
        if (variation % 3 === 0) {
            g.fillStyle(0x2a1a10, 0.4);
            g.fillRect(10, 30, 15, 2);
            g.fillRect(20, 30, 2, 10);
            g.fillRect(40, 15, 12, 2);
        }
        
        // Moss patches
        if (variation % 2 === 1) {
            g.fillStyle(0x1a3a15, 0.4);
            g.fillCircle(45, 20, 6);
            g.fillStyle(0x2a4a20, 0.3);
            g.fillCircle(15, 50, 5);
        }
    }
    
    // Create 6 different ground tiles
    for (let v = 0; v < 6; v++) {
        createGroundTile(v);
        g.generateTexture('ground' + v, 64, 64);
    }
    
    // Base ground tile
    createGroundTile(0);
    g.generateTexture('ground', 64, 64);
    g.clear();

    // Fence post
    g.fillStyle(0x5a4a3a); g.fillRect(4, 0, 16, 64);
    g.fillStyle(0x6b5a48); g.fillRect(5, 0, 3, 64);
    g.fillStyle(0x4a3a2a); g.fillRect(18, 0, 2, 64);
    g.fillStyle(0x7a6a58); g.fillRect(2, -2, 20, 6);
    g.fillStyle(0x888888); g.fillCircle(12, 15, 2); g.fillCircle(12, 35, 2); g.fillCircle(12, 55, 2);
    g.generateTexture('fence_post', 24, 64);
    g.clear();

    // Fence rail
    g.fillStyle(0x5a4a3a); g.fillRect(0, 2, 64, 8);
    g.fillStyle(0x6b5a48); g.fillRect(0, 2, 64, 2);
    g.generateTexture('fence_rail', 64, 12);
    g.clear();

    // ═══════ CROW (raven) - flying pose ═══════
    // Body
    g.fillStyle(0x1a1a1a); g.fillEllipse(24, 16, 20, 12);
    g.fillStyle(0x2a2a2a); g.fillEllipse(24, 15, 18, 10);
    g.fillStyle(0x3a3a3a); g.fillEllipse(24, 14, 14, 8);
    
    // Head
    g.fillStyle(0x1a1a1a); g.fillCircle(36, 10, 8);
    g.fillStyle(0x2a2a2a); g.fillCircle(36, 9, 7);
    g.fillStyle(0x3a3a3a); g.fillCircle(36, 8, 5);
    
    // Beak
    g.fillStyle(0x3a3a3a); g.fillTriangle(42, 10, 50, 12, 42, 14);
    g.fillStyle(0x4a4a4a); g.fillTriangle(42, 10, 48, 11, 42, 13);
    
    // Eye
    g.fillStyle(0x1a1a1a); g.fillCircle(38, 8, 3);
    g.fillStyle(0x4a4a4a); g.fillCircle(38, 8, 2);
    g.fillStyle(0x666666); g.fillCircle(38, 7, 1);
    
    // Wings spread
    g.fillStyle(0x1a1a1a); g.fillEllipse(8, 14, 24, 10);
    g.fillStyle(0x2a2a2a); g.fillEllipse(8, 13, 20, 8);
    g.fillStyle(0x333333); g.fillEllipse(8, 12, 16, 6);
    // Wing feather details
    g.fillStyle(0x0a0a0a); g.fillRect(0, 10, 8, 2);
    g.fillStyle(0x0a0a0a); g.fillRect(4, 14, 6, 2);
    g.fillStyle(0x0a0a0a); g.fillRect(8, 18, 4, 2);
    
    g.fillStyle(0x1a1a1a); g.fillEllipse(40, 14, 24, 10);
    g.fillStyle(0x2a2a2a); g.fillEllipse(40, 13, 20, 8);
    g.fillStyle(0x333333); g.fillEllipse(40, 12, 16, 6);
    // Wing feather details
    g.fillStyle(0x0a0a0a); g.fillRect(32, 10, 8, 2);
    g.fillStyle(0x0a0a0a); g.fillRect(30, 14, 6, 2);
    g.fillStyle(0x0a0a0a); g.fillRect(28, 18, 4, 2);
    
    // Tail feathers
    g.fillStyle(0x1a1a1a); g.fillEllipse(6, 18, 12, 6);
    g.fillStyle(0x2a2a2a); g.fillEllipse(4, 20, 10, 4);
    
    // Legs tucked (flying)
    g.fillStyle(0x4a4a4a); g.fillRect(20, 22, 2, 6);
    g.fillStyle(0x4a4a4a); g.fillRect(26, 22, 2, 6);
    
    g.generateTexture('crow', 50, 32);
    g.clear();
    
    // ═══════ CROW (raven) - sitting pose ═══════
    // Body - hunched
    g.fillStyle(0x1a1a1a); g.fillEllipse(16, 20, 18, 14);
    g.fillStyle(0x2a2a2a); g.fillEllipse(16, 18, 16, 12);
    g.fillStyle(0x3a3a3a); g.fillEllipse(16, 16, 12, 10);
    
    // Head
    g.fillStyle(0x1a1a1a); g.fillCircle(26, 8, 8);
    g.fillStyle(0x2a2a2a); g.fillCircle(26, 7, 7);
    g.fillStyle(0x3a3a3a); g.fillCircle(26, 6, 5);
    
    // Beak
    g.fillStyle(0x3a3a3a); g.fillTriangle(32, 6, 40, 8, 32, 10);
    g.fillStyle(0x4a4a4a); g.fillTriangle(32, 6, 38, 7, 32, 9);
    
    // Eye - menacing
    g.fillStyle(0x1a1a1a); g.fillCircle(28, 4, 3);
    g.fillStyle(0x4a4a4a); g.fillCircle(28, 4, 2);
    g.fillStyle(0x666666); g.fillCircle(28, 3, 1);
    
    // Wings folded
    g.fillStyle(0x1a1a1a); g.fillEllipse(6, 18, 14, 10);
    g.fillStyle(0x2a2a2a); g.fillEllipse(6, 17, 12, 8);
    g.fillStyle(0x1a1a1a); g.fillEllipse(26, 18, 14, 10);
    g.fillStyle(0x2a2a2a); g.fillEllipse(26, 17, 12, 8);
    
    // Tail
    g.fillStyle(0x1a1a1a); g.fillEllipse(2, 24, 8, 6);
    g.fillStyle(0x2a2a2a); g.fillEllipse(0, 26, 6, 4);
    
    // Legs
    g.fillStyle(0x4a4a4a); g.fillRect(14, 28, 2, 8);
    g.fillStyle(0x4a4a4a); g.fillRect(20, 28, 2, 8);
    // Feet
    g.fillStyle(0x4a4a4a); g.fillRect(12, 34, 6, 2);
    g.fillStyle(0x4a4a4a); g.fillRect(18, 34, 6, 2);
    // Claws
    g.fillStyle(0x3a3a3a); g.fillRect(10, 36, 2, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(14, 36, 2, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(16, 36, 2, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(20, 36, 2, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(24, 36, 2, 3);
    
    g.generateTexture('crow_sitting', 42, 40);
    g.clear();

    // Brick wall tile - highly detailed DBD-style with more bricks
    // Background mortar base
    g.fillStyle(0x5a5a5a); g.fillRect(0, 0, 96, 48);
    g.fillStyle(0x4a4a4a); g.fillRect(0, 0, 96, 4); // Top mortar
    
    // Detailed brick colors - varied red/brown tones
    const brickColors = [
        0x8B4513, 0x7a3a10, 0x9a5520, 0x6B3008, 0x854015,
        0x943a20, 0x7d3a15, 0x8a4518, 0x783010, 0x8f5015,
        0xa04020, 0x7a3512, 0x884515, 0x6a2a0a, 0x8b4012
    ];
    
    // Row 4 - top (y=2)
    g.fillStyle(0x3a3a3a); g.fillRect(0, 0, 96, 2); // Mortar top
    for (let i = 0; i < 4; i++) {
        const c = brickColors[i * 3 % brickColors.length];
        g.fillStyle(c); g.fillRect(1 + i * 24, 2, 22, 10);
        g.fillStyle(c + 0x151515); g.fillRect(1 + i * 24, 2, 22, 2); // Top highlight
        g.fillStyle(c - 0x101010); g.fillRect(1 + i * 24, 10, 22, 2); // Bottom shadow
        g.fillStyle(c + 0x080808); g.fillRect(1 + i * 24, 4, 6, 6); // Left highlight
    }
    g.fillStyle(0x3a3a3a); g.fillRect(0, 12, 96, 1); // Mortar line
    
    // Row 3 (y=13)
    for (let i = 0; i < 3; i++) {
        const c = brickColors[(i * 2 + 1) % brickColors.length];
        g.fillStyle(c); g.fillRect(13 + i * 28, 13, 26, 10);
        g.fillStyle(c + 0x151515); g.fillRect(13 + i * 28, 13, 26, 2);
        g.fillStyle(c - 0x101010); g.fillRect(13 + i * 28, 21, 26, 2);
        // Brick texture details
        g.fillStyle(c + 0x0a0a0a); g.fillRect(15 + i * 28, 15, 8, 3);
        g.fillStyle(c + 0x1a1a1a); g.fillRect(30 + i * 28, 17, 6, 2);
    }
    g.fillStyle(0x3a3a3a); g.fillRect(0, 23, 96, 1); // Mortar line
    
    // Row 2 (y=24)
    for (let i = 0; i < 4; i++) {
        const c = brickColors[(i * 4 + 2) % brickColors.length];
        g.fillStyle(c); g.fillRect(1 + i * 24, 24, 22, 10);
        g.fillStyle(c + 0x151515); g.fillRect(1 + i * 24, 24, 22, 2);
        g.fillStyle(c - 0x101010); g.fillRect(1 + i * 24, 32, 22, 2);
        g.fillStyle(c + 0x0d0d0d); g.fillRect(8 + i * 24, 26, 5, 4);
    }
    g.fillStyle(0x3a3a3a); g.fillRect(0, 34, 96, 1); // Mortar line
    
    // Row 1 - bottom (y=35)
    for (let i = 0; i < 3; i++) {
        const c = brickColors[(i * 3 + 3) % brickColors.length];
        g.fillStyle(c); g.fillRect(13 + i * 28, 35, 26, 10);
        g.fillStyle(c + 0x151515); g.fillRect(13 + i * 28, 35, 26, 2);
        g.fillStyle(c - 0x101010); g.fillRect(13 + i * 28, 43, 26, 2);
        g.fillStyle(c + 0x0c0c0c); g.fillRect(20 + i * 28, 37, 10, 3);
    }
    
    // Vertical mortar lines
    g.fillStyle(0x3a3a3a);
    g.fillRect(23, 0, 2, 12); g.fillRect(47, 0, 2, 12); g.fillRect(71, 0, 2, 12); // Top row
    g.fillRect(0, 12, 2, 11); g.fillRect(41, 12, 2, 11); g.fillRect(82, 12, 2, 11); // Middle row offset
    g.fillRect(23, 23, 2, 11); g.fillRect(47, 23, 2, 11); g.fillRect(71, 23, 2, 11); // Row 2
    g.fillRect(0, 34, 2, 11); g.fillRect(41, 34, 2, 11); g.fillRect(82, 34, 2, 11); // Bottom row offset
    g.fillRect(23, 34, 2, 14); g.fillRect(47, 34, 2, 14); g.fillRect(71, 34, 2, 14); // Bottom
    
    // Additional mortar texture
    g.fillStyle(0x3a3a3a, 0.5); g.fillRect(24, 0, 1, 48); g.fillRect(48, 0, 1, 48); g.fillRect(72, 0, 1, 48);
    g.fillRect(0, 12, 96, 1); g.fillRect(0, 23, 96, 1); g.fillRect(0, 34, 96, 1);
    
    // Random cracks and wear marks
    g.fillStyle(0x2a2a2a, 0.7);
    g.fillRect(8, 8, 6, 1); g.fillRect(35, 5, 10, 1); g.fillRect(60, 7, 8, 1);
    g.fillRect(15, 27, 5, 1); g.fillRect(50, 26, 7, 1); g.fillRect(75, 28, 4, 1);
    g.fillRect(5, 38, 5, 1); g.fillRect(45, 40, 8, 1); g.fillRect(70, 37, 6, 1);
    
    // Brick surface imperfections
    g.fillStyle(0x9a5520, 0.3); g.fillRect(12, 15, 3, 2);
    g.fillStyle(0x7a3a10, 0.3); g.fillRect(55, 25, 4, 2);
    g.fillStyle(0x8B4513, 0.3); g.fillRect(25, 37, 3, 2);
    g.fillStyle(0x6B3008, 0.3); g.fillRect(80, 5, 4, 2);
    
    // Dark spots / aging stains
    g.fillStyle(0x2a1a0a, 0.35); g.fillCircle(15, 40, 5);
    g.fillStyle(0x3a2a1a, 0.3); g.fillCircle(60, 8, 4);
    g.fillStyle(0x2a1a0a, 0.25); g.fillCircle(85, 25, 3);
    g.fillStyle(0x3a2a1a, 0.2); g.fillCircle(30, 30, 3);
    g.fillStyle(0x2a1a0a, 0.15); g.fillCircle(75, 42, 4);
    
    // Moss/algae on bottom edge
    g.fillStyle(0x3a4a2a, 0.4);
    g.fillRect(0, 44, 20, 3);
    g.fillRect(70, 44, 15, 3);
    g.fillStyle(0x4a5a3a, 0.3);
    g.fillRect(25, 45, 10, 2);
    g.fillRect(55, 45, 8, 2);
    
    g.generateTexture('brick', 96, 48);
    g.clear();

    // Stone 1 - large gray boulder
    g.fillStyle(0x5a5a5a); g.fillRect(4, 8, 36, 28);
    g.fillStyle(0x696969); g.fillRect(2, 12, 32, 24);
    g.fillStyle(0x787878); g.fillRect(6, 16, 24, 18);
    g.fillStyle(0x878787); g.fillRect(10, 20, 16, 12);
    // Highlights
    g.fillStyle(0x959595); g.fillRect(8, 10, 12, 6);
    g.fillStyle(0x707070); g.fillRect(2, 28, 36, 6);
    // Cracks
    g.fillStyle(0x3a3a3a); g.fillRect(14, 18, 1, 14);
    g.fillStyle(0x4a4a4a); g.fillRect(24, 12, 1, 10);
    // Moss spots
    g.fillStyle(0x3a4a2a, 0.4); g.fillCircle(8, 32, 4);
    g.fillStyle(0x3a4a2a, 0.3); g.fillCircle(28, 30, 3);
    g.generateTexture('stone1', 40, 38);
    g.clear();

    // Stone 2 - medium brownish rock
    g.fillStyle(0x6a5a4a); g.fillRect(2, 6, 34, 26);
    g.fillStyle(0x7a6a5a); g.fillRect(4, 8, 28, 22);
    g.fillStyle(0x8a7a6a); g.fillRect(6, 12, 20, 16);
    // Highlights
    g.fillStyle(0x9a8a7a); g.fillRect(8, 10, 10, 6);
    g.fillStyle(0x5a4a3a); g.fillRect(2, 26, 34, 6);
    // Cracks
    g.fillStyle(0x4a3a2a); g.fillRect(18, 14, 1, 12);
    g.fillStyle(0x4a3a2a); g.fillRect(10, 20, 8, 1);
    // Dark spots
    g.fillStyle(0x3a2a1a, 0.5); g.fillCircle(26, 28, 4);
    g.fillStyle(0x4a3a2a, 0.4); g.fillCircle(12, 30, 3);
    g.generateTexture('stone2', 38, 34);
    g.clear();

    // Stone 3 - small dark granite
    g.fillStyle(0x4a4a4a); g.fillRect(6, 4, 28, 22);
    g.fillStyle(0x5a5a5a); g.fillRect(8, 6, 22, 18);
    g.fillStyle(0x6a6a6a); g.fillRect(10, 10, 14, 12);
    // Highlights
    g.fillStyle(0x7a7a7a); g.fillRect(10, 8, 8, 4);
    g.fillStyle(0x3a3a3a); g.fillRect(6, 20, 28, 6);
    // Cracks
    g.fillStyle(0x2a2a2a); g.fillRect(16, 12, 1, 10);
    g.fillStyle(0x3a3a3a); g.fillRect(12, 16, 6, 1);
    g.generateTexture('stone3', 36, 28);
    g.clear();

    // Stone 4 - flat limestone
    g.fillStyle(0x7a7a72); g.fillRect(2, 12, 44, 16);
    g.fillStyle(0x8a8a82); g.fillRect(4, 14, 38, 12);
    g.fillStyle(0x9a9a92); g.fillRect(8, 16, 24, 8);
    // Highlights
    g.fillStyle(0xaaaaa2); g.fillRect(8, 14, 16, 4);
    g.fillStyle(0x6a6a62); g.fillRect(2, 24, 44, 4);
    // Texture dots
    g.fillStyle(0x5a5a52, 0.5); g.fillCircle(14, 22, 2);
    g.fillStyle(0x5a5a52, 0.5); g.fillCircle(30, 20, 2);
    g.fillStyle(0x5a5a52, 0.5); g.fillCircle(38, 24, 1.5);
    // Crack
    g.fillStyle(0x5a5a52); g.fillRect(20, 18, 1, 8);
    g.generateTexture('stone4', 48, 30);
    g.clear();

    // Stone 5 - small rounded pebble
    g.fillStyle(0x5a5a5a); g.fillCircle(14, 14, 12);
    g.fillStyle(0x6a6a6a); g.fillCircle(14, 14, 10);
    g.fillStyle(0x7a7a7a); g.fillCircle(12, 12, 7);
    // Highlight
    g.fillStyle(0x8a8a8a); g.fillCircle(10, 10, 4);
    g.fillStyle(0x4a4a4a); g.fillCircle(14, 14, 10);
    // Crack
    g.fillStyle(0x3a3a3a); g.fillRect(12, 16, 4, 1);
    g.generateTexture('stone5', 28, 28);
    g.clear();

    // ═══════ PALLETS (Dropable boards like DBD) ═══════
    // Standing pallet (upright board blocking path)
    g.fillStyle(0x5a4030);
    g.fillRect(8, 0, 16, 80);
    g.fillStyle(0x6a5040);
    g.fillRect(8, 0, 6, 80);
    g.fillStyle(0x4a3020);
    g.fillRect(20, 0, 4, 80);
    // Wood grain
    g.fillStyle(0x4a3525, 0.5);
    g.fillRect(10, 5, 1, 70);
    g.fillRect(14, 10, 1, 60);
    g.fillRect(18, 3, 1, 75);
    // Nails
    g.fillStyle(0x3a3a3a);
    g.fillCircle(12, 10, 2);
    g.fillCircle(12, 40, 2);
    g.fillCircle(12, 70, 2);
    g.generateTexture('pallet', 32, 80);
    g.clear();

    // Falling pallet (mid-drop animation)
    g.fillStyle(0x5a4030);
    g.fillRect(4, 10, 50, 16);
    g.fillStyle(0x6a5040);
    g.fillRect(4, 10, 15, 16);
    g.fillStyle(0x4a3020);
    g.fillRect(45, 10, 9, 16);
    // Wood grain
    g.fillStyle(0x4a3525, 0.5);
    g.fillRect(15, 14, 30, 2);
    g.fillRect(10, 20, 35, 2);
    g.generateTexture('pallet_falling', 58, 36);
    g.clear();

    // Broken pallet (debris)
    g.fillStyle(0x5a4030);
    g.fillRect(0, 12, 20, 8);
    g.fillRect(25, 8, 18, 6);
    g.fillRect(45, 15, 12, 7);
    g.fillStyle(0x4a3020);
    g.fillRect(5, 10, 8, 4);
    g.fillRect(35, 14, 10, 5);
    // Splinters
    g.fillStyle(0x6a5040);
    g.fillRect(12, 6, 4, 6);
    g.fillRect(38, 4, 5, 5);
    g.fillRect(50, 8, 3, 4);
    g.generateTexture('pallet_broken', 60, 22);
    g.clear();

    // ═══════ LARGE TREES (3 variations) ═══════
    function createTree(variation) {
        g.clear();
        
        // Color variations
        const treeColors = [
            { trunk: 0x3d2817, trunkLight: 0x4d3827, trunkDark: 0x2d1807, foliage: [0x1a4a0d, 0x2a5a15, 0x3a6a1f, 0x4a7a2a], highlight: 0x5a8a35 },
            { trunk: 0x2d2010, trunkLight: 0x3d3020, trunkDark: 0x1d1000, foliage: [0x15400a, 0x255015, 0x3a6020, 0x4a7025], highlight: 0x5a8030 },
            { trunk: 0x4a3020, trunkLight: 0x5a4030, trunkDark: 0x3a2010, foliage: [0x1a5a0d, 0x2a6a15, 0x3a7a1f, 0x4a8a2a], highlight: 0x5a9a35 }
        ];
        
        const colors = treeColors[variation % treeColors.length];
        
        // Shadow
        g.fillStyle(0x000000, 0.35); g.fillEllipse(37, 96, 55, 20);
        g.fillStyle(0x000000, 0.2); g.fillEllipse(32, 94, 40, 14);
        
        // Trunk
        const trunkOffset = variation * 3;
        g.fillStyle(colors.trunk); g.fillRect(28 + trunkOffset, 45, 14, 52);
        g.fillStyle(colors.trunkLight); g.fillRect(28 + trunkOffset, 45, 5, 52);
        g.fillStyle(colors.trunkDark); g.fillRect(38 + trunkOffset, 45, 4, 52);
        
        // Roots
        g.fillStyle(colors.trunk); g.fillRect(20 + trunkOffset, 88, 8, 8);
        g.fillStyle(colors.trunkLight); g.fillRect(20 + trunkOffset, 88, 3, 8);
        g.fillStyle(colors.trunk); g.fillRect(42 + trunkOffset, 88, 8, 8);
        
        // Foliage
        const foliageOffset = variation * 4;
        g.fillStyle(colors.foliage[0]); g.fillCircle(35 + foliageOffset, 38, 32);
        g.fillStyle(colors.foliage[1]); g.fillCircle(35 + foliageOffset, 35, 28);
        g.fillStyle(colors.foliage[2]); g.fillCircle(35 + foliageOffset, 32, 24);
        g.fillStyle(colors.foliage[3]); g.fillCircle(35 + foliageOffset, 30, 20);
        
        // Highlights
        g.fillStyle(colors.highlight); g.fillCircle(30 + foliageOffset, 24, 14);
        g.fillStyle(colors.highlight + 0x101010); g.fillCircle(28 + foliageOffset, 22, 10);
        
        // Leaf clusters
        g.fillStyle(colors.foliage[2]); g.fillCircle(18 + foliageOffset, 35, 10);
        g.fillStyle(colors.foliage[3]); g.fillCircle(52 + foliageOffset, 35, 10);
        g.fillStyle(colors.foliage[2]); g.fillCircle(35 + foliageOffset, 12, 12);
    }
    
    // Create 3 tree variations
    for (let v = 0; v < 3; v++) {
        createTree(v);
        g.generateTexture('tree' + v, 70, 100);
    }
    // Default tree
    createTree(0);
    g.generateTexture('tree', 70, 100);
    g.clear();

    // ═══════ DETAILED 3D-STYLE BUSH ═══════
    // Shadow under bush - detailed with multiple layers
    g.fillStyle(0x000000, 0.3); g.fillEllipse(32, 40, 48, 14);
    g.fillStyle(0x000000, 0.2); g.fillEllipse(28, 38, 35, 10);
    
    // Bush base layer - dark green
    g.fillStyle(0x1a4a0d); g.fillCircle(30, 28, 22);
    g.fillStyle(0x1a4a0d); g.fillCircle(14, 26, 14);
    g.fillStyle(0x1a4a0d); g.fillCircle(46, 26, 14);
    
    // Bush mid layer
    g.fillStyle(0x2a5a15); g.fillCircle(30, 24, 18);
    g.fillStyle(0x2a5a15); g.fillCircle(16, 22, 12);
    g.fillStyle(0x2a5a15); g.fillCircle(44, 22, 12);
    
    // Bush top layer - lighter green
    g.fillStyle(0x3a6a1f); g.fillCircle(30, 20, 15);
    g.fillStyle(0x3a6a1f); g.fillCircle(18, 18, 10);
    g.fillStyle(0x3a6a1f); g.fillCircle(42, 18, 10);
    
    // Bush highlights
    g.fillStyle(0x4a7a2a); g.fillCircle(26, 14, 8);
    g.fillStyle(0x5a8a35); g.fillCircle(24, 12, 6);
    g.fillStyle(0x5a8a35); g.fillCircle(36, 16, 5);
    
    // Red berries for color
    g.fillStyle(0x8B0000); g.fillCircle(20, 18, 3);
    g.fillStyle(0xaa2222); g.fillCircle(20, 17, 2);
    g.fillStyle(0x8B0000); g.fillCircle(38, 22, 3);
    g.fillStyle(0xaa2222); g.fillCircle(38, 21, 2);
    g.fillStyle(0x8B0000); g.fillCircle(28, 24, 2);
    g.fillStyle(0x8B0000); g.fillCircle(14, 28, 2);
    g.fillStyle(0x8B0000); g.fillCircle(46, 28, 2);
    
    // Leaf texture details
    g.fillStyle(0x3a6a1f); g.fillCircle(12, 24, 6);
    g.fillStyle(0x4a7a2a); g.fillCircle(48, 24, 6);
    g.fillStyle(0x2a5a15); g.fillCircle(30, 32, 8);
    
    g.generateTexture('bush', 60, 45);
    g.clear();

    // ═══════ SMALL TREE (THIN) ═══════
    // Detailed shadow
    g.fillStyle(0x000000, 0.35); g.fillEllipse(22, 74, 32, 12);
    g.fillStyle(0x000000, 0.2); g.fillEllipse(18, 72, 20, 8);
    
    // Trunk with bark texture
    g.fillStyle(0x3a2515); g.fillRect(16, 35, 8, 38);
    g.fillStyle(0x4a3020); g.fillRect(16, 35, 3, 38);
    g.fillStyle(0x2a1a10); g.fillRect(20, 35, 4, 38);
    // Bark lines
    g.fillStyle(0x2a1a10, 0.5); g.fillRect(17, 40, 1, 30);
    g.fillStyle(0x5a4030, 0.3); g.fillRect(19, 45, 1, 25);
    
    // Foliage layers with highlights
    g.fillStyle(0x1a4a0d); g.fillCircle(20, 28, 18);
    g.fillStyle(0x2a5a15); g.fillCircle(20, 25, 15);
    g.fillStyle(0x3a6a1f); g.fillCircle(20, 22, 12);
    g.fillStyle(0x4a7a2a); g.fillCircle(18, 18, 8);
    g.fillStyle(0x5a8a35); g.fillCircle(16, 15, 5);
    // Highlight spots
    g.fillStyle(0x6a9a45); g.fillCircle(22, 20, 4);
    g.fillStyle(0x5a8a35); g.fillCircle(14, 24, 3);
    
    g.fillStyle(0x1a4a0d); g.fillCircle(8, 30, 8);
    g.fillStyle(0x2a5a15); g.fillCircle(32, 30, 8);
    
    g.generateTexture('tree_small', 40, 80);
    g.clear();

    // ═══════ PINE TREE ═══════
    // Detailed shadow
    g.fillStyle(0x000000, 0.4); g.fillEllipse(27, 92, 36, 14);
    g.fillStyle(0x000000, 0.25); g.fillEllipse(22, 90, 24, 10);
    
    g.fillStyle(0x4a3020); g.fillRect(21, 55, 8, 34);
    g.fillStyle(0x5d4037); g.fillRect(21, 55, 3, 34);
    
    // Layered pine foliage
    g.fillStyle(0x1a3a0d); g.fillCircle(25, 52, 20);
    g.fillStyle(0x2a4a12); g.fillCircle(25, 48, 17);
    g.fillStyle(0x1a3a0d); g.fillCircle(25, 38, 18);
    g.fillStyle(0x2a4a12); g.fillCircle(25, 34, 15);
    g.fillStyle(0x1a3a0d); g.fillCircle(25, 24, 16);
    g.fillStyle(0x2a4a12); g.fillCircle(25, 20, 13);
    g.fillStyle(0x1a3a0d); g.fillCircle(25, 12, 12);
    g.fillStyle(0x2a4a12); g.fillCircle(25, 8, 10);
    
    // Pine highlights
    g.fillStyle(0x3a5a18); g.fillCircle(22, 45, 8);
    g.fillStyle(0x3a5a18); g.fillCircle(22, 30, 7);
    g.fillStyle(0x3a5a18); g.fillCircle(22, 16, 6);
    
    g.generateTexture('pine_tree', 50, 95);
    g.clear();

    // ═══════ TALL GRASS ═══════
    g.fillStyle(0x2a5a15); g.fillRect(8, 12, 3, 22);
    g.fillStyle(0x3a6a1f); g.fillRect(8, 12, 1, 22);
    g.fillStyle(0x4a7a2a); g.fillRect(16, 8, 3, 26);
    g.fillStyle(0x3a6a1f); g.fillRect(16, 8, 1, 26);
    g.fillStyle(0x2a5a15); g.fillRect(24, 14, 3, 20);
    g.fillStyle(0x4a7a2a); g.fillRect(24, 14, 1, 20);
    g.fillStyle(0x2a5a15); g.fillRect(32, 10, 3, 24);
    g.fillStyle(0x3a6a1f); g.fillRect(32, 10, 1, 24);
    g.fillStyle(0x4a7a2a); g.fillRect(40, 12, 3, 22);
    g.fillStyle(0x2a5a15); g.fillRect(40, 12, 1, 22);
    
    g.generateTexture('tall_grass', 50, 40);
    g.clear();

    // ═══════ FLOWER PATCH ═══════
    g.fillStyle(0x2a5a15); g.fillRect(4, 18, 3, 16);
    g.fillStyle(0xff69b4); g.fillCircle(5, 16, 4);
    g.fillStyle(0xff85c1); g.fillCircle(4, 15, 2);
    
    g.fillStyle(0x2a5a15); g.fillRect(14, 20, 3, 14);
    g.fillStyle(0xffd700); g.fillCircle(15, 18, 4);
    g.fillStyle(0xffe44d); g.fillCircle(14, 17, 2);
    
    g.fillStyle(0x2a5a15); g.fillRect(24, 16, 3, 18);
    g.fillStyle(0xff6347); g.fillCircle(25, 14, 4);
    g.fillStyle(0xff7f50); g.fillCircle(24, 13, 2);
    
    g.fillStyle(0x2a5a15); g.fillRect(34, 22, 3, 12);
    g.fillStyle(0x9370db); g.fillCircle(35, 20, 4);
    g.fillStyle(0xba55d3); g.fillCircle(34, 19, 2);
    
    g.fillStyle(0x2a5a15); g.fillRect(44, 18, 3, 16);
    g.fillStyle(0x00ced1); g.fillCircle(45, 16, 4);
    g.fillStyle(0x40e0d0); g.fillCircle(44, 15, 2);
    
    g.generateTexture('flower_patch', 52, 35);
    g.clear();

    // ═══════ DETAILED ROCK ═══════
    g.fillStyle(0x000000, 0.3); g.fillEllipse(28, 34, 40, 14);
    
    g.fillStyle(0x4a4a4a); g.fillCircle(28, 28, 18);
    g.fillStyle(0x5a5a5a); g.fillCircle(28, 26, 15);
    g.fillStyle(0x6a6a6a); g.fillCircle(26, 24, 12);
    g.fillStyle(0x7a7a7a); g.fillCircle(24, 22, 8);
    g.fillStyle(0x8a8a8a); g.fillCircle(22, 20, 5);
    
    g.fillStyle(0x3a3a3a); g.fillCircle(40, 32, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(40, 30, 8);
    g.fillStyle(0x5a5a5a); g.fillCircle(38, 28, 6);
    
    g.fillStyle(0x3a3a3a); g.fillCircle(16, 30, 8);
    g.fillStyle(0x4a4a4a); g.fillCircle(16, 28, 6);
    
    g.generateTexture('rock_detailed', 56, 45);
    g.clear();

    // Shack wall
    g.fillStyle(0x7a5a3a); g.fillRect(0, 0, 48, 20);
    g.fillStyle(0x6a4a2a); g.fillRect(0, 0, 48, 2); g.fillRect(0, 4, 48, 1); g.fillRect(0, 9, 48, 1);
    g.generateTexture('shack_wall', 48, 20);
    g.clear();

    // ═══════ HIGHLY DETAILED GENERATOR ═══════
    // Shadow under generator
    g.fillStyle(0x000000, 0.4); g.fillEllipse(32, 80, 58, 14);
    
    // Main generator body - industrial metal box
    g.fillStyle(0x252530); g.fillRect(4, 18, 56, 58);
    g.fillStyle(0x2d2d38); g.fillRect(6, 20, 52, 54); // Main panel
    
    // Panel texture - scratched metal
    g.fillStyle(0x353542); g.fillRect(8, 22, 48, 50);
    
    // Panel seams and edges
    g.fillStyle(0x1a1a22); g.fillRect(8, 22, 48, 2); // Top edge
    g.fillStyle(0x1a1a22); g.fillRect(8, 22, 2, 50); // Left edge
    g.fillStyle(0x404050); g.fillRect(54, 22, 2, 50); // Right edge
    g.fillStyle(0x404050); g.fillRect(8, 68, 48, 2); // Bottom edge
    
    // Vertical rib details
    g.fillStyle(0x2a2a35); g.fillRect(12, 24, 3, 46);
    g.fillStyle(0x2a2a35); g.fillRect(49, 24, 3, 46);
    
    // Horizontal rib details
    g.fillStyle(0x2a2a35); g.fillRect(14, 32, 36, 2);
    g.fillStyle(0x2a2a35); g.fillRect(14, 48, 36, 2);
    g.fillStyle(0x2a2a35); g.fillRect(14, 62, 36, 2);
    
    // Engine vents - detailed louvered design
    g.fillStyle(0x1a1a20); g.fillRect(14, 26, 36, 8);
    g.fillStyle(0x252530); g.fillRect(15, 27, 34, 6);
    // Vent slats
    for (let i = 0; i < 6; i++) {
        g.fillStyle(0x353540); g.fillRect(16 + i * 5, 27, 3, 6);
        g.fillStyle(0x151518); g.fillRect(16 + i * 5, 28, 3, 2);
    }
    
    g.fillStyle(0x1a1a20); g.fillRect(14, 36, 36, 8);
    g.fillStyle(0x252530); g.fillRect(15, 37, 34, 6);
    for (let i = 0; i < 6; i++) {
        g.fillStyle(0x353540); g.fillRect(16 + i * 5, 37, 3, 6);
        g.fillStyle(0x151518); g.fillRect(16 + i * 5, 38, 3, 2);
    }
    
    g.fillStyle(0x1a1a20); g.fillRect(14, 46, 36, 8);
    g.fillStyle(0x252530); g.fillRect(15, 47, 34, 6);
    for (let i = 0; i < 6; i++) {
        g.fillStyle(0x353540); g.fillRect(16 + i * 5, 47, 3, 6);
        g.fillStyle(0x151518); g.fillRect(16 + i * 5, 48, 3, 2);
    }
    
    // Main control panel - detailed electronics box
    g.fillStyle(0x303038); g.fillRect(12, 56, 28, 18);
    g.fillStyle(0x383840); g.fillRect(13, 57, 26, 16);
    g.fillStyle(0x404048); g.fillRect(14, 58, 24, 14);
    
    // Panel screws
    g.fillStyle(0x5a5a62); g.fillCircle(15, 59, 2);
    g.fillStyle(0x6a6a72); g.fillCircle(15, 59, 1);
    g.fillStyle(0x5a5a62); g.fillCircle(37, 59, 2);
    g.fillStyle(0x6a6a72); g.fillCircle(37, 59, 1);
    g.fillStyle(0x5a5a62); g.fillCircle(15, 71, 2);
    g.fillStyle(0x6a6a72); g.fillCircle(15, 71, 1);
    g.fillStyle(0x5a5a62); g.fillCircle(37, 71, 2);
    g.fillStyle(0x6a6a72); g.fillCircle(37, 71, 1);
    
    // Indicator lights with glow effect
    g.fillStyle(0x00ff44); g.fillCircle(20, 63, 4);
    g.fillStyle(0x00dd33); g.fillCircle(20, 63, 3);
    g.fillStyle(0xaaffaa); g.fillCircle(19, 62, 1);
    g.fillStyle(0x00ff44, 0.3); g.fillCircle(20, 63, 6);
    
    g.fillStyle(0xff2222); g.fillCircle(30, 63, 4);
    g.fillStyle(0xcc1111); g.fillCircle(30, 63, 3);
    g.fillStyle(0xff8888); g.fillCircle(29, 62, 1);
    g.fillStyle(0xff2222, 0.3); g.fillCircle(30, 63, 6);
    
    // Small status LEDs
    g.fillStyle(0xffff00); g.fillCircle(20, 69, 2);
    g.fillStyle(0xdddd00); g.fillCircle(20, 69, 1.5);
    g.fillStyle(0x00ff00); g.fillCircle(26, 69, 2);
    g.fillStyle(0x00dd00); g.fillCircle(26, 69, 1.5);
    g.fillStyle(0xff8800); g.fillCircle(32, 69, 2);
    g.fillStyle(0xdd6600); g.fillCircle(32, 69, 1.5);
    
    // Digital display segments (broken/blank)
    g.fillStyle(0x1a1a1a); g.fillRect(22, 66, 6, 4);
    g.fillStyle(0x252525); g.fillRect(23, 67, 4, 2);
    
    // Wire bundle - detailed cables
    g.fillStyle(0x1a1a20); g.fillRect(42, 56, 5, 18);
    g.fillStyle(0x8B0000); g.fillRect(43, 57, 3, 6); // Red wire
    g.fillStyle(0x00aa00); g.fillRect(43, 64, 3, 4); // Green wire
    g.fillStyle(0x0066aa); g.fillRect(43, 69, 3, 5); // Blue wire
    g.fillStyle(0xaaaa00); g.fillRect(43, 58, 3, 3); // Yellow wire
    // Wire highlights
    g.fillStyle(0xaa0000); g.fillRect(43, 57, 1, 6);
    g.fillStyle(0x00cc00); g.fillRect(43, 64, 1, 4);
    g.fillStyle(0x0088cc); g.fillRect(43, 69, 1, 5);
    
    // Cable connectors
    g.fillStyle(0x2a2a30); g.fillRect(41, 55, 8, 4);
    g.fillStyle(0x333338); g.fillRect(41, 71, 8, 4);
    
    // Side panel details - fuel tank style
    g.fillStyle(0x2a2a32); g.fillRect(48, 30, 10, 32);
    g.fillStyle(0x323238); g.fillRect(49, 31, 8, 30);
    // Fuel cap
    g.fillStyle(0x4a4a52); g.fillCircle(53, 34, 4);
    g.fillStyle(0x3a3a42); g.fillCircle(53, 34, 3);
    g.fillStyle(0x2a2a32); g.fillCircle(53, 34, 2);
    g.fillStyle(0x5a5a62); g.fillCircle(53, 34, 1);
    // Fuel gauge
    g.fillStyle(0x1a1a20); g.fillRect(50, 40, 6, 18);
    g.fillStyle(0x00aa44); g.fillRect(51, 42, 4, 12); // Fuel level
    g.fillStyle(0x006622); g.fillRect(51, 52, 4, 2);
    
    // Exhaust pipe with detail
    g.fillStyle(0x3a3a40); g.fillRect(4, 40, 6, 20);
    g.fillStyle(0x4a4a50); g.fillRect(4, 40, 6, 2);
    g.fillStyle(0x2a2a30); g.fillRect(2, 38, 10, 4);
    // Exhaust holes
    g.fillStyle(0x1a1a20); g.fillCircle(6, 50, 2);
    g.fillStyle(0x1a1a20); g.fillCircle(6, 56, 2);
    
    // Bolt/rivet details on corners
    g.fillStyle(0x5a5a62); g.fillCircle(10, 24, 3);
    g.fillStyle(0x6a6a72); g.fillCircle(10, 24, 2);
    g.fillStyle(0x5a5a62); g.fillCircle(54, 24, 3);
    g.fillStyle(0x6a6a72); g.fillCircle(54, 24, 2);
    g.fillStyle(0x5a5a62); g.fillCircle(10, 68, 3);
    g.fillStyle(0x6a6a72); g.fillCircle(10, 68, 2);
    g.fillStyle(0x5a5a62); g.fillCircle(54, 68, 3);
    g.fillStyle(0x6a6a72); g.fillCircle(54, 68, 2);
    
    // Rust stains and wear marks
    g.fillStyle(0x4a3a2a, 0.4); g.fillCircle(52, 62, 5);
    g.fillStyle(0x3a2a1a, 0.3); g.fillCircle(20, 70, 4);
    g.fillStyle(0x5a4a3a, 0.25); g.fillCircle(40, 28, 3);
    g.fillStyle(0x4a3a2a, 0.2); g.fillCircle(30, 72, 3);
    
    // Scratch marks
    g.fillStyle(0x3a3a42, 0.5); g.fillRect(22, 24, 12, 1);
    g.fillStyle(0x3a3a42, 0.4); g.fillRect(24, 26, 8, 1);
    g.fillStyle(0x3a3a42, 0.3); g.fillRect(18, 52, 16, 1);
    
    // Warning label
    g.fillStyle(0xffcc00); g.fillRect(16, 58, 14, 6);
    g.fillStyle(0xaa9900); g.fillRect(16, 58, 14, 1);
    g.fillStyle(0x886600); g.fillRect(17, 59, 12, 4);
    // Warning stripes
    g.fillStyle(0x1a1a1a); g.fillRect(18, 60, 2, 2);
    g.fillStyle(0x1a1a1a); g.fillRect(22, 60, 2, 2);
    g.fillStyle(0x1a1a1a); g.fillRect(26, 60, 2, 2);
    
    // Handle/grab bar
    g.fillStyle(0x4a4a52); g.fillRect(44, 50, 8, 3);
    g.fillStyle(0x5a5a62); g.fillRect(44, 50, 8, 1);
    
    g.generateTexture('gen', 64, 80);
    g.clear();

    // ═══════ DETAILED GENERATOR LIGHT POLE ═══════
    // Shadow at base
    g.fillStyle(0x000000, 0.3); g.fillEllipse(32, 58, 24, 6);
    
    // Main pole - tapered metal
    g.fillStyle(0x3a3a42); g.fillRect(28, 0, 8, 54);
    g.fillStyle(0x4a4a52); g.fillRect(29, 0, 3, 54);
    g.fillStyle(0x353540); g.fillRect(32, 0, 3, 54);
    
    // Pole seams
    g.fillStyle(0x2a2a32); g.fillRect(28, 0, 1, 54);
    g.fillStyle(0x2a2a32); g.fillRect(35, 0, 1, 54);
    
    // Pole base - concrete/metal junction
    g.fillStyle(0x4a4a52); g.fillRect(22, 48, 20, 8);
    g.fillStyle(0x5a5a62); g.fillRect(24, 48, 16, 6);
    g.fillStyle(0x4a4a52); g.fillRect(24, 48, 16, 2);
    g.fillStyle(0x3a3a42); g.fillRect(24, 52, 16, 2);
    
    // Base bolts
    g.fillStyle(0x6a6a72); g.fillCircle(26, 50, 2);
    g.fillStyle(0x7a7a82); g.fillCircle(26, 50, 1);
    g.fillStyle(0x6a6a72); g.fillCircle(38, 50, 2);
    g.fillStyle(0x7a7a82); g.fillCircle(38, 50, 1);
    g.fillStyle(0x6a6a72); g.fillCircle(26, 54, 2);
    g.fillStyle(0x7a7a82); g.fillCircle(26, 54, 1);
    g.fillStyle(0x6a6a72); g.fillCircle(38, 54, 2);
    g.fillStyle(0x7a7a82); g.fillCircle(38, 54, 1);
    
    // Rust streaks on pole
    g.fillStyle(0x5a3a2a, 0.5); g.fillRect(29, 16, 2, 14);
    g.fillStyle(0x5a3a2a, 0.4); g.fillRect(30, 32, 2, 10);
    g.fillStyle(0x5a3a2a, 0.3); g.fillRect(29, 44, 2, 6);
    
    // Rust drip marks
    g.fillStyle(0x4a2a1a, 0.4); g.fillCircle(29, 32, 2);
    g.fillStyle(0x4a2a1a, 0.3); g.fillCircle(30, 38, 1.5);
    g.fillStyle(0x4a2a1a, 0.4); g.fillCircle(32, 20, 1.5);
    
    // Top mounting bracket
    g.fillStyle(0x4a4a52); g.fillRect(24, 0, 16, 6);
    g.fillStyle(0x5a5a62); g.fillRect(26, 1, 12, 4);
    g.fillStyle(0x3a3a42); g.fillRect(26, 4, 12, 2);
    
    // Mounting screws
    g.fillStyle(0x6a6a72); g.fillCircle(28, 3, 2);
    g.fillStyle(0x7a7a82); g.fillCircle(28, 3, 1);
    g.fillStyle(0x6a6a72); g.fillCircle(36, 3, 2);
    g.fillStyle(0x7a7a82); g.fillCircle(36, 3, 1);
    
    g.generateTexture('gen_pole', 64, 60);
    g.clear();

    // ═══════ DETAILED GENERATOR LIGHT FIXTURE ═══════
    // Light housing - industrial style
    g.fillStyle(0x3a3a40); g.fillRect(16, 0, 32, 18);
    g.fillStyle(0x454550); g.fillRect(18, 2, 28, 14);
    g.fillStyle(0x404048); g.fillRect(18, 2, 28, 4);
    
    // Housing details
    g.fillStyle(0x353540); g.fillRect(16, 0, 2, 18);
    g.fillStyle(0x353540); g.fillRect(46, 0, 2, 18);
    
    // Mounting arm
    g.fillStyle(0x4a4a52); g.fillRect(28, 14, 8, 6);
    g.fillStyle(0x5a5a62); g.fillRect(29, 15, 6, 4);
    
    // Reflector bowl (inside)
    g.fillStyle(0x2a2a30); g.fillEllipse(32, 10, 24, 10);
    g.fillStyle(0x353540); g.fillEllipse(32, 10, 22, 8);
    g.fillStyle(0x4a4a52); g.fillEllipse(32, 10, 18, 6);
    
    // Light bulb - glowing
    g.fillStyle(0xffee88); g.fillCircle(32, 10, 7);
    g.fillStyle(0xffdd66); g.fillCircle(32, 10, 5);
    g.fillStyle(0xffeeaa); g.fillCircle(31, 9, 3);
    g.fillStyle(0xffffcc); g.fillCircle(30, 8, 1.5);
    
    // Bulb base/socket
    g.fillStyle(0x5a5a62); g.fillRect(29, 15, 6, 4);
    g.fillStyle(0x4a4a52); g.fillRect(30, 16, 4, 3);
    g.fillStyle(0x3a3a42); g.fillRect(31, 17, 2, 2);
    
    // Heat vents on fixture
    g.fillStyle(0x2a2a30); g.fillRect(18, 14, 10, 2);
    g.fillStyle(0x2a2a30); g.fillRect(36, 14, 10, 2);
    
    // Outer glow (will be tinted for flicker)
    g.fillStyle(0xffee88, 0.4); g.fillCircle(32, 10, 12);
    g.fillStyle(0xffee88, 0.2); g.fillCircle(32, 10, 16);
    
    g.generateTexture('gen_light', 64, 24);
    g.clear();

    // Hook - detailed DBD-style meat hook
    // Pole base
    g.fillStyle(0x2a2a30); g.fillRect(14, 18, 6, 46);
    g.fillStyle(0x3a3a42); g.fillRect(15, 18, 2, 46);
    // Base plate
    g.fillStyle(0x4a4a52); g.fillRect(10, 58, 14, 6);
    g.fillStyle(0x3a3a42); g.fillRect(10, 58, 14, 2);
    // Rust spots on base
    g.fillStyle(0x5a3020, 0.6); g.fillCircle(12, 62, 2);
    g.fillStyle(0x5a3020, 0.5); g.fillCircle(20, 61, 1.5);
    // Curved hook arm
    g.fillStyle(0x555560); g.fillRect(14, 4, 5, 16);
    // Hook curve
    g.fillStyle(0x606068); g.fillCircle(18, 14, 6);
    g.fillStyle(0x505058); g.fillCircle(18, 14, 4);
    g.fillStyle(0x4a4a52); g.fillRect(12, 8, 6, 6);
    // Sharp hook point
    g.fillStyle(0x707078); g.fillCircle(13, 10, 3);
    g.fillStyle(0x888890); g.fillCircle(12, 9, 1.5);
    // Chain at top
    g.fillStyle(0x484850); g.fillCircle(17, 2, 3);
    g.fillStyle(0x585860); g.fillCircle(17, 2, 2);
    // Metal highlights
    g.fillStyle(0x888890, 0.4); g.fillRect(15, 20, 1, 40);
    g.fillStyle(0x707078, 0.3); g.fillCircle(16, 12, 2);
    // Rust streaks
    g.fillStyle(0x6a3a28, 0.4); g.fillRect(14, 30, 2, 8);
    g.fillStyle(0x6a3a28, 0.3); g.fillRect(15, 42, 1, 6);
    g.generateTexture('hook', 32, 64);
    g.clear();

    // Gate
    g.fillStyle(0x5a3a1a); g.fillRect(0, 0, 32, 64);
    g.fillStyle(0x7a5a3a); g.fillRect(2, 2, 13, 60); g.fillRect(17, 2, 13, 60);
    g.fillStyle(0x444450); g.fillRect(0, 10, 32, 4); g.fillRect(0, 50, 32, 4);
    g.generateTexture('gate', 32, 64);
    g.clear();

    // Hatch
    g.fillStyle(0x3a3a30); g.fillCircle(20, 20, 20);
    g.fillStyle(0x5a5a4a); g.fillCircle(20, 20, 17);
    g.fillStyle(0x1a1a10); g.fillCircle(20, 20, 10);
    g.generateTexture('hatch', 40, 40);
    g.clear();

    // Survivors
    createSurvivorTextures(g, 's1', 0xc0392b, 0x3d2314);
    createSurvivorTextures(g, 's2', 0x8e44ad, 0x4a3020);
    createSurvivorTextures(g, 's3', 0x27ae60, 0x1a1a1a);
    
    // Pixel art Cyberpunk survivor (s4) - фиолетовые волосы, красная куртка
    createPixelSurvivor(g, 's4', 0xaa00ff, 0xcc0033, 0x2a2a4a);

    // Repairing textures for survivors
    createRepairingTextures(g, 's1', 0xc0392b, 0x3d2314);
    createRepairingTextures(g, 's2', 0x8e44ad, 0x4a3020);
    createRepairingTextures(g, 's3', 0x27ae60, 0x1a1a1a);
    createRepairingTextures(g, 's4', 0xcc0033, 0xaa00ff); // красная куртка для ремонта

    // Dying (crawling) textures for survivors
    createDyingTextures(g, 's1', 0xc0392b, 0x3d2314);
    createDyingTextures(g, 's2', 0x8e44ad, 0x4a3020);
    createDyingTextures(g, 's3', 0x27ae60, 0x1a1a1a);
    createDyingTextures(g, 's4', 0xcc0033, 0xaa00ff); // красная куртка для умирающего

    // Carried (on killer's shoulder) textures for survivors
    createCarriedTextures(g, 's1', 0xc0392b, 0x3d2314);
    createCarriedTextures(g, 's2', 0x8e44ad, 0x4a3020);
    createCarriedTextures(g, 's3', 0x27ae60, 0x1a1a1a);
    createCarriedTextures(g, 's4', 0xcc0033, 0xaa00ff); // красная куртка, фиолетовые волосы

    // ═══════ SCARY KILLER - Menacing silhouette with knife ═══════
    // Shadow - ominous
    g.fillStyle(0x000000, 0.5); g.fillEllipse(45, 120, 58, 18);
    
    // ═══════ BOOTS - Heavy duty ═══════
    // Left boot
    g.fillStyle(0x0a0a0a); g.fillRect(20, 100, 18, 18);
    g.fillStyle(0x151515); g.fillRect(20, 100, 5, 18);
    g.fillStyle(0x080808); g.fillRect(18, 114, 22, 6);
    g.fillStyle(0x0a0a0a); g.fillCircle(28, 110, 7);
    g.fillStyle(0x151515); g.fillCircle(27, 109, 5);
    // Boot rivets
    g.fillStyle(0x3a3a3a); g.fillCircle(24, 104, 2);
    g.fillStyle(0x3a3a3a); g.fillCircle(30, 104, 2);
    
    // Right boot
    g.fillStyle(0x0a0a0a); g.fillRect(52, 100, 18, 18);
    g.fillStyle(0x151515); g.fillRect(52, 100, 5, 18);
    g.fillStyle(0x080808); g.fillRect(50, 114, 22, 6);
    g.fillStyle(0x0a0a0a); g.fillCircle(60, 110, 7);
    g.fillStyle(0x151515); g.fillCircle(59, 109, 5);
    g.fillStyle(0x3a3a3a); g.fillCircle(56, 104, 2);
    g.fillStyle(0x3a3a3a); g.fillCircle(62, 104, 2);
    
    // ═══════ LEGS - Wide stance ═══════
    g.fillStyle(0x0d0d0d); g.fillRect(22, 72, 16, 32);
    g.fillStyle(0x1a1a1a); g.fillRect(22, 72, 5, 32);
    g.fillStyle(0x0d0d0d); g.fillRect(52, 72, 16, 32);
    g.fillStyle(0x1a1a1a); g.fillRect(52, 72, 5, 32);
    
    // ═══════ HEAVY BELT ═══════
    g.fillStyle(0x1a1a1a); g.fillRect(18, 68, 54, 8);
    g.fillStyle(0x252525); g.fillRect(18, 68, 54, 3);
    // Buckle with spikes
    g.fillStyle(0x3a3a3a); g.fillRect(38, 66, 14, 12);
    g.fillStyle(0x4a4a4a); g.fillRect(40, 68, 10, 8);
    g.fillStyle(0x3a3a3a); g.fillCircle(45, 72, 3);
    // Spikes on buckle
    g.fillStyle(0x2a2a2a); g.fillCircle(40, 66, 2);
    g.fillStyle(0x2a2a2a); g.fillCircle(50, 66, 2);
    g.fillStyle(0x2a2a2a); g.fillCircle(45, 64, 2);
    
    // ═══════ BROAD SHOULDERS - Intimidating ═══════
    g.fillStyle(0x0d0d0d); g.fillRect(10, 34, 70, 38);
    g.fillStyle(0x151515); g.fillRect(10, 34, 12, 38);
    g.fillStyle(0x1a1a1a); g.fillRect(68, 34, 12, 38);
    
    // Shoulder spikes
    g.fillStyle(0x2a2a2a); g.fillCircle(8, 36, 6);
    g.fillStyle(0x3a3a3a); g.fillCircle(8, 35, 4);
    g.fillStyle(0x2a2a2a); g.fillCircle(82, 36, 6);
    g.fillStyle(0x3a3a3a); g.fillCircle(82, 35, 4);
    
    // ═══════ LEFT ARM - Holding knife ═══════
    g.fillStyle(0x0d0d0d); g.fillRect(-8, 36, 18, 26);
    g.fillStyle(0x151515); g.fillRect(-8, 36, 5, 26);
    // Forearm
    g.fillStyle(0x0d0d0d); g.fillRect(-14, 58, 20, 16);
    g.fillStyle(0x151515); g.fillRect(-14, 58, 5, 16);
    
    // ═══════ LEFT HAND WITH KNIFE ═══════
    // Glove
    g.fillStyle(0x0a0a0a); g.fillRect(-18, 70, 14, 16);
    g.fillStyle(0x151515); g.fillRect(-18, 70, 4, 16);
    g.fillStyle(0x0a0a0a); g.fillCircle(-10, 84, 8);
    g.fillStyle(0x151515); g.fillCircle(-11, 83, 6);
    
    // KNIFE in hand - menacing
    // Blade (silver metallic)
    g.fillStyle(0x8a8a8a); g.fillRect(-30, 72, 28, 6);
    g.fillStyle(0x9a9a9a); g.fillRect(-30, 72, 28, 2);
    g.fillStyle(0x7a7a7a); g.fillRect(-30, 76, 28, 2);
    // Blade edge highlight
    g.fillStyle(0xaaaaaa); g.fillRect(-28, 73, 24, 1);
    // Blade tip
    g.fillStyle(0x8a8a8a); g.fillTriangle(-2, 72, -2, 78, -8, 75);
    // Blood on blade
    g.fillStyle(0x8B0000, 0.8); g.fillRect(-26, 73, 4, 2);
    g.fillStyle(0xaa2222, 0.6); g.fillRect(-20, 74, 2, 2);
    // Handle
    g.fillStyle(0x2a1a0a); g.fillRect(-42, 72, 14, 6);
    g.fillStyle(0x3a2a1a); g.fillRect(-42, 72, 14, 2);
    // Handle wrap
    g.fillStyle(0x1a0a0a); g.fillRect(-40, 73, 3, 4);
    g.fillStyle(0x1a0a0a); g.fillRect(-34, 73, 3, 4);
    g.fillStyle(0x1a0a0a); g.fillRect(-28, 73, 3, 4);
    // Guard
    g.fillStyle(0x4a4a4a); g.fillRect(-44, 70, 4, 10);
    g.fillStyle(0x5a5a5a); g.fillRect(-44, 70, 2, 10);
    
    // ═══════ RIGHT ARM - Raised menacingly ═══════
    g.fillStyle(0x0d0d0d); g.fillRect(72, 36, 18, 26);
    g.fillStyle(0x151515); g.fillRect(82, 36, 5, 26);
    // Forearm raised
    g.fillStyle(0x0d0d0d); g.fillRect(74, 20, 16, 20);
    g.fillStyle(0x151515); g.fillRect(74, 20, 4, 20);
    
    // Right hand claw-like
    g.fillStyle(0x0a0a0a); g.fillRect(76, 6, 14, 16);
    g.fillStyle(0x151515); g.fillRect(76, 6, 4, 16);
    g.fillStyle(0x0a0a0a); g.fillCircle(84, 18, 8);
    g.fillStyle(0x151515); g.fillCircle(83, 17, 6);
    // Claw fingers
    g.fillStyle(0x0a0a0a); g.fillRect(74, 0, 4, 10);
    g.fillStyle(0x0a0a0a); g.fillRect(80, -2, 4, 12);
    g.fillStyle(0x0a0a0a); g.fillRect(86, 0, 4, 10);
    g.fillStyle(0x0a0a0a); g.fillRect(92, 2, 4, 8);
    
    // ═══════ NECK - Thick, menacing ═══════
    g.fillStyle(0x2a2a2a); g.fillRect(36, 26, 18, 12);
    g.fillStyle(0x3a3a3a); g.fillRect(36, 26, 5, 12);
    
    // ═══════ HEAD - HORROR MASK ═══════
    // Mask base - deformed skull-like
    g.fillStyle(0xd4c4a8); g.fillCircle(45, 10, 22);
    g.fillStyle(0xe4d4b8); g.fillCircle(45, 8, 20);
    g.fillStyle(0xf4e4c8); g.fillCircle(45, 6, 18);
    
    // Mask texture - aged latex/rubber look
    g.fillStyle(0xc4b498); g.fillRect(28, 2, 34, 20);
    g.fillStyle(0xb4a488); g.fillRect(30, 4, 30, 16);
    // Mask seams
    g.fillStyle(0x8a7a68, 0.5); g.fillRect(45, -8, 2, 28);
    g.fillStyle(0x8a7a68, 0.5); g.fillRect(28, 10, 34, 2);
    
    // ═══════ TERROR MASK - Evil eye holes ═══════
    // Eye hole shadows
    g.fillStyle(0x000000); g.fillRect(30, 4, 12, 10);
    g.fillStyle(0x0a0a0a); g.fillRect(32, 6, 8, 6);
    // Glowing red eyes from inside
    g.fillStyle(0xff0000); g.fillCircle(36, 9, 3);
    g.fillStyle(0xff3333); g.fillCircle(36, 8, 2);
    // Eye bloodshot effect
    g.fillStyle(0xaa0000); g.fillCircle(35, 9, 1);
    g.fillStyle(0xaa0000); g.fillCircle(37, 10, 1);
    
    g.fillStyle(0x000000); g.fillRect(48, 4, 12, 10);
    g.fillStyle(0x0a0a0a); g.fillRect(50, 6, 8, 6);
    g.fillStyle(0xff0000); g.fillCircle(54, 9, 3);
    g.fillStyle(0xff3333); g.fillCircle(54, 8, 2);
    g.fillStyle(0xaa0000); g.fillCircle(53, 9, 1);
    g.fillStyle(0xaa0000); g.fillCircle(55, 10, 1);
    
    // Eye hole jagged edges
    g.fillStyle(0xa09070); g.fillTriangle(30, 4, 42, 4, 38, 6);
    g.fillStyle(0xa09070); g.fillTriangle(48, 4, 60, 4, 52, 6);
    
    // ═══════ MASK MOUTH - Screaming/grimace ═══════
    g.fillStyle(0x1a1a1a); g.fillRect(34, 18, 22, 10);
    // Teeth - jagged
    g.fillStyle(0xe8e8e8); g.fillRect(36, 18, 3, 8);
    g.fillStyle(0xd8d8d8); g.fillRect(36, 18, 3, 2);
    g.fillStyle(0xe8e8e8); g.fillRect(41, 18, 3, 7);
    g.fillStyle(0xd8d8d8); g.fillRect(41, 18, 3, 2);
    g.fillStyle(0xe8e8e8); g.fillRect(46, 18, 3, 8);
    g.fillStyle(0xd8d8d8); g.fillRect(46, 18, 3, 2);
    g.fillStyle(0xe8e8e8); g.fillRect(51, 18, 3, 7);
    g.fillStyle(0xd8d8d8); g.fillRect(51, 18, 3, 2);
    // Blood dripping from mouth
    g.fillStyle(0x8B0000); g.fillRect(38, 26, 3, 6);
    g.fillStyle(0xaa0000); g.fillCircle(39, 32, 2);
    g.fillStyle(0x8B0000); g.fillRect(50, 26, 3, 4);
    g.fillStyle(0xaa0000); g.fillCircle(51, 30, 2);
    
    // ═══════ MASK DETAILS ═══════
    // Scars on mask
    g.fillStyle(0x9a8a78, 0.6); g.fillRect(26, 8, 8, 2);
    g.fillStyle(0x8a7a68, 0.6); g.fillRect(56, 12, 6, 2);
    // Blood stains on mask
    g.fillStyle(0x8B0000, 0.4); g.fillCircle(62, 6, 4);
    g.fillStyle(0x8B0000, 0.3); g.fillCircle(28, 14, 3);
    
    // ═══════ DARK HOOD - Covering back of head ═══════
    g.fillStyle(0x0a0a0a); g.fillCircle(45, 0, 20);
    g.fillStyle(0x0d0d0d); g.fillCircle(45, -2, 18);
    g.fillStyle(0x0a0a0a); g.fillRect(26, -2, 38, 12);
    // Hood shadow on face
    g.fillStyle(0x050505, 0.3); g.fillRect(24, 2, 42, 4);
    
    // ═══════ SHOULDER CAPES/CLAWS ═══════
    g.fillStyle(0x0d0d0d); g.fillRect(6, 34, 8, 30);
    g.fillStyle(0x151515); g.fillRect(6, 34, 3, 30);
    g.fillStyle(0x0d0d0d); g.fillRect(76, 34, 8, 30);
    g.fillStyle(0x151515); g.fillRect(81, 34, 3, 30);
    
    // ═══════ BLOOD STAINS on clothing ═══════
    g.fillStyle(0x8B0000, 0.5); g.fillCircle(25, 50, 4);
    g.fillStyle(0x8B0000, 0.4); g.fillCircle(65, 55, 3);
    g.fillStyle(0x8B0000, 0.3); g.fillCircle(40, 60, 2);
    
    // ═══════ SHADOW EFFECTS ═══════
    g.fillStyle(0x000000, 0.15); g.fillRect(12, 34, 4, 38);
    g.fillStyle(0x000000, 0.1); g.fillRect(74, 34, 4, 38);
    
    g.generateTexture('killer', 90, 125);
    g.clear();

    // ═══════ KILLER STRIKE - Attack pose with knife ═══════
    // Shadow - wider for lunge
    g.fillStyle(0x000000, 0.5); g.fillEllipse(45, 120, 70, 20);
    
    // ═══════ LEGS - Lunging stance ═══════
    // Left boot - planted back
    g.fillStyle(0x0a0a0a); g.fillRect(20, 100, 18, 18);
    g.fillStyle(0x151515); g.fillRect(20, 100, 5, 18);
    g.fillStyle(0x080808); g.fillRect(18, 114, 22, 6);
    g.fillStyle(0x0a0a0a); g.fillCircle(28, 110, 7);
    
    // Left leg
    g.fillStyle(0x0d0d0d); g.fillRect(24, 74, 16, 30);
    g.fillStyle(0x1a1a1a); g.fillRect(24, 74, 5, 30);
    
    // Right boot - lunging forward
    g.fillStyle(0x0a0a0a); g.fillRect(56, 100, 18, 18);
    g.fillStyle(0x151515); g.fillRect(56, 100, 5, 18);
    g.fillStyle(0x080808); g.fillRect(54, 114, 22, 6);
    g.fillStyle(0x0a0a0a); g.fillCircle(64, 110, 7);
    
    // Right leg - extended
    g.fillStyle(0x0d0d0d); g.fillRect(54, 78, 16, 26);
    g.fillStyle(0x1a1a1a); g.fillRect(54, 78, 5, 26);
    
    // ═══════ BELT with spikes ═══════
    g.fillStyle(0x1a1a1a); g.fillRect(18, 70, 54, 8);
    g.fillStyle(0x252525); g.fillRect(18, 70, 54, 3);
    // Spiked buckle
    g.fillStyle(0x3a3a3a); g.fillRect(38, 68, 14, 12);
    g.fillStyle(0x4a4a4a); g.fillCircle(45, 74, 3);
    // Buckle spikes
    g.fillStyle(0x2a2a2a); g.fillCircle(40, 68, 2);
    g.fillStyle(0x2a2a2a); g.fillCircle(50, 68, 2);
    g.fillStyle(0x2a2a2a); g.fillCircle(45, 64, 2);
    
    // ═══════ TORSO - Leaning forward aggressively ═══════
    g.fillStyle(0x0d0d0d); g.fillRect(12, 36, 66, 38);
    g.fillStyle(0x151515); g.fillRect(12, 36, 10, 38);
    g.fillStyle(0x1a1a1a); g.fillRect(68, 36, 10, 38);
    
    // Motion blur effect
    g.fillStyle(0x080808, 0.3); g.fillRect(8, 38, 6, 34);
    g.fillStyle(0x050505, 0.2); g.fillRect(4, 40, 4, 30);
    
    // Shoulder spikes
    g.fillStyle(0x2a2a2a); g.fillCircle(10, 38, 7);
    g.fillStyle(0x3a3a3a); g.fillCircle(10, 37, 5);
    g.fillStyle(0x2a2a2a); g.fillCircle(80, 38, 7);
    g.fillStyle(0x3a3a3a); g.fillCircle(80, 37, 5);
    
    // ═══════ LEFT ARM - Raised with knife ═══════
    g.fillStyle(0x0d0d0d); g.fillRect(-4, 38, 18, 24);
    g.fillStyle(0x151515); g.fillRect(-4, 38, 5, 24);
    // Forearm raised
    g.fillStyle(0x0d0d0d); g.fillRect(-10, 12, 18, 28);
    g.fillStyle(0x151515); g.fillRect(-10, 12, 5, 28);
    
    // Left hand
    g.fillStyle(0x0a0a0a); g.fillRect(-14, 6, 14, 14);
    g.fillStyle(0x151515); g.fillRect(-14, 6, 4, 14);
    g.fillStyle(0x0a0a0a); g.fillCircle(-6, 16, 8);
    g.fillStyle(0x151515); g.fillCircle(-7, 15, 6);
    
    // ═══════ KNIFE - Extended forward for strike ═══════
    // Blade (longer for striking)
    g.fillStyle(0x9a9a9a); g.fillRect(4, 8, 50, 8);
    g.fillStyle(0xaaaaaa); g.fillRect(4, 8, 50, 3);
    g.fillStyle(0x8a8a8a); g.fillRect(4, 13, 50, 3);
    // Blade edge gleam
    g.fillStyle(0xcccccc); g.fillRect(6, 9, 46, 1);
    // Blood trail on blade
    g.fillStyle(0x8B0000); g.fillRect(8, 10, 8, 3);
    g.fillStyle(0xaa2222); g.fillRect(20, 11, 4, 2);
    g.fillStyle(0x8B0000); g.fillRect(30, 10, 6, 3);
    // Blade tip - sharp point
    g.fillStyle(0x9a9a9a); g.fillTriangle(54, 8, 54, 16, 68, 12);
    // Handle
    g.fillStyle(0x2a1a0a); g.fillRect(-24, 8, 30, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(-24, 8, 30, 3);
    // Handle wrap pattern
    g.fillStyle(0x1a0a0a); g.fillRect(-22, 9, 4, 6);
    g.fillStyle(0x1a0a0a); g.fillRect(-14, 9, 4, 6);
    g.fillStyle(0x1a0a0a); g.fillRect(-6, 9, 4, 6);
    g.fillStyle(0x1a0a0a); g.fillRect(2, 9, 4, 6);
    // Guard
    g.fillStyle(0x4a4a4a); g.fillRect(-28, 4, 6, 16);
    g.fillStyle(0x5a5a5a); g.fillRect(-28, 4, 3, 16);
    // Guard spikes
    g.fillStyle(0x3a3a3a); g.fillCircle(-30, 6, 3);
    g.fillStyle(0x3a3a3a); g.fillCircle(-30, 18, 3);
    
    // ═══════ RIGHT ARM - Clawed threat pose ═══════
    g.fillStyle(0x0d0d0d); g.fillRect(74, 36, 18, 26);
    g.fillStyle(0x151515); g.fillRect(84, 36, 5, 26);
    // Forearm
    g.fillStyle(0x0d0d0d); g.fillRect(76, 16, 18, 24);
    g.fillStyle(0x151515); g.fillRect(76, 16, 5, 24);
    
    // Clawed hand
    g.fillStyle(0x0a0a0a); g.fillRect(78, 2, 16, 16);
    g.fillStyle(0x151515); g.fillRect(78, 2, 4, 16);
    g.fillStyle(0x0a0a0a); g.fillCircle(88, 14, 8);
    g.fillStyle(0x151515); g.fillCircle(87, 13, 6);
    // Claws extended
    g.fillStyle(0x3a3a3a); g.fillRect(76, -8, 5, 14);
    g.fillStyle(0x4a4a4a); g.fillRect(76, -8, 2, 14);
    g.fillStyle(0x3a3a3a); g.fillRect(84, -12, 5, 16);
    g.fillStyle(0x4a4a4a); g.fillRect(84, -12, 2, 16);
    g.fillStyle(0x3a3a3a); g.fillRect(92, -8, 5, 14);
    g.fillStyle(0x4a4a4a); g.fillRect(92, -8, 2, 14);
    g.fillStyle(0x3a3a3a); g.fillRect(100, -4, 4, 12);
    g.fillStyle(0x4a4a4a); g.fillRect(100, -4, 2, 12);
    
    // ═══════ NECK - Tense ═══════
    g.fillStyle(0x2a2a2a); g.fillRect(38, 28, 14, 12);
    g.fillStyle(0x3a3a3a); g.fillRect(38, 28, 4, 12);
    
    // ═══════ HEAD - TERROR MASK attacking ═══════
    // Mask - tilted aggressively forward
    g.fillStyle(0xd4c4a8); g.fillCircle(45, 12, 22);
    g.fillStyle(0xe4d4b8); g.fillCircle(45, 10, 20);
    g.fillStyle(0xf4e4c8); g.fillCircle(45, 8, 18);
    
    // Mask seams and damage
    g.fillStyle(0xc4b498); g.fillRect(28, 4, 34, 20);
    g.fillStyle(0xb4a488); g.fillRect(30, 6, 30, 16);
    g.fillStyle(0x8a7a68, 0.5); g.fillRect(45, -6, 2, 28);
    g.fillStyle(0x8a7a68, 0.5); g.fillRect(28, 12, 34, 2);
    
    // ═══════ GLOWING RED EYES - Anger ═══════
    // Left eye - burning red
    g.fillStyle(0x000000); g.fillRect(28, 4, 14, 12);
    g.fillStyle(0x0a0a0a); g.fillRect(30, 6, 10, 8);
    g.fillStyle(0xff0000); g.fillCircle(35, 10, 5);
    g.fillStyle(0xff3333); g.fillCircle(35, 9, 4);
    g.fillStyle(0xff5555); g.fillCircle(34, 8, 2);
    // Bloodshot veins
    g.fillStyle(0xaa0000); g.fillRect(32, 10, 6, 1);
    g.fillStyle(0x880000); g.fillRect(36, 8, 4, 1);
    
    // Right eye - burning red
    g.fillStyle(0x000000); g.fillRect(48, 4, 14, 12);
    g.fillStyle(0x0a0a0a); g.fillRect(50, 6, 10, 8);
    g.fillStyle(0xff0000); g.fillCircle(55, 10, 5);
    g.fillStyle(0xff3333); g.fillCircle(55, 9, 4);
    g.fillStyle(0xff5555); g.fillCircle(54, 8, 2);
    g.fillStyle(0xaa0000); g.fillRect(52, 10, 6, 1);
    g.fillStyle(0x880000); g.fillRect(50, 8, 4, 1);
    
    // Eye hole jagged edges
    g.fillStyle(0xa09070); g.fillTriangle(28, 4, 42, 4, 34, 6);
    g.fillStyle(0xa09070); g.fillTriangle(48, 4, 62, 4, 56, 6);
    
    // ═══════ MOUTH - SNARLING ═══════
    g.fillStyle(0x1a1a1a); g.fillRect(32, 20, 26, 12);
    // Jagged teeth
    g.fillStyle(0xe8e8e8); g.fillRect(34, 20, 4, 10);
    g.fillStyle(0xd8d8d8); g.fillRect(34, 20, 4, 2);
    g.fillStyle(0xe8e8e8); g.fillRect(40, 20, 4, 9);
    g.fillStyle(0xd8d8d8); g.fillRect(40, 20, 4, 2);
    g.fillStyle(0xe8e8e8); g.fillRect(46, 20, 4, 10);
    g.fillStyle(0xd8d8d8); g.fillRect(46, 20, 4, 2);
    g.fillStyle(0xe8e8e8); g.fillRect(52, 20, 4, 9);
    g.fillStyle(0xd8d8d8); g.fillRect(52, 20, 4, 2);
    // Blood dripping
    g.fillStyle(0x8B0000); g.fillRect(36, 30, 4, 8);
    g.fillStyle(0xaa0000); g.fillCircle(38, 38, 3);
    g.fillStyle(0x8B0000); g.fillRect(50, 30, 4, 6);
    g.fillStyle(0xaa0000); g.fillCircle(52, 36, 3);
    
    // ═══════ MASK SCARS AND DAMAGE ═══════
    g.fillStyle(0x9a8a78, 0.6); g.fillRect(24, 8, 10, 2);
    g.fillStyle(0x8a7a68, 0.6); g.fillRect(56, 14, 8, 2);
    // Blood stains
    g.fillStyle(0x8B0000, 0.5); g.fillCircle(64, 6, 5);
    g.fillStyle(0x8B0000, 0.4); g.fillCircle(26, 16, 4);
    g.fillStyle(0x8B0000, 0.3); g.fillCircle(20, 8, 3);
    
    // ═══════ DARK HOOD ═══════
    g.fillStyle(0x0a0a0a); g.fillCircle(45, 2, 20);
    g.fillStyle(0x0d0d0d); g.fillCircle(45, 0, 18);
    g.fillStyle(0x0a0a0a); g.fillRect(26, 0, 38, 12);
    g.fillStyle(0x050505, 0.4); g.fillRect(24, 4, 42, 4);
    
    // Shoulder spikes/capes
    g.fillStyle(0x0d0d0d); g.fillRect(8, 36, 8, 32);
    g.fillStyle(0x151515); g.fillRect(8, 36, 3, 32);
    g.fillStyle(0x0d0d0d); g.fillRect(74, 36, 8, 32);
    g.fillStyle(0x151515); g.fillRect(79, 36, 3, 32);
    
    // ═══════ BLOOD STAINS ═══════
    g.fillStyle(0x8B0000, 0.6); g.fillCircle(26, 52, 5);
    g.fillStyle(0x8B0000, 0.5); g.fillCircle(64, 58, 4);
    g.fillStyle(0x8B0000, 0.4); g.fillCircle(42, 62, 3);
    g.fillStyle(0x8B0000, 0.3); g.fillCircle(18, 48, 3);
    
    // ═══════ SHADOW EFFECTS ═══════
    g.fillStyle(0x000000, 0.15); g.fillRect(14, 36, 4, 38);
    g.fillStyle(0x000000, 0.1); g.fillRect(72, 36, 4, 38);
    
    // ═══════ ACTION LINES - Speed effect ═══════
    g.fillStyle(0x3a3a3a, 0.3); g.fillRect(60, 10, 40, 2);
    g.fillStyle(0x3a3a3a, 0.2); g.fillRect(56, 14, 36, 2);
    g.fillStyle(0x3a3a3a, 0.15); g.fillRect(52, 18, 32, 2);
    
    g.generateTexture('killer_strike', 130, 130);
    g.clear();

    g.destroy();
}

function createSurvivorTextures(g, name, shirtColor, hairColor) {
    // ═══════ DETAILED 3D-STYLE SURVIVOR ═══════
    // Shadow under feet
    g.fillStyle(0x000000, 0.35); g.fillEllipse(32, 112, 38, 12);
    
    // ═══════ SNEAKERS - Detailed athletic shoes ═══════
    // Left shoe
    g.fillStyle(0x4a4a4a); g.fillRect(18, 98, 14, 10);
    g.fillStyle(0x5a5a5a); g.fillRect(18, 98, 14, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(18, 98, 4, 10);
    // Shoe toe
    g.fillStyle(0x4a4a4a); g.fillCircle(25, 102, 5);
    g.fillStyle(0x5a5a5a); g.fillCircle(25, 101, 4);
    // Shoe sole
    g.fillStyle(0x2a2a2a); g.fillRect(16, 106, 18, 4);
    g.fillStyle(0x3a3a3a); g.fillRect(16, 106, 5, 4);
    // Shoe laces
    g.fillStyle(0xffffff); g.fillRect(20, 100, 1, 6);
    g.fillStyle(0xffffff); g.fillRect(24, 100, 1, 6);
    
    // Right shoe
    g.fillStyle(0x4a4a4a); g.fillRect(40, 98, 14, 10);
    g.fillStyle(0x5a5a5a); g.fillRect(40, 98, 14, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(40, 98, 4, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(47, 102, 5);
    g.fillStyle(0x5a5a5a); g.fillCircle(47, 101, 4);
    g.fillStyle(0x2a2a2a); g.fillRect(38, 106, 18, 4);
    g.fillStyle(0x3a3a3a); g.fillRect(38, 106, 5, 4);
    g.fillStyle(0xffffff); g.fillRect(42, 100, 1, 6);
    g.fillStyle(0xffffff); g.fillRect(46, 100, 1, 6);
    
    // ═══════ JEANS - Detailed pants ═══════
    // Left leg
    g.fillStyle(0x2c3e70); g.fillRect(18, 66, 12, 36);
    g.fillStyle(0x3c4e80); g.fillRect(18, 66, 3, 36);
    g.fillStyle(0x1c2e60); g.fillRect(18, 66, 12, 2);
    // Jean pocket
    g.fillStyle(0x2c3e70); g.fillRect(19, 70, 8, 6);
    g.fillStyle(0x1c2e60); g.fillRect(19, 70, 8, 1);
    // Jean stitch
    g.fillStyle(0x4c5e90); g.fillRect(20, 74, 6, 1);
    // Knee
    g.fillStyle(0x3c4e80); g.fillCircle(24, 84, 4);
    
    // Right leg
    g.fillStyle(0x2c3e70); g.fillRect(42, 66, 12, 36);
    g.fillStyle(0x3c4e80); g.fillRect(42, 66, 3, 36);
    g.fillStyle(0x1c2e60); g.fillRect(42, 66, 12, 2);
    g.fillStyle(0x2c3e70); g.fillRect(43, 70, 8, 6);
    g.fillStyle(0x1c2e60); g.fillRect(43, 70, 8, 1);
    g.fillStyle(0x4c5e90); g.fillRect(44, 74, 6, 1);
    g.fillStyle(0x3c4e80); g.fillCircle(48, 84, 4);
    
    // Belt
    g.fillStyle(0x5a4a3a); g.fillRect(16, 62, 40, 5);
    g.fillStyle(0x6a5a4a); g.fillRect(16, 62, 40, 2);
    // Belt buckle
    g.fillStyle(0x8a7a6a); g.fillRect(30, 61, 6, 7);
    g.fillStyle(0x9a8a7a); g.fillRect(31, 62, 4, 5);
    
    // ═══════ SHIRT - Detailed clothing ═══════
    // Main body
    g.fillStyle(shirtColor); g.fillRect(14, 30, 44, 36);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(14, 30, 6, 36);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(52, 30, 6, 36);
    g.fillStyle(shirtColor + 0x222222); g.fillRect(14, 30, 44, 2);
    
    // Shirt shading
    g.fillStyle(shirtColor - 0x111111); g.fillRect(16, 32, 40, 32);
    
    // Collar
    g.fillStyle(shirtColor - 0x222222); g.fillRect(28, 28, 16, 6);
    g.fillStyle(shirtColor - 0x333333); g.fillRect(28, 28, 16, 2);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(30, 30, 6, 4);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(36, 30, 6, 4);
    
    // Button placket
    g.fillStyle(shirtColor - 0x222222); g.fillRect(34, 32, 4, 32);
    g.fillStyle(shirtColor - 0x333333); g.fillRect(35, 32, 2, 32);
    // Buttons
    g.fillStyle(0xcccccc); g.fillCircle(36, 38, 2);
    g.fillStyle(0xcccccc); g.fillCircle(36, 48, 2);
    g.fillStyle(0xcccccc); g.fillCircle(36, 58, 2);
    
    // ═══════ ARMS ═══════
    // Left arm upper
    g.fillStyle(shirtColor); g.fillRect(4, 32, 12, 20);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(4, 32, 3, 20);
    
    // Left forearm
    g.fillStyle(0xffccaa); g.fillRect(2, 48, 14, 14);
    g.fillStyle(0xeebb99); g.fillRect(2, 48, 3, 14);
    // Forearm muscle
    g.fillStyle(0xeebb99); g.fillCircle(6, 54, 4);
    g.fillStyle(0xeebb99); g.fillCircle(12, 54, 4);
    
    // Left hand
    g.fillStyle(0xffccaa); g.fillRect(-2, 58, 12, 10);
    g.fillStyle(0xeebb99); g.fillRect(-2, 58, 3, 10);
    g.fillStyle(0xffccaa); g.fillCircle(5, 66, 6);
    g.fillStyle(0xeebb99); g.fillCircle(5, 65, 5);
    g.fillStyle(0xeebb99); g.fillCircle(5, 65, 4);
    // Fingers
    g.fillStyle(0xffccaa); g.fillRect(-4, 64, 3, 8);
    g.fillStyle(0xffccaa); g.fillRect(0, 66, 3, 9);
    g.fillStyle(0xffccaa); g.fillRect(4, 64, 3, 8);
    g.fillStyle(0xffccaa); g.fillRect(8, 62, 3, 7);
    
    // Right arm upper
    g.fillStyle(shirtColor); g.fillRect(56, 32, 12, 20);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(57, 32, 3, 20);
    
    // Right forearm
    g.fillStyle(0xffccaa); g.fillRect(56, 48, 14, 14);
    g.fillStyle(0xeebb99); g.fillRect(68, 48, 3, 14);
    g.fillStyle(0xeebb99); g.fillCircle(60, 54, 4);
    g.fillStyle(0xeebb99); g.fillCircle(66, 54, 4);
    
    // Right hand
    g.fillStyle(0xffccaa); g.fillRect(60, 58, 12, 10);
    g.fillStyle(0xeebb99); g.fillRect(69, 58, 3, 10);
    g.fillStyle(0xffccaa); g.fillCircle(67, 66, 6);
    g.fillStyle(0xeebb99); g.fillCircle(67, 65, 5);
    g.fillStyle(0xeebb99); g.fillCircle(67, 65, 4);
    g.fillStyle(0xffccaa); g.fillRect(58, 64, 3, 8);
    g.fillStyle(0xffccaa); g.fillRect(62, 66, 3, 9);
    g.fillStyle(0xffccaa); g.fillRect(66, 64, 3, 8);
    g.fillStyle(0xffccaa); g.fillRect(70, 62, 3, 7);
    
    // ═══════ NECK ═══════
    g.fillStyle(0xffccaa); g.fillRect(30, 24, 12, 8);
    g.fillStyle(0xeebb99); g.fillRect(30, 24, 3, 8);
    // Neck shadow
    g.fillStyle(0xddbb99); g.fillRect(32, 26, 2, 5);
    g.fillStyle(0xddbb99); g.fillRect(38, 26, 2, 5);
    
    // ═══════ HEAD - 3D realistic ═══════
    // Skull base
    g.fillStyle(0xffccaa); g.fillCircle(36, 14, 16);
    g.fillStyle(0xeebb99); g.fillCircle(36, 12, 14);
    g.fillStyle(0xddbbaa); g.fillCircle(36, 10, 12);
    
    // Cheekbones
    g.fillStyle(0xeebb99); g.fillCircle(26, 14, 5);
    g.fillStyle(0xeebb99); g.fillCircle(46, 14, 5);
    
    // Jaw
    g.fillStyle(0xffccaa); g.fillRect(26, 20, 20, 6);
    g.fillStyle(0xeebb99); g.fillRect(28, 24, 16, 4);
    
    // ═══════ EARS ═══════
    g.fillStyle(0xffccaa); g.fillCircle(20, 14, 4);
    g.fillStyle(0xeebb99); g.fillCircle(20, 13, 3);
    g.fillStyle(0xddbbaa); g.fillCircle(20, 12, 2);
    g.fillStyle(0xccaa99); g.fillCircle(20, 14, 1);
    
    g.fillStyle(0xffccaa); g.fillCircle(52, 14, 4);
    g.fillStyle(0xeebb99); g.fillCircle(52, 13, 3);
    g.fillStyle(0xddbbaa); g.fillCircle(52, 12, 2);
    g.fillStyle(0xccaa99); g.fillCircle(52, 14, 1);
    
    // ═══════ HAIR - Detailed style ═══════
    g.fillStyle(hairColor); g.fillCircle(36, 4, 14);
    g.fillStyle(hairColor - 0x111111); g.fillCircle(36, 2, 12);
    g.fillStyle(hairColor - 0x222222); g.fillCircle(36, 0, 10);
    g.fillStyle(hairColor - 0x222222); g.fillCircle(34, -2, 7);
    g.fillStyle(hairColor - 0x333333); g.fillCircle(32, -3, 5);
    
    // Hair volume and style
    g.fillStyle(hairColor); g.fillRect(22, -2, 28, 10);
    g.fillStyle(hairColor - 0x111111); g.fillRect(24, 0, 24, 6);
    // Hair texture
    g.fillStyle(hairColor - 0x222222); g.fillRect(28, -2, 2, 6);
    g.fillStyle(hairColor - 0x222222); g.fillRect(34, -3, 2, 7);
    g.fillStyle(hairColor - 0x222222); g.fillRect(40, -2, 2, 6);
    
    // Side hair
    g.fillStyle(hairColor); g.fillRect(21, 4, 5, 8);
    g.fillStyle(hairColor - 0x111111); g.fillRect(21, 4, 2, 8);
    g.fillStyle(hairColor); g.fillRect(46, 4, 5, 8);
    g.fillStyle(hairColor - 0x111111); g.fillRect(49, 4, 2, 8);
    
    // ═══════ FACE - Detailed features ═══════
    // Eyebrows
    g.fillStyle(hairColor - 0x333333); g.fillRect(24, 8, 8, 2);
    g.fillStyle(hairColor - 0x333333); g.fillRect(44, 8, 8, 2);
    g.fillStyle(hairColor - 0x444444); g.fillRect(24, 8, 8, 1);
    g.fillStyle(hairColor - 0x444444); g.fillRect(44, 8, 8, 1);
    
    // Eyes - detailed
    g.fillStyle(0xffffff); g.fillCircle(28, 13, 5);
    g.fillStyle(0x222222); g.fillCircle(28, 13, 3);
    g.fillStyle(0x111111); g.fillCircle(28, 13, 2);
    g.fillStyle(0xffffff); g.fillCircle(27, 12, 1);
    // Eye shadow
    g.fillStyle(0xddbbaa); g.fillRect(23, 10, 10, 2);
    
    g.fillStyle(0xffffff); g.fillCircle(44, 13, 5);
    g.fillStyle(0x222222); g.fillCircle(44, 13, 3);
    g.fillStyle(0x111111); g.fillCircle(44, 13, 2);
    g.fillStyle(0xffffff); g.fillCircle(43, 12, 1);
    g.fillStyle(0xddbbaa); g.fillRect(39, 10, 10, 2);
    
    // Eyelashes
    g.fillStyle(0x222222); g.fillRect(24, 10, 1, 2);
    g.fillStyle(0x222222); g.fillRect(26, 9, 1, 2);
    g.fillStyle(0x222222); g.fillRect(30, 9, 1, 2);
    g.fillStyle(0x222222); g.fillRect(32, 10, 1, 2);
    g.fillStyle(0x222222); g.fillRect(40, 10, 1, 2);
    g.fillStyle(0x222222); g.fillRect(42, 9, 1, 2);
    g.fillStyle(0x222222); g.fillRect(46, 9, 1, 2);
    g.fillStyle(0x222222); g.fillRect(48, 10, 1, 2);
    
    // Nose
    g.fillStyle(0xeebb99); g.fillEllipse(36, 18, 4, 5);
    g.fillStyle(0xddbbaa); g.fillEllipse(36, 19, 2, 2);
    // Nose bridge
    g.fillStyle(0xeebb99); g.fillRect(34, 14, 4, 5);
    
    // Mouth
    g.fillStyle(0xcc8877); g.fillRect(30, 24, 12, 4);
    g.fillStyle(0xdd9988); g.fillRect(30, 24, 12, 2);
    // Lips
    g.fillStyle(0xcc8877); g.fillRect(32, 26, 8, 2);
    g.fillStyle(0xbb7766); g.fillRect(33, 27, 6, 1);
    
    // ═══════ 3D LIGHTING ═══════
    // Rim light
    g.fillStyle(0xffffff, 0.1); g.fillRect(14, 30, 2, 36);
    // Ambient shadow
    g.fillStyle(0x000000, 0.05); g.fillRect(16, 64, 40, 2);
    
    g.generateTexture(name, 72, 120);
    g.clear();
}

// Create Cyberpunk-style pixel art survivor (48x80 pixels, displayed 1.5x)
function createPixelSurvivor(g, name, hairColor, jacketColor, pantsColor) {
    const scale = 1;
    const w = 48, h = 80;
    const cx = w / 2;
    
    // Shadow
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(cx, 76, 20, 6);
    
    // === BOOTS ===
    // Left boot
    g.fillStyle(0x1a1a1a); g.fillRect(12, 68, 10, 8);
    g.fillStyle(0x2a2a2a); g.fillRect(12, 68, 10, 2);
    g.fillStyle(0x0a0a0a); g.fillRect(10, 74, 14, 4);
    // Boot detail
    g.fillStyle(0x333333); g.fillRect(14, 70, 1, 4);
    g.fillStyle(0x333333); g.fillRect(18, 70, 1, 4);
    
    // Right boot
    g.fillStyle(0x1a1a1a); g.fillRect(26, 68, 10, 8);
    g.fillStyle(0x2a2a2a); g.fillRect(26, 68, 10, 2);
    g.fillStyle(0x0a0a0a); g.fillRect(24, 74, 14, 4);
    g.fillStyle(0x333333); g.fillRect(28, 70, 1, 4);
    g.fillStyle(0x333333); g.fillRect(32, 70, 1, 4);
    
    // === PANTS ===
    g.fillStyle(pantsColor); g.fillRect(14, 52, 9, 18);
    g.fillStyle(pantsColor - 0x111111); g.fillRect(14, 52, 3, 18);
    g.fillStyle(pantsColor - 0x222222); g.fillRect(25, 52, 9, 18);
    g.fillStyle(pantsColor - 0x111111); g.fillRect(25, 52, 3, 18);
    // Belt
    g.fillStyle(0x333333); g.fillRect(12, 50, 24, 4);
    g.fillStyle(0x444444); g.fillRect(20, 49, 8, 6);
    g.fillStyle(0x666666); g.fillRect(22, 50, 4, 4);
    
    // === JACKET ===
    g.fillStyle(jacketColor); g.fillRect(10, 28, 28, 24);
    g.fillStyle(jacketColor + 0x111111); g.fillRect(10, 28, 5, 24);
    g.fillStyle(jacketColor - 0x111111); g.fillRect(33, 28, 5, 24);
    // Zipper
    g.fillStyle(0x888888); g.fillRect(23, 28, 2, 24);
    g.fillStyle(0xaaaaaa); g.fillRect(23, 28, 1, 24);
    // Collar
    g.fillStyle(jacketColor - 0x222222); g.fillRect(14, 26, 20, 4);
    // Pockets
    g.fillStyle(jacketColor - 0x333333); g.fillRect(12, 38, 8, 8);
    g.fillStyle(jacketColor - 0x222222); g.fillRect(12, 38, 8, 2);
    g.fillStyle(jacketColor - 0x333333); g.fillRect(28, 38, 8, 8);
    g.fillStyle(jacketColor - 0x222222); g.fillRect(28, 38, 8, 2);
    
    // === ARMS ===
    // Left arm
    g.fillStyle(jacketColor); g.fillRect(4, 30, 8, 16);
    g.fillStyle(jacketColor - 0x111111); g.fillRect(4, 30, 3, 16);
    // Left hand
    g.fillStyle(0xd4a574); g.fillRect(3, 44, 10, 6);
    g.fillStyle(0xc49564); g.fillRect(3, 44, 3, 6);
    
    // Right arm
    g.fillStyle(jacketColor); g.fillRect(36, 30, 8, 16);
    g.fillStyle(jacketColor - 0x111111); g.fillRect(36, 30, 3, 16);
    // Right hand
    g.fillStyle(0xd4a574); g.fillRect(35, 44, 10, 6);
    g.fillStyle(0xc49564); g.fillRect(35, 44, 3, 6);
    
    // === HEAD ===
    // Neck
    g.fillStyle(0xd4a574); g.fillRect(20, 24, 8, 4);
    
    // Head base
    g.fillStyle(0xd4a574); g.fillRect(14, 6, 20, 20);
    g.fillStyle(0xc49564); g.fillRect(14, 6, 4, 20);
    g.fillStyle(0xe4b584); g.fillRect(30, 6, 4, 20);
    
    // === HAIR (Neon style) ===
    g.fillStyle(hairColor); g.fillRect(12, 2, 24, 8);
    g.fillStyle(hairColor - 0x222222); g.fillRect(12, 2, 4, 8);
    // Neon streaks
    g.fillStyle(hairColor + 0x444444); g.fillRect(14, 4, 2, 4);
    g.fillStyle(hairColor + 0x444444); g.fillRect(20, 4, 2, 4);
    g.fillStyle(hairColor + 0x444444); g.fillRect(26, 4, 2, 4);
    // Side hair
    g.fillStyle(hairColor); g.fillRect(10, 6, 4, 10);
    g.fillStyle(hairColor); g.fillRect(34, 6, 4, 10);
    
    // === FACE ===
    // Eyes
    g.fillStyle(0xffffff); g.fillRect(16, 12, 5, 4);
    g.fillStyle(0xffffff); g.fillRect(27, 12, 5, 4);
    g.fillStyle(0x222222); g.fillRect(18, 13, 3, 3);
    g.fillStyle(0x222222); g.fillRect(29, 13, 3, 3);
    // Eye glow
    g.fillStyle(0x88ffff); g.fillRect(18, 13, 1, 1);
    g.fillStyle(0x88ffff); g.fillRect(29, 13, 1, 1);
    
    // Eyebrows
    g.fillStyle(hairColor - 0x333333); g.fillRect(16, 10, 5, 1);
    g.fillStyle(hairColor - 0x333333); g.fillRect(27, 10, 5, 1);
    
    // Nose
    g.fillStyle(0xc49564); g.fillRect(22, 16, 2, 3);
    
    // Mouth
    g.fillStyle(0xaa6655); g.fillRect(20, 20, 8, 2);
    g.fillStyle(0x996655); g.fillRect(22, 20, 4, 1);
    
    // Ears
    g.fillStyle(0xc49564); g.fillRect(12, 14, 2, 4);
    g.fillStyle(0xc49564); g.fillRect(34, 14, 2, 4);
    
    // === HEADPHONES ===
    // Left earpiece
    g.fillStyle(0x333333); g.fillRect(8, 10, 6, 10);
    g.fillStyle(0x444444); g.fillRect(8, 10, 6, 2);
    g.fillStyle(0x222222); g.fillRect(9, 12, 4, 6);
    // Neon glow on earpiece
    g.fillStyle(0xff0066, 0.5); g.fillRect(10, 14, 2, 2);
    
    // Right earpiece
    g.fillStyle(0x333333); g.fillRect(34, 10, 6, 10);
    g.fillStyle(0x444444); g.fillRect(34, 10, 6, 2);
    g.fillStyle(0x222222); g.fillRect(35, 12, 4, 6);
    // Neon glow on earpiece
    g.fillStyle(0xff0066, 0.5); g.fillRect(36, 14, 2, 2);
    
    // Headband
    g.fillStyle(0x222222); g.fillRect(12, 4, 24, 3);
    g.fillStyle(0xff0066); g.fillRect(14, 5, 4, 1); // Neon stripe
    g.fillStyle(0x00ffff); g.fillRect(22, 5, 4, 1); // Neon stripe
    
    g.generateTexture(name, w, h);
    g.clear();
}

// Create repairing (crouching) textures for survivors
function createRepairingTextures(g, name, shirtColor, hairColor) {
    // ═══════ REPAIRING (CROUCHING) SURVIVOR ═══════
    // Shadow (larger, more spread out for crouching)
    g.fillStyle(0x000000, 0.4); g.fillEllipse(36, 90, 56, 14);
    
    // Crouched legs (bent at knees) with detail
    g.fillStyle(0x2c3e70); g.fillRect(12, 68, 14, 20);
    g.fillStyle(0x3c4e80); g.fillRect(12, 68, 4, 20);
    g.fillStyle(0x1c2e60); g.fillRect(12, 68, 14, 2);
    
    g.fillStyle(0x2c3e70); g.fillRect(46, 68, 14, 20);
    g.fillStyle(0x3c4e80); g.fillRect(46, 68, 4, 20);
    g.fillStyle(0x1c2e60); g.fillRect(46, 68, 14, 2);
    
    // Knees bent - detailed
    g.fillStyle(0x3c4e80); g.fillCircle(18, 82, 6);
    g.fillStyle(0x2c3e70); g.fillCircle(18, 82, 5);
    g.fillStyle(0x3c4e80); g.fillCircle(52, 82, 6);
    g.fillStyle(0x2c3e70); g.fillCircle(52, 82, 5);
    
    // Boots - detailed sneakers
    g.fillStyle(0x4a4a4a); g.fillRect(8, 86, 16, 10);
    g.fillStyle(0x5a5a5a); g.fillRect(8, 86, 16, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(8, 86, 5, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(16, 90, 5);
    g.fillStyle(0x5a5a5a); g.fillCircle(16, 89, 4);
    g.fillStyle(0x2a2a2a); g.fillRect(6, 94, 18, 4);
    
    g.fillStyle(0x4a4a4a); g.fillRect(48, 86, 16, 10);
    g.fillStyle(0x5a5a5a); g.fillRect(48, 86, 16, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(48, 86, 5, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(56, 90, 5);
    g.fillStyle(0x5a5a5a); g.fillCircle(56, 89, 4);
    g.fillStyle(0x2a2a2a); g.fillRect(46, 94, 18, 4);
    
    // Crouched body (leaning forward) with detail
    g.fillStyle(shirtColor); g.fillRect(14, 40, 44, 32);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(14, 40, 8, 32);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(50, 40, 8, 32);
    g.fillStyle(shirtColor + 0x222222); g.fillRect(14, 40, 44, 2);
    
    // Belt
    g.fillStyle(0x5a4a3a); g.fillRect(16, 66, 40, 5);
    g.fillStyle(0x6a5a4a); g.fillRect(16, 66, 40, 2);
    
    // Arms reaching forward with detail
    g.fillStyle(shirtColor); g.fillRect(-8, 44, 24, 12);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(-8, 44, 6, 12);
    
    g.fillStyle(shirtColor); g.fillRect(56, 44, 24, 12);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(72, 44, 6, 12);
    
    // Forearms reaching
    g.fillStyle(0xffccaa); g.fillRect(-12, 52, 18, 10);
    g.fillStyle(0xeebb99); g.fillRect(-12, 52, 4, 10);
    
    g.fillStyle(0xffccaa); g.fillRect(66, 52, 18, 10);
    g.fillStyle(0xeebb99); g.fillRect(76, 52, 4, 10);
    
    // Hands working on generator
    g.fillStyle(0xffccaa); g.fillRect(-20, 58, 14, 12);
    g.fillStyle(0xeebb99); g.fillRect(-20, 58, 4, 12);
    g.fillStyle(0xffccaa); g.fillCircle(-14, 68, 7);
    g.fillStyle(0xeebb99); g.fillCircle(-14, 67, 6);
    g.fillStyle(0xeebb99); g.fillCircle(-14, 66, 5);
    // Fingers working
    g.fillStyle(0xffccaa); g.fillRect(-26, 66, 4, 10);
    g.fillStyle(0xffccaa); g.fillRect(-20, 68, 4, 11);
    g.fillStyle(0xffccaa); g.fillRect(-14, 66, 4, 10);
    g.fillStyle(0xffccaa); g.fillRect(-8, 64, 4, 9);
    
    g.fillStyle(0xffccaa); g.fillRect(78, 58, 14, 12);
    g.fillStyle(0xeebb99); g.fillRect(88, 58, 4, 12);
    g.fillStyle(0xffccaa); g.fillCircle(84, 68, 7);
    g.fillStyle(0xeebb99); g.fillCircle(84, 67, 6);
    g.fillStyle(0xeebb99); g.fillCircle(84, 66, 5);
    g.fillStyle(0xffccaa); g.fillRect(94, 66, 4, 10);
    g.fillStyle(0xffccaa); g.fillRect(88, 68, 4, 11);
    g.fillStyle(0xffccaa); g.fillRect(82, 66, 4, 10);
    g.fillStyle(0xffccaa); g.fillRect(76, 64, 4, 9);
    
    // Sleeves
    g.fillStyle(shirtColor); g.fillRect(-6, 42, 14, 8);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(-6, 42, 4, 8);
    g.fillStyle(shirtColor); g.fillRect(64, 42, 14, 8);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(66, 42, 4, 8);
    
    // Head (slightly tilted forward, concentrated)
    g.fillStyle(0xffccaa); g.fillCircle(36, 24, 16);
    g.fillStyle(0xeebb99); g.fillCircle(36, 26, 14);
    g.fillStyle(0xddbbaa); g.fillCircle(36, 28, 12);
    
    // Cheekbones
    g.fillStyle(0xeebb99); g.fillCircle(24, 26, 5);
    g.fillStyle(0xeebb99); g.fillCircle(48, 26, 5);
    
    // Hair - styled for work
    g.fillStyle(hairColor); g.fillCircle(36, 10, 14);
    g.fillStyle(hairColor - 0x111111); g.fillCircle(36, 12, 12);
    g.fillStyle(hairColor - 0x222222); g.fillCircle(36, 14, 10);
    g.fillStyle(hairColor - 0x333333); g.fillCircle(34, 16, 7);
    
    // Hair style
    g.fillStyle(hairColor); g.fillRect(22, 8, 28, 10);
    g.fillStyle(hairColor - 0x111111); g.fillRect(24, 10, 24, 6);
    
    // Eyes (focused on work, determined)
    g.fillStyle(0xffffff); g.fillCircle(28, 24, 5);
    g.fillStyle(0x222222); g.fillCircle(28, 24, 3);
    g.fillStyle(0x111111); g.fillCircle(28, 24, 2);
    g.fillStyle(0xffffff); g.fillCircle(27, 23, 1);
    
    g.fillStyle(0xffffff); g.fillCircle(44, 24, 5);
    g.fillStyle(0x222222); g.fillCircle(44, 24, 3);
    g.fillStyle(0x111111); g.fillCircle(44, 24, 2);
    g.fillStyle(0xffffff); g.fillCircle(43, 23, 1);
    
    // Eye shadows (working hard)
    g.fillStyle(0xddbbaa); g.fillRect(23, 18, 10, 3);
    g.fillStyle(0xddbbaa); g.fillRect(39, 18, 10, 3);
    
    // Eyebrows (concentrated, furrowed)
    g.fillStyle(hairColor - 0x333333); g.fillRect(22, 18, 10, 2);
    g.fillStyle(hairColor - 0x444444); g.fillRect(22, 18, 10, 1);
    g.fillStyle(hairColor - 0x333333); g.fillRect(40, 18, 10, 2);
    g.fillStyle(hairColor - 0x444444); g.fillRect(40, 18, 10, 1);
    
    // Nose
    g.fillStyle(0xeebb99); g.fillEllipse(36, 30, 4, 5);
    g.fillStyle(0xddbbaa); g.fillEllipse(36, 31, 2, 2);
    
    // Mouth (slightly open, concentrated)
    g.fillStyle(0xcc8877); g.fillRect(30, 36, 12, 4);
    g.fillStyle(0xdd9988); g.fillRect(30, 36, 12, 2);
    g.fillStyle(0xbb7766); g.fillRect(32, 38, 8, 1);
    
    // Ears
    g.fillStyle(0xffccaa); g.fillCircle(20, 24, 4);
    g.fillStyle(0xeebb99); g.fillCircle(20, 23, 3);
    g.fillStyle(0xffccaa); g.fillCircle(52, 24, 4);
    g.fillStyle(0xeebb99); g.fillCircle(52, 23, 3);
    
    // Sweat drop (working hard)
    g.fillStyle(0x88ccff, 0.6); g.fillCircle(18, 20, 2);
    g.fillStyle(0x88ccff, 0.6); g.fillCircle(54, 22, 2);
    
    g.generateTexture(name + '_repair', 100, 100);
    g.clear();
}

// Create dying (crawling on ground) textures for survivors
function createDyingTextures(g, name, shirtColor, hairColor) {
    // ═══════ DYING (CRAWLING) SURVIVOR ═══════
    // Maintain similar aspect ratio to standing texture (72x120)
    // This texture is 72x110 - more vertical for proper scaling
    
    // Shadow - oval under the crawling body
    g.fillStyle(0x000000, 0.4); g.fillEllipse(36, 105, 55, 12);
    
    // Legs - bent/crawling pose, slightly behind
    g.fillStyle(0x2c3e70); g.fillRect(16, 82, 14, 22);
    g.fillStyle(0x3c4e80); g.fillRect(16, 82, 5, 22);
    g.fillStyle(0x1c2e60); g.fillRect(16, 82, 14, 3);
    
    g.fillStyle(0x2c3e70); g.fillRect(42, 82, 14, 22);
    g.fillStyle(0x3c4e80); g.fillRect(42, 82, 5, 22);
    g.fillStyle(0x1c2e60); g.fillRect(42, 82, 14, 3);
    
    // Feet - on ground, crawling
    g.fillStyle(0x4a4a4a); g.fillRect(10, 98, 18, 10);
    g.fillStyle(0x5a5a5a); g.fillRect(10, 98, 6, 10);
    g.fillStyle(0x2a2a2a); g.fillRect(10, 104, 20, 4);
    
    g.fillStyle(0x4a4a4a); g.fillRect(44, 98, 18, 10);
    g.fillStyle(0x5a5a5a); g.fillRect(44, 98, 6, 10);
    g.fillStyle(0x2a2a2a); g.fillRect(44, 104, 20, 4);
    
    // Body - horizontal/crawling pose
    g.fillStyle(shirtColor); g.fillRect(18, 60, 38, 26);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(18, 60, 8, 26);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(48, 60, 8, 26);
    g.fillStyle(shirtColor + 0x222222); g.fillRect(18, 60, 38, 3);
    
    // Arms - extended forward (crawling)
    g.fillStyle(shirtColor); g.fillRect(-6, 58, 28, 10);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(-6, 58, 6, 10);
    
    g.fillStyle(shirtColor); g.fillRect(50, 58, 28, 10);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(72, 58, 6, 10);
    
    // Hands - touching ground
    g.fillStyle(0xffccaa); g.fillRect(-20, 62, 18, 12);
    g.fillStyle(0xeebb99); g.fillRect(-20, 62, 5, 12);
    g.fillStyle(0xffccaa); g.fillCircle(-12, 72, 7);
    g.fillStyle(0xeebb99); g.fillCircle(-12, 71, 5);
    // Fingers
    g.fillStyle(0xffccaa); g.fillRect(-24, 68, 4, 10);
    g.fillStyle(0xffccaa); g.fillRect(-16, 70, 4, 11);
    g.fillStyle(0xffccaa); g.fillRect(-8, 68, 4, 10);
    
    g.fillStyle(0xffccaa); g.fillRect(74, 62, 18, 12);
    g.fillStyle(0xeebb99); g.fillRect(87, 62, 5, 12);
    g.fillStyle(0xffccaa); g.fillCircle(82, 72, 7);
    g.fillStyle(0xeebb99); g.fillCircle(82, 71, 5);
    g.fillStyle(0xffccaa); g.fillRect(76, 68, 4, 10);
    g.fillStyle(0xffccaa); g.fillRect(84, 70, 4, 11);
    g.fillStyle(0xffccaa); g.fillRect(92, 68, 4, 10);
    
    // Sleeves
    g.fillStyle(shirtColor); g.fillRect(-4, 56, 14, 8);
    g.fillStyle(shirtColor); g.fillRect(62, 56, 14, 8);
    
    // Head - low to ground, looking up slightly
    g.fillStyle(0xffccaa); g.fillCircle(36, 38, 18);
    g.fillStyle(0xeebb99); g.fillCircle(36, 40, 15);
    g.fillStyle(0xddbbaa); g.fillCircle(36, 42, 13);
    
    // Cheekbones
    g.fillStyle(0xeebb99); g.fillCircle(24, 40, 7);
    g.fillStyle(0xeebb99); g.fillCircle(48, 40, 7);
    
    // Hair - disheveled, falling forward
    g.fillStyle(hairColor); g.fillCircle(36, 26, 16);
    g.fillStyle(hairColor - 0x111111); g.fillCircle(36, 28, 14);
    g.fillStyle(hairColor - 0x222222); g.fillCircle(36, 30, 12);
    // Hair strands falling
    g.fillStyle(hairColor); g.fillRect(20, 26, 32, 10);
    g.fillStyle(hairColor - 0x111111); g.fillRect(22, 28, 28, 6);
    g.fillStyle(hairColor); g.fillRect(16, 32, 8, 12);
    g.fillStyle(hairColor); g.fillRect(48, 32, 8, 12);
    
    // Eyes - distressed, looking forward
    g.fillStyle(0xffffff); g.fillCircle(28, 38, 7);
    g.fillStyle(0xffffff); g.fillCircle(44, 38, 7);
    g.fillStyle(0x333333); g.fillCircle(28, 38, 5);
    g.fillStyle(0x333333); g.fillCircle(44, 38, 5);
    g.fillStyle(0x111111); g.fillCircle(28, 38, 3);
    g.fillStyle(0x111111); g.fillCircle(44, 38, 3);
    g.fillStyle(0xffffff); g.fillCircle(27, 37, 2);
    g.fillStyle(0xffffff); g.fillCircle(43, 37, 2);
    // Eye shadow/bags
    g.fillStyle(0xddbbaa); g.fillRect(22, 31, 12, 3);
    g.fillStyle(0xddbbaa); g.fillRect(40, 31, 12, 3);
    
    // Eyebrows - worried
    g.fillStyle(hairColor - 0x333333); g.fillRect(22, 29, 10, 2);
    g.fillStyle(hairColor - 0x444444); g.fillRect(22, 29, 10, 1);
    g.fillStyle(hairColor - 0x333333); g.fillRect(42, 29, 10, 2);
    g.fillStyle(hairColor - 0x444444); g.fillRect(42, 29, 10, 1);
    
    // Nose
    g.fillStyle(0xeebb99); g.fillEllipse(36, 44, 4, 5);
    g.fillStyle(0xddbbaa); g.fillEllipse(36, 45, 2, 2);
    
    // Mouth - gasping/in pain
    g.fillStyle(0xcc8877); g.fillRect(30, 50, 12, 5);
    g.fillStyle(0xdd9988); g.fillRect(30, 50, 12, 2);
    g.fillStyle(0xbb7766); g.fillRect(32, 53, 8, 2);
    // Teeth showing
    g.fillStyle(0xffffff); g.fillRect(31, 51, 2, 2);
    g.fillStyle(0xffffff); g.fillRect(35, 51, 2, 2);
    g.fillStyle(0xffffff); g.fillRect(39, 51, 2, 2);
    
    // Ears
    g.fillStyle(0xffccaa); g.fillCircle(18, 40, 5);
    g.fillStyle(0xeebb99); g.fillCircle(18, 39, 3);
    g.fillStyle(0xffccaa); g.fillCircle(54, 40, 5);
    g.fillStyle(0xeebb99); g.fillCircle(54, 39, 3);
    
    // Sweat drops - distressed
    g.fillStyle(0x88ccff, 0.6); g.fillCircle(22, 34, 3);
    g.fillStyle(0x88ccff, 0.6); g.fillCircle(50, 36, 3);
    
    // Tear drops
    g.fillStyle(0x88ccff, 0.5); g.fillCircle(24, 46, 2);
    g.fillStyle(0x88ccff, 0.5); g.fillCircle(48, 46, 2);
    
    g.generateTexture(name + '_dying', 72, 110);
    g.clear();
}

// Create carried (on killer's shoulder) textures for survivors
function createCarriedTextures(g, name, shirtColor, hairColor) {
    // ═══════ CARRIED SURVIVOR (on killer's shoulder) ═══════
    // Shadow - smaller since elevated
    g.fillStyle(0x000000, 0.3); g.fillEllipse(32, 85, 28, 8);
    
    // Body - vertical, on killer's shoulder
    g.fillStyle(shirtColor); g.fillRect(20, 22, 36, 44);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(20, 22, 8, 44);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(48, 22, 8, 44);
    g.fillStyle(shirtColor + 0x222222); g.fillRect(20, 22, 36, 2);
    
    // Belt
    g.fillStyle(0x5a4a3a); g.fillRect(18, 58, 40, 5);
    g.fillStyle(0x6a5a4a); g.fillRect(18, 58, 40, 2);
    
    // Arms - dangling
    g.fillStyle(shirtColor); g.fillRect(6, 26, 14, 10);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(6, 26, 4, 10);
    
    g.fillStyle(shirtColor); g.fillRect(56, 26, 14, 10);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(58, 26, 4, 10);
    
    // Hands
    g.fillStyle(0xffccaa); g.fillRect(0, 32, 12, 10);
    g.fillStyle(0xeebb99); g.fillRect(0, 32, 3, 10);
    g.fillStyle(0xffccaa); g.fillCircle(6, 40, 5);
    g.fillStyle(0xeebb99); g.fillCircle(6, 39, 4);
    
    g.fillStyle(0xffccaa); g.fillRect(64, 32, 12, 10);
    g.fillStyle(0xeebb99); g.fillRect(73, 32, 3, 10);
    g.fillStyle(0xffccaa); g.fillCircle(70, 40, 5);
    g.fillStyle(0xeebb99); g.fillCircle(70, 39, 4);
    
    // Head - tilted back, showing fear
    g.fillStyle(0xffccaa); g.fillCircle(38, 16, 14);
    g.fillStyle(0xeebb99); g.fillCircle(38, 18, 12);
    g.fillStyle(0xddbbaa); g.fillCircle(38, 20, 10);
    
    // Cheekbones - stressed
    g.fillStyle(0xeebb99); g.fillCircle(28, 18, 5);
    g.fillStyle(0xeebb99); g.fillCircle(48, 18, 5);
    
    // Hair - disheveled from being carried
    g.fillStyle(hairColor); g.fillCircle(38, 6, 12);
    g.fillStyle(hairColor - 0x111111); g.fillCircle(38, 8, 10);
    g.fillStyle(hairColor - 0x222222); g.fillCircle(38, 10, 8);
    // Hair sticking up
    g.fillStyle(hairColor); g.fillRect(28, 2, 6, 8);
    g.fillStyle(hairColor); g.fillRect(42, 2, 6, 8);
    g.fillStyle(hairColor - 0x111111); g.fillRect(32, 0, 4, 6);
    
    // Eyes - wide/open with fear, tears
    g.fillStyle(0xffffff); g.fillCircle(32, 14, 5);
    g.fillStyle(0xffffff); g.fillCircle(44, 14, 5);
    g.fillStyle(0x333333); g.fillCircle(32, 14, 3);
    g.fillStyle(0x333333); g.fillCircle(44, 14, 3);
    g.fillStyle(0x111111); g.fillCircle(32, 14, 1.5);
    g.fillStyle(0x111111); g.fillCircle(44, 14, 1.5);
    g.fillStyle(0xffffff); g.fillCircle(31, 13, 1);
    g.fillStyle(0xffffff); g.fillCircle(43, 13, 1);
    
    // Tear streams
    g.fillStyle(0x88ccff, 0.4); g.fillRect(30, 18, 2, 8);
    g.fillStyle(0x88ccff, 0.4); g.fillRect(42, 18, 2, 8);
    
    // Eyebrows - raised in fear
    g.fillStyle(hairColor - 0x333333); g.fillRect(27, 8, 9, 2);
    g.fillStyle(hairColor - 0x444444); g.fillRect(27, 8, 9, 1);
    g.fillStyle(hairColor - 0x333333); g.fillRect(40, 8, 9, 2);
    g.fillStyle(hairColor - 0x444444); g.fillRect(40, 8, 9, 1);
    
    // Nose
    g.fillStyle(0xeebb99); g.fillEllipse(38, 20, 4, 5);
    g.fillStyle(0xddbbaa); g.fillEllipse(38, 21, 2, 2);
    
    // Mouth - open in fear
    g.fillStyle(0xcc8877); g.fillRect(32, 26, 12, 6);
    g.fillStyle(0xdd9988); g.fillRect(32, 26, 12, 3);
    // Teeth
    g.fillStyle(0xffffff); g.fillRect(33, 27, 2, 3);
    g.fillStyle(0xffffff); g.fillRect(37, 27, 2, 3);
    g.fillStyle(0xffffff); g.fillRect(41, 27, 2, 3);
    
    // Ears
    g.fillStyle(0xffccaa); g.fillCircle(24, 16, 4);
    g.fillStyle(0xeebb99); g.fillCircle(24, 15, 3);
    g.fillStyle(0xffccaa); g.fillCircle(52, 16, 4);
    g.fillStyle(0xeebb99); g.fillCircle(52, 15, 3);
    
    g.generateTexture(name + '_carried', 76, 90);
    g.clear();
}

// ═══════ CREATE SCENE ═══════

function create() {
    console.log('[CREATE] start, isMultiplayer:', isMultiplayer, 'roomCode:', roomCode, 'playerId:', playerId);
    scene = this;

    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);

    // Ground - multiple tiles for variety
    for (let x = 0; x < MAP_W; x += 64) {
        for (let y = 0; y < MAP_H; y += 64) {
            const groundVariant = Math.floor(Math.random() * 6);
            const tile = this.add.image(x + 32, y + 32, 'ground' + groundVariant);
            tile.setAlpha(0.7 + Math.random() * 0.3);
            tile.setTint(0x111111 + Math.floor(Math.random() * 0x111111));
        }
    }

    // Static group for obstacles
    staticGroup = this.physics.add.staticGroup();

    // Fence
    buildFence.call(this, MAP_W, MAP_H);

    // Obstacles
    const obstacles = getMapObstacles();
    obstacles.forEach(o => {
        if (o.solid) {
            const sp = staticGroup.create(o.x + o.sw / 2, o.y + o.sh / 2, o.t);
            sp.setDisplaySize(o.sw, o.sh);
            sp.refreshBody();
            sp.setDepth(o.y + o.sh / 2);
        } else {
            const img = this.add.image(o.x + o.sw / 2, o.y + o.sh / 2, o.t);
            img.setDisplaySize(o.sw, o.sh);
            img.setDepth(o.y + o.sh / 2 + 1);
        }
    });

    // Generate random generator positions
    const allObstacles = getMapObstacles();
    const GEN_SIZE = 60; // Generator collision size
    const GEN_SAFE_DIST = 60; // Must be away from obstacles
    const GEN_MIN_DIST = 300; // Minimum distance between generators
    
    function isValidGenPos(x, y) {
        for (const o of allObstacles) {
            const centerX = o.x + o.sw / 2;
            const centerY = o.y + o.sh / 2;
            const dx = Math.abs(x - centerX);
            const dy = Math.abs(y - centerY);
            const minDistX = o.sw / 2 + GEN_SAFE_DIST;
            const minDistY = o.sh / 2 + GEN_SAFE_DIST;
            
            // Too close to obstacle
            if (dx < minDistX && dy < minDistY) return false;
        }
        return true;
    }
    
    function isNearAnyObstacle(x, y) {
        for (const o of allObstacles) {
            const centerX = o.x + o.sw / 2;
            const centerY = o.y + o.sh / 2;
            const dx = Math.abs(x - centerX);
            const dy = Math.abs(y - centerY);
            const maxDist = Math.max(o.sw, o.sh) + 150;
            
            if (dx < maxDist && dy < maxDist) return true;
        }
        return false;
    }
    
    function generateRandomGens(count) {
        const positions = [];
        const padding = 200;
        
        for (let i = 0; i < count; i++) {
            let placed = false;
            
            // First try to find position near obstacle
            for (let attempt = 0; attempt < 50; attempt++) {
                const x = padding + Math.random() * (MAP_W - padding * 2);
                const y = padding + Math.random() * (MAP_H - padding * 2);
                
                // Must be near an obstacle but not on it
                if (!isNearAnyObstacle(x, y)) continue;
                if (!isValidGenPos(x, y)) continue;
                
                // Check distance from other generators
                let tooClose = false;
                for (const pos of positions) {
                    const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
                    if (dist < GEN_MIN_DIST) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    positions.push({ x, y });
                    placed = true;
                    break;
                }
            }
            
            // If couldn't find near obstacle, try anywhere valid
            if (!placed) {
                for (let attempt = 0; attempt < 100; attempt++) {
                    const x = padding + Math.random() * (MAP_W - padding * 2);
                    const y = padding + Math.random() * (MAP_H - padding * 2);
                    
                    if (!isValidGenPos(x, y)) continue;
                    
                    let tooClose = false;
                    for (const pos of positions) {
                        const dist = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2);
                        if (dist < GEN_MIN_DIST) {
                            tooClose = true;
                            break;
                        }
                    }
                    
                    if (!tooClose) {
                        positions.push({ x, y });
                        placed = true;
                        break;
                    }
                }
            }
        }
        
        // Fallback positions if not enough found
        while (positions.length < count) {
            positions.push({
                x: 300 + positions.length * 400,
                y: 300 + (positions.length % 3) * 500
            });
        }
        
        return positions;
    }
    
    const genPositions = generateRandomGens(5);
    
    // Generators with poles and flickering lights
    genPositions.forEach((p, i) => {
        // Light glow (outer) - will flicker
        const lightGlow = this.add.graphics();
        lightGlow.fillStyle(0xffee88, 0.15);
        lightGlow.fillCircle(p.x, p.y - 45, 50);
        lightGlow.setDepth(p.y - 50 + 1);

        // Light glow (inner, brighter)
        const lightGlowInner = this.add.graphics();
        lightGlowInner.fillStyle(0xffee88, 0.3);
        lightGlowInner.fillCircle(p.x, p.y - 45, 25);
        lightGlowInner.setDepth(p.y - 50 + 2);

        // Light fixture (on top of pole)
        const light = this.add.sprite(p.x, p.y - 45, 'gen_light').setDepth(p.y - 50 + 3).setScale(0.7);

        // Light pole
        const pole = this.add.sprite(p.x, p.y - 22, 'gen_pole').setDepth(p.y - 26 + 1);
        pole.setScale(0.6);

        // Generator body glow
        const glow = this.add.graphics();
        glow.fillStyle(0x00ff44, 0.08);
        glow.fillCircle(p.x, p.y, 40);
        glow.setDepth(p.y + 1);

        // Generator body (smaller scale)
        const sp = this.add.sprite(p.x, p.y, 'gen').setDepth(p.y + 2).setScale(0.75);
        sp.genId = i;
        sp.progress = 0;
        sp.repaired = false;
        sp.barGfx = this.add.graphics().setDepth(p.y + 3);
        sp.bx = p.x;
        sp.by = p.y;
        sp.glowGfx = glow;
        sp.lightGlowGfx = lightGlow;
        sp.lightGlowInnerGfx = lightGlowInner;
        sp.lightSprite = light;
        sp.lightFlickerPhase = Math.random() * Math.PI * 2; // Random start phase for flicker
        generators.push(sp);
    }, this);

    // Hooks
    [{ x: 500, y: 450 }, { x: 1900, y: 450 }, { x: 500, y: 1350 }, { x: 1900, y: 1350 },
    { x: 1200, y: 500 }, { x: 1200, y: 1300 }, { x: 800, y: 900 }, { x: 1600, y: 900 }]
        .forEach((p, i) => {
            const sp = this.add.sprite(p.x, p.y, 'hook').setDepth(p.y + 1).setScale(1.3);
            sp.hookId = i;
            sp.occupied = false;
            sp.hookedSurvivor = null;
            sp.hookTimer = 0;
            hooks.push(sp);
        }, this);

    // Pallets (dropable boards that stun killer)
    [{ x: 350, y: 350 }, { x: 950, y: 400 }, { x: 1550, y: 350 }, { x: 2050, y: 400 },
     { x: 300, y: 800 }, { x: 700, y: 750 }, { x: 1100, y: 800 }, { x: 1500, y: 750 }, { x: 1900, y: 800 },
     { x: 400, y: 1250 }, { x: 900, y: 1200 }, { x: 1400, y: 1250 }, { x: 1800, y: 1200 }, { x: 2100, y: 1300 },
     { x: 1200, y: 650 }, { x: 1200, y: 1100 }]
        .forEach((p, i) => {
            const sp = this.add.sprite(p.x, p.y, 'pallet').setDepth(p.y + 2).setScale(1.2);
            sp.palletId = i;
            sp.state = 'standing'; // standing, dropping, fallen, broken
            sp.dropTimer = 0;
            sp.breakTimer = 0;
            sp.canDrop = true;
            sp.dropCooldown = 0;
            sp.stunTimer = 0;
            sp.bx = p.x;
            sp.by = p.y;
            // Shadow
            sp.shadow = this.add.graphics();
            sp.shadow.fillStyle(0x000000, 0.3);
            sp.shadow.fillEllipse(p.x, p.y + 35, 30, 12);
            sp.shadow.setDepth(p.y);
            pallets.push(sp);
        }, this);

    // Gates
    [{ x: 30, y: 900 }, { x: MAP_W - 30, y: 900 }]
        .forEach(p => {
            const sp = this.add.sprite(p.x, p.y, 'gate').setDepth(p.y + 1).setScale(1.8);
            sp.progress = 0;
            sp.opened = false;
            sp.isOpening = false;
            sp.barGfx = this.add.graphics().setDepth(p.y + 2);
            sp.bx = p.x;
            sp.by = p.y;
            gates.push(sp);
        }, this);

    // Spawn players
    spawnPlayers.call(this);

    // Camera
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.startFollow(player.sprite, true, 0.1, 0.1);
    this.cameras.main.setBackgroundColor('#030303');

    // Silent Hill Style Fog System - Dense, slow, atmospheric
    this.fogPatches = [];
    const fogColors = [
        { r: 45, g: 50, b: 55 },   // Dark gray
        { r: 55, g: 50, b: 45 },   // Yellowish gray
        { r: 40, g: 45, b: 50 },  // Blueish gray
        { r: 50, g: 48, b: 45 },   // Brownish gray
        { r: 35, g: 40, b: 45 },  // Dark blue gray
    ];
    
    // Create many fog patches for density
    for (let i = 0; i < 60; i++) {
        this.fogPatches.push({
            x: Math.random() * MAP_W,
            y: Math.random() * MAP_H,
            width: 250 + Math.random() * 400,
            height: 80 + Math.random() * 100,
            alpha: 0.15 + Math.random() * 0.35,
            speedX: -0.08 - Math.random() * 0.15,  // Slow crawl
            speedY: (Math.random() - 0.5) * 0.04,
            wobblePhase: Math.random() * Math.PI * 2,
            wobbleSpeed: 0.0003 + Math.random() * 0.0002,
            color: fogColors[Math.floor(Math.random() * fogColors.length)],
            layer: Math.floor(Math.random() * 3)  // Depth layer
        });
    }
    
    // Fog graphics layers (3 layers for depth)
    this.fogGfx = [];
    for (let i = 0; i < 3; i++) {
        const fg = this.add.graphics();
        fg.setDepth(95 + i * 2);
        this.fogGfx.push(fg);
    }
    
    // Dust particles system
    this.dustParticles = [];
    for (let i = 0; i < 50; i++) {
        this.dustParticles.push({
            x: Math.random() * MAP_W,
            y: Math.random() * MAP_H,
            size: 1 + Math.random() * 2,
            alpha: 0.1 + Math.random() * 0.15,
            speedX: (Math.random() - 0.5) * 0.4,
            speedY: (Math.random() - 0.5) * 0.3 - 0.15,
            wobble: Math.random() * Math.PI * 2
        });
    }
    this.dustGfx = this.add.graphics().setDepth(150);
    
    // Ash/ember particles (orange glowing)
    this.ashParticles = [];
    for (let i = 0; i < 25; i++) {
        this.ashParticles.push({
            x: Math.random() * MAP_W,
            y: Math.random() * MAP_H,
            size: 1 + Math.random() * 1.5,
            alpha: 0.2 + Math.random() * 0.3,
            speedX: 0.1 + Math.random() * 0.2,
            speedY: -0.3 - Math.random() * 0.3,
            flicker: Math.random() * Math.PI * 2
        });
    }
    this.ashGfx = this.add.graphics().setDepth(149);
    
    // ═══════ CROW SYSTEM - Creepy ravens ═══════
    this.crows = [];
    
    // Get valid landing spots (obstacles, trees, etc.)
    const landingSpots = [];
    const mapObstacles = getMapObstacles();
    mapObstacles.forEach(o => {
        if (o.t.includes('tree') || o.t.includes('pine') || o.t.includes('stone') || o.t.includes('brick')) {
            landingSpots.push({
                x: o.x + o.sw / 2,
                y: o.y + o.sh / 2 - 20,
                type: o.t
            });
        }
    });
    
    // Use deterministic random based on roomCode for multiplayer consistency
    const crowSeed = roomCode ? hashCode(roomCode + '_crows') : Date.now();
    const crowRand = seededRandom(crowSeed);
    
    // Create up to 10 crows - deterministic count
    const numCrows = 5 + Math.floor(crowRand() * 6); // 5-10 crows
    for (let i = 0; i < numCrows; i++) {
        const isFlying = crowRand() > 0.3; // 70% start flying
        const crow = {
            sprite: this.add.sprite(
                100 + crowRand() * (MAP_W - 200),
                100 + crowRand() * (MAP_H - 200),
                isFlying ? 'crow' : 'crow_sitting'
            ),
            state: isFlying ? 'flying' : 'sitting',
            speedX: 0,
            speedY: 0,
            targetX: 0,
            targetY: 0,
            flapPhase: crowRand() * Math.PI * 2,
            flapSpeed: 0.1 + crowRand() * 0.05,
            wanderTimer: 0,
            wanderInterval: 3 + crowRand() * 5,
            sitTimer: 0,
            maxSitTime: 5 + crowRand() * 10,
            landingSpot: null,
            isAI: true,
            heightOffset: 0,
            cawTimer: 0,
            cawBubble: null,
            cawText: null
        };
        crow.sprite.setDepth(200);
        crow.sprite.setScale(0.6 + crowRand() * 0.3);
        
        if (!isFlying && landingSpots.length > 0) {
            crow.landingSpot = landingSpots[Math.floor(crowRand() * landingSpots.length)];
            crow.sprite.setPosition(crow.landingSpot.x, crow.landingSpot.y);
            crow.targetX = crow.landingSpot.x;
            crow.targetY = crow.landingSpot.y;
        }
        
        this.crows.push(crow);
    }
    
    // Caw text graphics group
    this.cawGfx = this.add.graphics().setDepth(300);
    
    // Vignette overlay (dark edges)
    this.vignetteGfx = this.add.graphics().setDepth(99999);
    
    // Floating bar graphics
    floatBarGfx = this.add.graphics().setDepth(55000);

    // Controls
    createControls();

    console.log('[CREATE] calling initMultiplayerSync, isMultiplayer:', isMultiplayer);
    // Initialize multiplayer if enabled
    if (isMultiplayer && roomCode && playerId) {
        initMultiplayerSync.call(this);
    } else {
        console.log('[CREATE] Skipping multiplayer init, isMultiplayer:', isMultiplayer, 'roomCode:', roomCode, 'playerId:', playerId);
    }
    console.log('[CREATE] done');
}

function buildFence(W, H) {
    const step = 48;
    for (let x = 0; x <= W; x += step) {
        const sp = staticGroup.create(x, 0, 'fence_post');
        sp.setDisplaySize(20, 60); sp.refreshBody();
        const sp2 = staticGroup.create(x, H, 'fence_post');
        sp2.setDisplaySize(20, 60); sp2.refreshBody();
    }
    for (let y = step; y < H; y += step) {
        const sp = staticGroup.create(0, y, 'fence_post');
        sp.setDisplaySize(20, 60); sp.refreshBody();
        const sp2 = staticGroup.create(W, y, 'fence_post');
        sp2.setDisplaySize(20, 60); sp2.refreshBody();
    }
}

function getMapObstacles() {
    const obs = [];

    // Helper: check if new object overlaps with any existing solid object
    function overlapsAny(x, y, sw, sh, padding = 30) {
        for (const o of obs) {
            if (o.solid) {
                const dx = Math.abs((x + sw/2) - (o.x + o.sw/2));
                const dy = Math.abs((y + sh/2) - (o.y + o.sh/2));
                const minDistX = (sw + o.sw) / 2 + padding;
                const minDistY = (sh + o.sh) / 2 + padding;
                if (dx < minDistX && dy < minDistY) {
                    return true;
                }
            }
        }
        return false;
    }

    function addBrickRow(sx, sy, n) { for (let i = 0; i < n; i++) obs.push({ t: 'brick', x: sx + i * 96, y: sy, sw: 94, sh: 46, solid: true }); }
    function addBrickCol(sx, sy, n) { for (let i = 0; i < n; i++) obs.push({ t: 'brick', x: sx, y: sy + i * 50, sw: 94, sh: 46, solid: true }); }

    // Brick walls (solid, placed first)
    addBrickRow(280, 260, 5); addBrickCol(280, 260, 6);
    addBrickRow(880, 340, 6); addBrickCol(880, 340, 5);
    addBrickRow(1880, 580, 5); addBrickCol(1880, 580, 6);
    addBrickRow(360, 1380, 5); addBrickCol(360, 1380, 5);
    addBrickRow(1580, 1040, 5); addBrickCol(1580, 1040, 4);
    addBrickRow(1080, 1480, 6);
    addBrickCol(680, 820, 5); addBrickRow(680, 820, 4);

    // Stones - only placed if not overlapping bricks or other objects
    const stoneSizes = {
        stone1: { sw: 40, sh: 38 },
        stone2: { sw: 38, sh: 34 },
        stone3: { sw: 36, sh: 28 },
        stone4: { sw: 48, sh: 30 },
        stone5: { sw: 28, sh: 28 }
    };
    [[200, 400, 'stone1'], [500, 200, 'stone3'], [1200, 300, 'stone2'], [1800, 200, 'stone4'], [2200, 500, 'stone5'],
    [300, 1000, 'stone2'], [600, 1400, 'stone1'], [1400, 900, 'stone5'], [2000, 1100, 'stone3'], [1700, 1600, 'stone4'],
    [800, 1600, 'stone1'], [1100, 700, 'stone2'], [1500, 400, 'stone3'], [2100, 1400, 'stone1'], [450, 700, 'stone5'],
    [950, 1200, 'stone4'], [1700, 350, 'stone2'], [2300, 900, 'stone1'], [400, 1550, 'stone3'], [1600, 250, 'stone5'],
    [1050, 1600, 'stone2'], [750, 450, 'stone4'], [1800, 1000, 'stone1'], [2200, 1200, 'stone3']
    ].forEach(p => {
        const st = stoneSizes[p[2]];
        if (!overlapsAny(p[0], p[1], st.sw, st.sh, 40)) {
            obs.push({ t: p[2], x: p[0], y: p[1], sw: st.sw, sh: st.sh, solid: true });
        }
    });

    // Large detailed trees (only if not overlapping) - randomly select variation
    [[120, 120], [580, 80], [1100, 130], [1580, 90], [2180, 180],
    [80, 580], [380, 380], [880, 480], [1380, 280], [1980, 380],
    [130, 1080], [480, 880], [980, 1280], [1480, 1080], [2080, 780],
    [280, 1680], [680, 1680], [1180, 1680], [1680, 1680], [2180, 1580],
    [250, 350], [720, 550], [1250, 450], [1750, 350], [2150, 550],
    [450, 1150], [950, 950], [1450, 1250], [1950, 950], [2350, 1150]
    ].forEach(p => {
        if (!overlapsAny(p[0], p[1], 70, 100, 50)) {
            const treeVar = 'tree' + Math.floor(Math.random() * 3);
            obs.push({ t: treeVar, x: p[0], y: p[1], sw: 70, sh: 100, solid: false });
        }
    });

    // Pine trees (only if not overlapping)
    [[350, 150], [850, 250], [1350, 150], [1850, 250], [2350, 150],
    [150, 750], [650, 650], [1150, 750], [1650, 650], [2150, 750],
    [250, 1350], [750, 1250], [1250, 1350], [1750, 1250], [2250, 1350]
    ].forEach(p => {
        if (!overlapsAny(p[0], p[1], 50, 95, 45)) {
            obs.push({ t: 'pine_tree', x: p[0], y: p[1], sw: 50, sh: 95, solid: false });
        }
    });

    // Small trees (only if not overlapping)
    [[200, 250], [700, 150], [1200, 250], [1700, 150], [2200, 250],
    [320, 650], [820, 550], [1320, 650], [1820, 550], [2320, 650],
    [180, 1250], [680, 1150], [1180, 1250], [1680, 1150], [2180, 1250]
    ].forEach(p => {
        if (!overlapsAny(p[0], p[1], 40, 80, 35)) {
            obs.push({ t: 'tree_small', x: p[0], y: p[1], sw: 40, sh: 80, solid: false });
        }
    });

    // Detailed bushes (only if not overlapping)
    [[220, 480], [680, 280], [1020, 380], [1780, 680], [2080, 280],
    [330, 1180], [780, 980], [1280, 1380], [1580, 780], [2180, 1180],
    [420, 320], [920, 420], [1420, 320], [1920, 420], [2420, 320],
    [280, 820], [780, 720], [1280, 820], [1780, 720], [2280, 820],
    [520, 1420], [1020, 1320], [1520, 1420], [2020, 1320], [520, 220],
    [1020, 120], [1520, 220], [2020, 120]
    ].forEach(p => {
        if (!overlapsAny(p[0], p[1], 60, 45, 25)) {
            obs.push({ t: 'bush', x: p[0], y: p[1], sw: 60, sh: 45, solid: false });
        }
    });

    // Tall grass patches (only if not overlapping)
    [[180, 320], [580, 180], [980, 280], [1380, 180], [1880, 320], [2280, 180],
    [280, 720], [680, 620], [1080, 720], [1480, 620], [1980, 720],
    [180, 1120], [580, 1020], [1080, 1120], [1580, 1020], [2080, 1120],
    [380, 1520], [880, 1420], [1380, 1520], [1880, 1420]
    ].forEach(p => {
        if (!overlapsAny(p[0], p[1], 50, 40, 20)) {
            obs.push({ t: 'tall_grass', x: p[0], y: p[1], sw: 50, sh: 40, solid: false });
        }
    });

    // Flower patches (only if not overlapping)
    [[280, 420], [780, 320], [1280, 420], [1780, 320], [2280, 420],
    [380, 820], [880, 720], [1380, 820], [1880, 720], [2380, 820],
    [280, 1220], [680, 1120], [1180, 1220], [1680, 1120], [2180, 1220]
    ].forEach(p => {
        if (!overlapsAny(p[0], p[1], 52, 35, 20)) {
            obs.push({ t: 'flower_patch', x: p[0], y: p[1], sw: 52, sh: 35, solid: false });
        }
    });

    // Detailed rocks (only if not overlapping)
    [[350, 450], [850, 350], [1350, 450], [1850, 350], [2350, 450],
    [450, 850], [950, 750], [1450, 850], [1950, 750], [2450, 850],
    [350, 1250], [750, 1150], [1250, 1250], [1750, 1150], [2250, 1250]
    ].forEach(p => {
        if (!overlapsAny(p[0], p[1], 56, 45, 30)) {
            obs.push({ t: 'rock_detailed', x: p[0], y: p[1], sw: 56, sh: 45, solid: false });
        }
    });

    return obs;
}

function spawnPlayers() {
    // Map boundaries (with padding from edges)
    const PADDING = 150; // Distance from map edges
    const MIN_KILLER_DIST = 600; // Minimum distance between killer and survivors
    const SPAWN_ATTEMPTS = 100; // Attempts to find valid spawn point
    const SAFE_DIST = 80; // Minimum distance from any obstacle
    
    // Get all obstacles once for reuse
    const allObstacles = getMapObstacles();
    
    // Check if a point is too close to any obstacle
    function isNearObstacle(x, y) {
        for (const o of allObstacles) {
            const centerX = o.x + o.sw / 2;
            const centerY = o.y + o.sh / 2;
            const dx = Math.abs(x - centerX);
            const dy = Math.abs(y - centerY);
            const minDistX = o.sw / 2 + SAFE_DIST;
            const minDistY = o.sh / 2 + SAFE_DIST;
            
            // Check if point is inside or too close to obstacle
            if (dx < minDistX && dy < minDistY) {
                return true;
            }
        }
        return false;
    }
    
    // Generate random spawn points avoiding all obstacles
    function getRandomSpawnPoint() {
        for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
            const x = PADDING + Math.random() * (MAP_W - PADDING * 2);
            const y = PADDING + Math.random() * (MAP_H - PADDING * 2);
            
            // Check if point is too close to any obstacle
            if (!isNearObstacle(x, y)) {
                return { x, y };
            }
        }
        // Fallback to center if no valid point found
        return { x: MAP_W / 2, y: MAP_H / 2 };
    }
    
    // Calculate distance between two points
    function dist(p1, p2) {
        return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    }
    
    // Get random spawn points for survivors
    function getSurvivorSpawnPoints(killerSpawn, count) {
        const points = [];
        const usedPoints = [];
        
        for (let i = 0; i < count; i++) {
            for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
                const spawn = getRandomSpawnPoint();
                
                // Check distance from killer
                if (dist(spawn, killerSpawn) < MIN_KILLER_DIST) continue;
                
                // Check distance from other survivors
                let tooClose = false;
                for (const used of usedPoints) {
                    if (dist(spawn, used) < 200) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    points.push(spawn);
                    usedPoints.push(spawn);
                    break;
                }
            }
        }
        
        // Fallback if not enough points found
        while (points.length < count) {
            points.push(getRandomSpawnPoint());
        }
        
        return points;
    }
    
    // Get killer spawn point (far from center where survivors usually spawn)
    function getKillerSpawnPoint() {
        // Divide map into quadrants, killer spawns in quadrant opposite to center
        const quadrants = [
            { minX: 100, maxX: 600, minY: 100, maxY: 600 },      // Top-left
            { minX: 1800, maxX: 2300, minY: 100, maxY: 600 },   // Top-right
            { minX: 100, maxX: 600, minY: 1200, maxY: 1700 },   // Bottom-left
            { minX: 1800, maxX: 2300, minY: 1200, maxY: 1700 } // Bottom-right
        ];
        
        // Shuffle quadrants
        for (let i = quadrants.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [quadrants[i], quadrants[j]] = [quadrants[j], quadrants[i]];
        }
        
        // Try to find valid spawn in quadrants (far from center)
        for (const quad of quadrants) {
            for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
                const x = quad.minX + Math.random() * (quad.maxX - quad.minX);
                const y = quad.minY + Math.random() * (quad.maxY - quad.minY);
                
                // Check if too close to any obstacle
                if (!isNearObstacle(x, y)) {
                    return { x, y };
                }
            }
        }
        
        // Fallback
        return { x: 200, y: 200 };
    }

    // Generate spawn points
    const kSpawn = getKillerSpawnPoint();
    const sSpawns = getSurvivorSpawnPoints(kSpawn, 4);

    if (isKiller) {
        player = makePlayer(this, kSpawn.x, kSpawn.y, 'killer', true);
        this.physics.add.collider(player.sprite, staticGroup);

        // AI survivors - only in singleplayer mode
        if (!isMultiplayer) {
            const sTex = ['s1', 's2', 's4'];
            sTex.forEach((t, i) => {
                const ai = makePlayer(this, sSpawns[i].x, sSpawns[i].y, t, false);
                ai.aiDir = { x: 0, y: 0 }; ai.aiTimer = 0;
                this.physics.add.collider(ai.sprite, staticGroup);
                player.aiPlayers = player.aiPlayers || [];
                player.aiPlayers.push(ai);
            });
        } else {
            player.aiPlayers = [];
            survivorsAlive = 0; // Real players will be counted via multiplayer sync
        }
    } else {
        player = makePlayer(this, sSpawns[0].x, sSpawns[0].y, 's1', true);
        this.physics.add.collider(player.sprite, staticGroup);

        // AI killer - only in singleplayer mode
        if (!isMultiplayer) {
            const aiK = makePlayer(this, kSpawn.x, kSpawn.y, 'killer', false);
            aiK.isAIKiller = true; aiK.aiTimer = 0; aiK.aiHitCooldown = 0;
            this.physics.add.collider(aiK.sprite, staticGroup);
            this.physics.add.collider(player.sprite, aiK.sprite);
            player.aiPlayers = [aiK];
            survivorsAlive = 1;
        } else {
            player.aiPlayers = [];
            survivorsAlive = 1; // Counting self only, real killer comes via multiplayer
        }
    }
}

function makePlayer(scene, x, y, tex, isMe) {
    const sp = scene.add.sprite(x, y, tex);
    sp.setDepth(1000 + y);
    scene.physics.add.existing(sp);
    sp.body.setCollideWorldBounds(true);
    const hitboxSize = (tex === 'killer') ? { w: 30, h: 35 } : { w: 24, h: 28 };
    sp.body.setSize(hitboxSize.w, hitboxSize.h, true);
    
    // Pixel art characters (s4) need different scale to match normal characters
    if (tex === 's4') {
        sp.setScale(1.5, 1.5); // Pixel art is 48x80, needs to match 72x120
    } else {
        // Reduce all character sizes by 15% for better visibility
        sp.setScale(0.85, 0.85);
    }

    const glow = scene.add.graphics();
    const glowColor = (tex === 'killer') ? 0x333333 : 0x44aaff;
    glow.fillStyle(glowColor, 0.15);
    glow.fillCircle(0, 0, 25);
    glow.setDepth(999);
    glow.setAlpha(0.5);

    const p = {
        sprite: sp,
        tex: tex,
        role: (tex === 'killer') ? 'killer' : 'survivor',
        state: 'alive',
        health: 100,
        hookTimer: 0,
        carryTarget: null,
        progressAction: null,
        isMe: isMe,
        glowFx: glow,
        glowColor: glowColor,
        isRepairing: false,
        isVulnerable: false,
        repairAnimPhase: 0,
        repairSparks: null,
        repairBobPhase: 0
    };

    // Repair animation uses the _repair texture which has arms built in
    // No separate arm sprites needed

    sp._pRef = p;
    return p;
}

function getTexWithFallback(baseTex, suffix) {
    const fullTex = baseTex + suffix;
    if (scene && scene.textures.exists(fullTex)) {
        return fullTex;
    }
    // Fallback to s3 textures
    return 's3' + suffix;
}

// ═══════ MAIN UPDATE ═══════

let gameTime = 0;

function update(time, dt) {
    if (!scene || !player || gameEnded) return;

    gameTime += dt;

    // Sync actionPressed and inputVec from Input module (for mobile/touch controls)
    if (typeof Input !== 'undefined') {
        actionPressed = actionPressed || Input.isActionPressed();
        const iv = Input.getVector();
        if (iv.x !== 0 || iv.y !== 0) {
            inputVec.x = iv.x;
            inputVec.y = iv.y;
        }
        // Also sync release - if Input action is released, reset actionPressed
        if (!Input.isActionPressed() && !keys['Space'] && !keys['KeyE']) {
            actionPressed = false;
        }
    }

    // Animate generator lights flickering and player glows
    generators.forEach(gen => {
        // Body glow pulse
        if (gen.glowGfx && !gen.repaired) {
            const pulse = 0.8 + Math.sin(gameTime * 0.003) * 0.3;
            gen.glowGfx.setAlpha(pulse * 0.15);
        }

        // Flickering light effect (slow, smooth pulsing like a dying fluorescent light)
        if (gen.lightGlowGfx && !gen.repaired) {
            // Slow sine wave flicker
            const slowFlicker = 0.4 + Math.sin(gameTime * 0.001 + gen.lightFlickerPhase) * 0.35;
            // Occasional stronger flicker
            const fastFlicker = Math.sin(gameTime * 0.008 + gen.lightFlickerPhase * 2) * 0.15;
            // Random intensity variation
            const randomFlicker = Math.sin(gameTime * 0.02 + gen.lightFlickerPhase * 3) * 0.1;
            const totalIntensity = Math.max(0.15, slowFlicker + fastFlicker + randomFlicker);

            gen.lightGlowGfx.setAlpha(totalIntensity);
            gen.lightGlowInnerGfx.setAlpha(totalIntensity * 1.5);
            gen.lightSprite.setAlpha(0.7 + totalIntensity * 0.5);
        }
        // When repaired, turn off light
        if (gen.repaired && gen.lightGlowGfx) {
            gen.lightGlowGfx.setAlpha(0);
            gen.lightGlowInnerGfx.setAlpha(0);
            gen.lightSprite.setAlpha(0.3);
        }
    });

    // Animate Silent Hill Style Fog - Dense ground fog
    if (scene.fogGfx && scene.fogPatches) {
        // Clear fog layers
        scene.fogGfx.forEach(g => g.clear());
        
        scene.fogPatches.forEach(patch => {
            // Update position - very slow crawl
            patch.wobblePhase += patch.wobbleSpeed;
            patch.x += patch.speedX;
            patch.y += Math.sin(patch.wobblePhase) * 0.1 + patch.speedY;
            
            // Wrap around map
            if (patch.x < -patch.width) patch.x = MAP_W + patch.width * 0.5;
            if (patch.x > MAP_W + patch.width) patch.x = -patch.width * 0.5;
            if (patch.y < -patch.height) patch.y = MAP_H + patch.height * 0.5;
            if (patch.y > MAP_H + patch.height) patch.y = -patch.height * 0.5;
            
            // Calculate alpha with subtle pulsing
            const pulseAlpha = patch.alpha * (0.9 + Math.sin(patch.wobblePhase * 3) * 0.1);
            
            const fg = scene.fogGfx[patch.layer];
            
            // Draw dense fog ellipse with gradient-like effect
            const { r, g, b } = patch.color;
            const color = (r << 16) | (g << 8) | b;
            
            // Main fog body
            fg.fillStyle(color, pulseAlpha);
            fg.fillEllipse(patch.x, patch.y, patch.width, patch.height);
            
            // Inner lighter fog
            fg.fillStyle(color, pulseAlpha * 0.6);
            fg.fillEllipse(patch.x, patch.y, patch.width * 0.7, patch.height * 0.7);
            
            // Core of fog (denser)
            fg.fillStyle(color, pulseAlpha * 0.3);
            fg.fillEllipse(patch.x + Math.sin(patch.wobblePhase) * 20, patch.y, patch.width * 0.4, patch.height * 0.5);
        });
    }
    
    // ═══════ Update Crows ═══════
    // In multiplayer: only host (killer) controls crow AI, others receive updates
    // In single player: local AI controls crows
    // Host is always the killer in this game
    const isHost = !isMultiplayer || isKiller;
    
    if (scene.crows) {
        if (isHost && !scene.crowsServerSync) {
            // Host controls crows - update positions and send to server
            updateCrowsAI(dt, scene.crows);
            sendCrowUpdate();
        } else if (scene.crowsServerSync) {
            // Receive crow updates from server - interpolate positions
            scene.crows.forEach(crow => {
                if (crow.serverX !== undefined && crow.serverY !== undefined) {
                    const dx = crow.serverX - crow.sprite.x;
                    const dy = crow.serverY - crow.sprite.y;
                    crow.sprite.x += dx * 0.1;
                    crow.sprite.y += dy * 0.1;
                    
                    // Update depth based on Y position
                    crow.sprite.setDepth(150 + crow.sprite.y);
                    
                    // Update flip
                    crow.sprite.setFlipX(crow.flipX || false);
                    
                    // Caw animation when flying
                    if (crow.state === 'flying') {
                        crow.flapPhase += crow.flapSpeed || 0.1;
                    }
                }
            });
        }
    }
    
    // Animate dust particles
    if (scene.dustGfx && scene.dustParticles) {
        const dust = scene.dustGfx;
        dust.clear();
        
        scene.dustParticles.forEach(p => {
            // Update position with wobble
            p.wobble += 0.02;
            p.x += p.speedX + Math.sin(p.wobble) * 0.2;
            p.y += p.speedY;
            
            // Wrap around map
            if (p.x < 0) p.x = MAP_W;
            if (p.x > MAP_W) p.x = 0;
            if (p.y < 0) p.y = MAP_H;
            if (p.y > MAP_H) p.y = 0;
            
            // Flickering alpha
            const flickerAlpha = p.alpha + Math.sin(gameTime * 0.005 + p.x * 0.01) * 0.05;
            
            dust.fillStyle(0x8a8a7a, flickerAlpha);
            dust.fillCircle(p.x, p.y, p.size);
        });
    }
    
    // Vignette effect
    const vig = scene.vignetteGfx;
    vig.clear();
    
    const cam = scene.cameras.main;
    const cx = cam.scrollX + cam.width / 2;
    const cy = cam.scrollY + cam.height / 2;
    const radius = Math.max(cam.width, cam.height) * 0.8;
    
    for (let i = 0; i < 10; i++) {
        const r = radius - i * 30;
        const alpha = 0.02 + i * 0.015;
        vig.lineStyle(40, 0x000000, alpha);
        vig.strokeCircle(cx, cy, r);
    }

    [player].concat(player.aiPlayers || []).forEach(p => {
        if (p.glowFx) {
            const pulse = 0.5 + Math.sin(gameTime * 0.004) * 0.2;
            p.glowFx.setAlpha(pulse * 0.4);
            p.glowFx.setPosition(p.sprite.x, p.sprite.y);
        }

        // Update repair animation
        if (p.isRepairing && p.progressAction && p.progressAction.target) {
            const gen = p.progressAction.target;
            const sp = p.sprite;

            // Show repair texture (crouching) - this already has arms built in
            if (!sp.texture.key.includes('_repair')) {
                sp.setTexture(getTexWithFallback(p.tex, '_repair'));
            }

            // Spark particles effect
            if (p.repairSparks) {
                p.repairSparks.setVisible(true);
                p.repairSparks.clear();

                // Generate sparks near generator where hands work
                const sparkCount = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < sparkCount; i++) {
                    const sparkAngle = Math.random() * Math.PI * 2;
                    const sparkDist = 15 + Math.random() * 20;
                    const sparkX = gen.bx + Math.cos(sparkAngle) * sparkDist;
                    const sparkY = gen.by - 10 + Math.sin(sparkAngle) * sparkDist;
                    const sparkSize = 1 + Math.random() * 2;

                    // Yellow-white spark color
                    const brightness = Math.random();
                    if (brightness > 0.7) {
                        p.repairSparks.fillStyle(0xffffff, 0.9);
                    } else if (brightness > 0.4) {
                        p.repairSparks.fillStyle(0xffdd44, 0.8);
                    } else {
                        p.repairSparks.fillStyle(0xff8800, 0.7);
                    }
                    p.repairSparks.fillCircle(sparkX, sparkY, sparkSize);
                }
            }

            // Body bobbing animation (leaning into work)
            p.repairBobPhase += dt * 0.008;
        } else {
            // Clear repair animation state
            p._repairBobOffset = undefined;
        }

        // Update dying (crawling) texture
        const sp = p.sprite;
        if (p.state === 'dying') {
            // Show dying texture (crawling on ground)
            if (!sp.texture.key.includes('_dying')) {
                sp.setTexture(getTexWithFallback(p.tex, '_dying'));
            }
            // Keep scale at 1,1 - no distortion
            sp.setScale(1, 1);
            // Rotation wobble handled separately
        } else if (p.carryTarget) {
            // Update carried texture for the carried survivor
            const carried = p.carryTarget;
            const carriedSprite = carried.sprite;
            
            // Show carried texture (on killer's shoulder)
            if (!carriedSprite.texture.key.includes('_carried')) {
                carriedSprite.setTexture(getTexWithFallback(carried.tex, '_carried'));
            }
            
            // Resistance animation for carried survivor
            if (!carried._resistancePhase) {
                carried._resistancePhase = 0;
            }
            
            // Update resistance animation
            carried._resistancePhase += dt * 0.02; // Speed of resistance animation
            
            // Apply subtle shaking effect to simulate resistance
            const resistanceShake = Math.sin(carried._resistancePhase * 3) * 0.05;
            carriedSprite.setScale(1 + resistanceShake, 1 - resistanceShake * 0.3);
        } else if (!p.isRepairing && !p.progressAction) {
            // Reset to normal texture when not repairing and not dying
            if (sp.texture.key.includes('_dying') || sp.texture.key.includes('_repair') || sp.texture.key.includes('_carried')) {
                sp.setTexture(p.tex);
                // Reset scale if it was modified for resistance animation
                sp.setScale(1, 1);
            }
        }
    });

    updatePlayer(dt);
    updateAI(dt);
    updateHooks(dt);
    updatePallets(dt);
    flushFloatBars();
    updateHUD();
    checkWinLose();

    // Debug: update remote players count display
    if (isMultiplayer) {
        const debugEl = document.getElementById('remote-players-count');
        if (debugEl) {
            debugEl.textContent = 'RP: ' + Object.keys(remotePlayers).length;
        }
    }

    // Smooth interpolation for remote players in multiplayer
    if (isMultiplayer) {
        interpolateRemotePlayers(dt);
    }

    // Send position update in multiplayer
    if (isMultiplayer && roomCode && playerId) {
        sendPositionUpdate();
    }
}

// ═══════ Update Crows AI (Host only) ═══════
function updateCrowsAI(dt, crows) {
    crows.forEach(crow => {
        const cs = crow.sprite;
        
        // Get all player positions for avoidance
        const playerPositions = [];
        if (player && player.sprite) {
            playerPositions.push({ x: player.sprite.x, y: player.sprite.y });
        }
        if (player && player.aiPlayers) {
            player.aiPlayers.forEach(ai => {
                if (ai.sprite) playerPositions.push({ x: ai.sprite.x, y: ai.sprite.y });
            });
        }
        // Add remote players in multiplayer
        if (isMultiplayer) {
            Object.values(remotePlayers).forEach(rp => {
                if (rp.sprite) playerPositions.push({ x: rp.sprite.x, y: rp.sprite.y });
            });
        }
        
        if (crow.state === 'flying') {
            // Flapping animation
            crow.flapPhase += crow.flapSpeed;
            const flapOffset = Math.sin(crow.flapPhase) * 2;
            
            // Check if should land
            crow.sitTimer += dt / 1000;
            if (crow.sitTimer > crow.maxSitTime) {
                // Find a landing spot
                const obstacles = getMapObstacles();
                const landingCandidates = [];
                obstacles.forEach(o => {
                    if (o.t.includes('tree') || o.t.includes('pine') || o.t.includes('stone') || o.t.includes('brick')) {
                        landingCandidates.push({
                            x: o.x + o.sw / 2,
                            y: o.y + o.sh / 2 - 20
                        });
                    }
                });
                
                if (landingCandidates.length > 0 && Math.random() > 0.3) {
                    const spot = landingCandidates[Math.floor(Math.random() * landingCandidates.length)];
                    crow.landingSpot = spot;
                    crow.targetX = spot.x;
                    crow.targetY = spot.y;
                    crow.state = 'landing';
                    crow.sitTimer = 0;
                } else {
                    // Just keep flying, find new wander target
                    crow.wanderTimer = 0;
                }
            }
            
            // Wander behavior
            crow.wanderTimer += dt / 1000;
            if (crow.wanderTimer > crow.wanderInterval) {
                crow.wanderTimer = 0;
                crow.wanderInterval = 3 + Math.random() * 5;
                crow.targetX = 100 + Math.random() * (MAP_W - 200);
                crow.targetY = 100 + Math.random() * (MAP_H - 200);
            }
            
            // Avoid players - NEVER fly near players
            playerPositions.forEach(pp => {
                const distToPlayer = Math.sqrt((cs.x - pp.x) ** 2 + (cs.y - pp.y) ** 2);
                if (distToPlayer < 150) {
                    // Fly away from player
                    const angle = Math.atan2(cs.y - pp.y, cs.x - pp.x);
                    crow.targetX = cs.x + Math.cos(angle) * 300;
                    crow.targetY = cs.y + Math.sin(angle) * 200;
                    crow.targetX = Math.max(100, Math.min(MAP_W - 100, crow.targetX));
                    crow.targetY = Math.max(100, Math.min(MAP_H - 100, crow.targetY));
                }
            });
            
            // Move towards target
            const dx = crow.targetX - cs.x;
            const dy = crow.targetY - cs.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
                const speed = 60 + Math.random() * 30;
                crow.speedX = (dx / dist) * speed;
                crow.speedY = (dy / dist) * speed;
                
                cs.x += crow.speedX * (dt / 1000);
                cs.y += crow.speedY * (dt / 1000) + flapOffset;
                
                // Flip based on direction
                crow.flipX = crow.speedX < 0;
                cs.setFlipX(crow.flipX);
            }
            
            // Keep in bounds
            cs.x = Math.max(50, Math.min(MAP_W - 50, cs.x));
            cs.y = Math.max(50, Math.min(MAP_H - 50, cs.y));
            
        } else if (crow.state === 'landing') {
            // Move to landing spot
            const dx = crow.targetX - cs.x;
            const dy = crow.targetY - cs.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            crow.flapPhase += crow.flapSpeed * 2;
            
            if (dist > 10) {
                const speed = 80;
                cs.x += (dx / dist) * speed * (dt / 1000);
                cs.y += (dy / dist) * speed * (dt / 1000);
                cs.setTexture('crow');
                crow.flipX = dx < 0;
                cs.setFlipX(crow.flipX);
            } else {
                // Landed
                crow.state = 'sitting';
                crow.sitTimer = 0;
                crow.maxSitTime = 5 + Math.random() * 15;
                cs.setTexture('crow_sitting');
            }
            
        } else if (crow.state === 'sitting') {
            // Sitting on object
            crow.sitTimer += dt / 1000;
            
            // Check if player is approaching - fly away immediately
            let playerTooClose = false;
            playerPositions.forEach(pp => {
                const distToPlayer = Math.sqrt((cs.x - pp.x) ** 2 + (cs.y - pp.y) ** 2);
                if (distToPlayer < 80) {
                    playerTooClose = true;
                }
            });
            
            if (playerTooClose || crow.sitTimer > crow.maxSitTime) {
                // Take off!
                crow.state = 'flying';
                crow.sitTimer = 0;
                crow.maxSitTime = 5 + Math.random() * 15;
                cs.setTexture('crow');
                
                // Show caw bubble when taking off
                crow.cawTimer = 1.5;
                
                // Fly away from current position
                crow.targetX = cs.x + (Math.random() - 0.5) * 400;
                crow.targetY = cs.y - 100 - Math.random() * 200;
                crow.targetX = Math.max(100, Math.min(MAP_W - 100, crow.targetX));
                crow.targetY = Math.max(100, Math.min(MAP_H - 100, crow.targetY));
            }
        }
        
        // Update caw timer and display
        crow.cawTimer -= dt / 1000;
        if (crow.cawTimer > 0 && crow.cawTimer < 1.2) {
            // Show caw bubble
            if (!crow.cawBubble) {
                crow.cawBubble = scene.add.graphics();
            }
            crow.cawBubble.clear();
            const cawAlpha = crow.cawTimer > 0.3 ? 1 : crow.cawTimer / 0.3;
            const cawY = cs.y - 25 - (1.5 - crow.cawTimer) * 10;
            crow.cawBubble.fillStyle(0xffffff, 0.85 * cawAlpha);
            crow.cawBubble.fillRoundedRect(cs.x - 12, cawY, 24, 14, 4);
            crow.cawBubble.lineStyle(1, 0x000000, 0.5 * cawAlpha);
            crow.cawBubble.strokeRoundedRect(cs.x - 12, cawY, 24, 14, 4);
            
            if (!crow.cawText) {
                crow.cawText = scene.add.text(0, 0, 'KAW!', {
                    fontFamily: 'Arial Black',
                    fontSize: '8px',
                    color: '#1a1a1a',
                    fontStyle: 'bold'
                }).setOrigin(0.5);
            }
            crow.cawText.setPosition(cs.x, cawY + 7);
            crow.cawText.setAlpha(0.85 * cawAlpha);
            crow.cawText.setDepth(301);
        } else {
            if (crow.cawBubble) crow.cawBubble.clear();
            if (crow.cawText) crow.cawText.setAlpha(0);
        }
        
        // Update depth based on Y position
        cs.setDepth(150 + cs.y);
    });
}

function updatePallets(dt) {
    pallets.forEach(pallet => {
        // Update drop cooldown
        if (pallet.dropCooldown > 0) {
            pallet.dropCooldown -= dt / 1000;
        }
        
        // Update stun timer (for killer hit effect)
        if (pallet.stunTimer > 0) {
            pallet.stunTimer -= dt / 1000;
        }
        
        // Handle falling animation
        if (pallet.state === 'dropping') {
            pallet.dropTimer += dt / 1000;
            const fallProgress = pallet.dropTimer / 0.3; // 0.3 seconds to fall
            
            if (fallProgress >= 1) {
                // Pallet has fallen - check if killer is nearby to stun
                pallet.state = 'fallen';
                pallet.sprite.setTexture('pallet_falling');
                pallet.sprite.setScale(1, 1);
                
                // Check if killer is in range (within ~50px of pallet)
                let killerHit = false;
                
                // Check local killer
                if (isKiller && player && player.sprite) {
                    const dist = Math.sqrt(
                        Math.pow(player.sprite.x - pallet.bx, 2) + 
                        Math.pow(player.sprite.y - pallet.by, 2)
                    );
                    if (dist < 60) {
                        killerHit = true;
                        killerStun = CONFIG.STUN_TIME;
                        UI.showToast('💥 Убийца оглушён!', 1500);
                    }
                }
                
                // Check remote killers in multiplayer
                if (isMultiplayer && !killerHit) {
                    Object.values(remotePlayers).forEach(rp => {
                        if (rp.role === 'killer' && rp.sprite && !killerHit) {
                            const dist = Math.sqrt(
                                Math.pow(rp.sprite.x - pallet.bx, 2) + 
                                Math.pow(rp.sprite.y - pallet.by, 2)
                            );
                            if (dist < 60) {
                                killerHit = true;
                                // Notify server about stun
                                if (isMultiplayer && roomCode && playerId) {
                                    stunRemoteKiller(roomCode);
                                }
                            }
                        }
                    });
                }
                
                if (killerHit) {
                    pallet.stunTimer = 0.5;
                    // Show hit effect
                    pallet.hitFx = scene.add.graphics();
                    pallet.hitFx.fillStyle(0xffff00, 0.5);
                    pallet.hitFx.fillCircle(pallet.bx, pallet.by - 20, 40);
                    pallet.hitFx.setDepth(500);
                    setTimeout(() => {
                        if (pallet.hitFx) pallet.hitFx.destroy();
                    }, 300);
                }
                
                // Start break timer after falling (auto-breaks after 15 seconds)
                pallet.breakTimer = 15;
                
                // Sync pallet state in multiplayer
                if (isMultiplayer && roomCode && playerId) {
                    updatePalletState(roomCode, pallet.palletId, 'fallen', pallet.bx, pallet.by);
                }
            } else {
                // Animate falling
                const angle = fallProgress * Math.PI / 2;
                pallet.sprite.setScale(1.2, 1 - fallProgress * 0.3);
                pallet.sprite.setRotation(angle);
            }
        }
        
        // Handle broken state (fade out and remove)
        if (pallet.state === 'broken') {
            pallet.breakTimer -= dt / 1000;
            pallet.sprite.setAlpha(pallet.breakTimer / 2);

            if (pallet.breakTimer <= 0) {
                pallet.sprite.setVisible(false);
                if (pallet.shadow) pallet.shadow.setVisible(false);
            }
        }
        
        // Break timer countdown for fallen pallets
        if (pallet.state === 'fallen' && pallet.breakTimer > 0) {
            pallet.breakTimer -= dt / 1000;
        }
        
        // Update shadow position
        if (pallet.shadow && pallet.sprite && pallet.sprite.visible) {
            pallet.shadow.clear();
            if (pallet.state === 'standing') {
                pallet.shadow.fillStyle(0x000000, 0.3);
                pallet.shadow.fillEllipse(pallet.bx, pallet.by + 35, 30, 12);
            } else if (pallet.state === 'fallen' || pallet.state === 'broken') {
                pallet.shadow.fillStyle(0x000000, 0.3);
                pallet.shadow.fillEllipse(pallet.bx, pallet.by + 15, 50, 15);
            }
        }
        
        // Show interaction hint
        if (!isKiller && pallet.state === 'standing' && !pallet.progressAction) {
            // Check if killer is nearby (within 150px) for survivor to drop pallet
            let killerNearby = false;
            
            if (player && player.sprite) {
                const dist = Math.sqrt(
                    Math.pow(player.sprite.x - pallet.bx, 2) + 
                    Math.pow(player.sprite.y - pallet.by, 2)
                );
                killerNearby = dist < 150;
            }
            
            if (killerNearby && pallet.dropCooldown <= 0) {
                pallet.interactHint = pallet.interactHint || scene.add.text(0, 0, '[E] Сбросить доску', {
                    fontFamily: 'Arial',
                    fontSize: '14px',
                    color: '#ffdd00',
                    stroke: '#000000',
                    strokeThickness: 3
                }).setOrigin(0.5).setDepth(1000);
                pallet.interactHint.setPosition(pallet.bx, pallet.by - 60);
                pallet.interactHint.setVisible(true);
            } else if (pallet.interactHint) {
                pallet.interactHint.setVisible(false);
            }
        } else if (isKiller && pallet.state === 'standing' && !pallet.progressAction) {
            // Killer can break standing pallets
            if (player && player.sprite) {
                const dist = Math.sqrt(
                    Math.pow(player.sprite.x - pallet.bx, 2) + 
                    Math.pow(player.sprite.y - pallet.by, 2)
                );
                if (dist < 50) {
                    pallet.interactHint = pallet.interactHint || scene.add.text(0, 0, '[E] Сломать', {
                        fontFamily: 'Arial',
                        fontSize: '14px',
                        color: '#ff6600',
                        stroke: '#000000',
                        strokeThickness: 3
                    }).setOrigin(0.5).setDepth(1000);
                    pallet.interactHint.setPosition(pallet.bx, pallet.by - 60);
                    pallet.interactHint.setVisible(true);
                } else if (pallet.interactHint) {
                    pallet.interactHint.setVisible(false);
                }
            }
        } else if (pallet.interactHint) {
            pallet.interactHint.setVisible(false);
        }
    });
    
    // Handle pallet interactions
    if (actionPressed) {
        if (!isKiller) {
            // Survivor can drop pallets to stun killer
            pallets.forEach(pallet => {
                if (pallet.state === 'standing' && pallet.dropCooldown <= 0 && player && player.sprite) {
                    const dist = Math.sqrt(
                        Math.pow(player.sprite.x - pallet.bx, 2) + 
                        Math.pow(player.sprite.y - pallet.by, 2)
                    );
                    if (dist < 50) {
                        dropPallet(pallet);
                    }
                }
            });
        } else {
            // Killer can break pallets
            pallets.forEach(pallet => {
                if (pallet.state === 'standing' && player && player.sprite) {
                    const dist = Math.sqrt(
                        Math.pow(player.sprite.x - pallet.bx, 2) + 
                        Math.pow(player.sprite.y - pallet.by, 2)
                    );
                    if (dist < 50) {
                        breakPallet(pallet);
                    }
                }
            });
        }
    }
}

function dropPallet(pallet) {
    if (pallet.state !== 'standing') return;
    
    pallet.state = 'dropping';
    pallet.dropTimer = 0;
    pallet.sprite.setTexture('pallet');
    pallet.sprite.setScale(1.2, 1);
    pallet.sprite.setRotation(0);
    pallet.dropCooldown = 0.5;
    
    if (pallet.interactHint) pallet.interactHint.setVisible(false);
    
    UI.showToast('💨 Доска падает!', 800);
}

function breakPallet(pallet) {
    if (pallet.state !== 'standing') return;
    
    pallet.state = 'broken';
    pallet.breakTimer = 2;
    pallet.sprite.setTexture('pallet_broken');
    pallet.sprite.setScale(1.2, 1);
    
    // Break sound effect placeholder
    UI.showToast('💪 Убийца ломает доску!', 1000);
    
    // Sync in multiplayer
    if (isMultiplayer && roomCode && playerId) {
        updatePalletState(roomCode, pallet.palletId, 'broken', pallet.bx, pallet.by);
    }
}

function updatePlayer(dt) {
    const p = player;
    const sp = p.sprite;

    sp.setDepth(1000 + sp.y);
    
    // Fog hiding effect - survivors become less visible in dense fog
    if (p.role === 'survivor' && scene && scene.fogPatches) {
        let fogDensity = 0;
        scene.fogPatches.forEach(patch => {
            const dx = sp.x - patch.x;
            const dy = sp.y - patch.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = patch.width * 0.6;
            if (dist < maxDist) {
                fogDensity += (1 - dist / maxDist) * patch.alpha;
            }
        });
        
        // Apply fog effect - reduce visibility in dense fog
        if (fogDensity > 0.3) {
            // Darken/smother sprite in fog
            const fogAlpha = Math.min(0.6, fogDensity * 0.8);
            sp.setAlpha(0.4 + (1 - fogAlpha));
            // Add slight blur effect via tint
            if (!sp.tintTopLeft || sp.tintTopLeft === 0xffffff) {
                sp.setTint(0x888899);
            }
            
            // Show hint when first entering fog
            if (!p.inFog) {
                p.inFog = true;
                UI.showToast('🌫️ Ты скрылся в тумане...', 1500);
            }
        } else {
            sp.setAlpha(1);
            if (p.inFog) {
                sp.clearTint();
                p.inFog = false;
            }
        }
    }

    if (p.role === 'killer') {
        // Killer is also affected by fog (slightly less visible)
        if (scene && scene.fogPatches) {
            let fogDensity = 0;
            scene.fogPatches.forEach(patch => {
                const dx = sp.x - patch.x;
                const dy = sp.y - patch.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = patch.width * 0.6;
                if (dist < maxDist) {
                    fogDensity += (1 - dist / maxDist) * patch.alpha;
                }
            });
            
            if (fogDensity > 0.5) {
                const fogAlpha = Math.min(0.4, fogDensity * 0.5);
                sp.setAlpha(0.6 + (1 - fogAlpha));
            } else {
                sp.setAlpha(1);
            }
        }
        
        if (killerStun > 0) {
            killerStun -= dt / 1000;
            sp.body.setVelocity(0, 0);
            
            // If the killer was carrying someone and gets stunned, drop the carried survivor
            if (p.carryTarget) {
                const droppedSurvivor = p.carryTarget;
                p.carryTarget = null;
                isCarryingNearHook = false;
                updateActionButton(false);
                
                // Reset scale and texture when dropping survivor
                droppedSurvivor.sprite.setScale(1, 1);
                droppedSurvivor.sprite.setRotation(0);
                droppedSurvivor._carryAnimTimer = 0;
                droppedSurvivor._carryAnimPhase = 'idle';
                droppedSurvivor._carryAnimDuration = 0;
                droppedSurvivor._carryIdlePhase = 0;
                if (droppedSurvivor.sprite.texture.key.includes('_carried')) {
                    droppedSurvivor.sprite.setTexture(droppedSurvivor.tex);
                }
                
                UI.showToast('💪 Выживший выпал из рук!', 2000);
            }
            
            return;
        }
        
        // Update timers
        if (killerSlowdown > 0) {
            killerSlowdown -= dt / 1000;
        }
        if (killerAttackCooldown > 0) {
            killerAttackCooldown -= dt / 1000;
        }
        
        // Update strike animation timer
        if (killerStrikeTimer > 0) {
            killerStrikeTimer -= dt / 1000;
            if (!sp.texture.key.includes('killer_strike')) {
                sp.setTexture('killer_strike');
            }
            if (killerStrikeTimer <= 0) {
                sp.setTexture('killer');
                if (isMultiplayer && roomCode && playerId) {
                    setKillerStrikeAnimation(roomCode, playerId, false);
                }
            }
        }
        
        // Handle attack on button press (only when not in cooldown and not during strike animation)
        if (actionPressed && killerAttackCooldown <= 0 && killerStrikeTimer <= 0) {
            killerAction(dt);
        }
        
        // Calculate speed
        let killerSpd = CONFIG.KILLER_SPEED;
        if (killerSlowdown > 0) {
            killerSpd = CONFIG.KILLER_SPEED * 0.5;
        }
        
        // Slower when carrying someone
        if (p.carryTarget) {
            killerSpd = CONFIG.KILLER_SPEED * 0.7;
        }
        
        const v = normalize(inputVec);
        sp.body.setVelocity(v.x * killerSpd, v.y * killerSpd);
        
        // Flip killer sprite based on horizontal movement direction
        if (v.x < -0.1) {
            sp.setFlipX(true);
        } else if (v.x > 0.1) {
            sp.setFlipX(false);
        }
        // Ensure killer never rotates upside down
        sp.setRotation(0);
        
        // Update carried survivor position
        if (p.carryTarget) {
            const ct = p.carryTarget;
            ct.sprite.setPosition(sp.x, sp.y - 28);
            
            // Sync carried survivor position in multiplayer
            if (isMultiplayer && roomCode && ct.playerId) {
                setCarriedPosition(roomCode, ct.playerId, sp.x, sp.y);
            }
            
            // Reset carried texture if not already set
            if (!ct.sprite.texture.key.includes('_carried')) {
                ct.sprite.setTexture(ct.tex + '_carried');
            }
        }
    } else {
        if (p.state === 'hooked' || p.state === 'dead') {
            sp.body.setVelocity(0, 0);
            return;
        }
        
        // Being carried - survivor can only watch, no movement
        if (p.state === 'carried') {
            sp.body.setVelocity(0, 0);
            
            // Occasional animation when being carried
            if (!p._carryAnimTimer) p._carryAnimTimer = 0;
            if (!p._carryAnimPhase) p._carryAnimPhase = 'idle';
            if (!p._carryAnimDuration) p._carryAnimDuration = 0;
            
            p._carryAnimTimer += dt;
            
            // Change animation phase occasionally (every 500-1500ms)
            if (p._carryAnimTimer > p._carryAnimDuration) {
                const rand = Math.random();
                if (rand < 0.3) {
                    p._carryAnimPhase = 'arms_up';
                    p._carryAnimDuration = 300 + Math.random() * 400;
                } else if (rand < 0.5) {
                    p._carryAnimPhase = 'legs_flex';
                    p._carryAnimDuration = 400 + Math.random() * 500;
                } else {
                    p._carryAnimPhase = 'idle';
                    p._carryAnimDuration = 800 + Math.random() * 1200;
                }
                p._carryAnimTimer = 0;
            }
            
            // Apply animation based on phase - no scale distortion
            if (p._carryAnimPhase === 'arms_up') {
                sp.setScale(1, 1);
                sp.setRotation(0);
            } else if (p._carryAnimPhase === 'legs_flex') {
                sp.setScale(1, 1);
                sp.setRotation(0);
            } else {
                // Idle - no rotation for carried survivors
                sp.setScale(1, 1);
                sp.setRotation(0);
            }
            return;
        }
        
        // Reset rotation if not being carried
        if (sp.rotation !== 0) {
            sp.setRotation(0);
            sp.setScale(1, 1);
        }
        let spd = CONFIG.PLAYER_SPEED;
        if (p.state === 'injured') spd = CONFIG.INJURED_SPEED;
        if (p.state === 'dying') spd = CONFIG.DYING_SPEED;
        if (boostTimer > 0) {
            boostTimer -= dt / 1000;
            spd = Math.min(spd * 1.25, CONFIG.PLAYER_SPEED * 1.25);
        }
        if (survivorSpeedBoost > 0) {
            survivorSpeedBoost -= dt / 1000;
            spd = Math.min(spd * 1.5, CONFIG.PLAYER_SPEED * 1.5);
        }
        const v = normalize(inputVec);
        sp.body.setVelocity(v.x * spd, v.y * spd);

        // Rotate sprite based on movement direction only when dying (crawling on ground)
        if (p.state === 'dying' && (v.x !== 0 || v.y !== 0)) {
            const targetAngle = Math.atan2(v.y, v.x) * (180 / Math.PI);
            // Smooth rotation
            let currentAngle = sp.rotation * (180 / Math.PI);
            let diff = targetAngle - currentAngle;
            // Normalize angle difference
            while (diff > 180) diff -= 360;
            while (diff < -180) diff += 360;
            sp.rotation += (diff * 0.15) * (Math.PI / 180);
        }

        if (actionPressed) survivorAction(dt);
        else cancelProgress(p);
    }
}

function killerAction(dt) {
    const p = player;
    const sp = p.sprite;

    if (p.carryTarget) {
        const ct = p.carryTarget;
        ct.sprite.setPosition(sp.x, sp.y - 28);
        
        // Sync carried survivor position in multiplayer
        if (isMultiplayer && roomCode && ct.playerId) {
            setCarriedPosition(roomCode, ct.playerId, sp.x, sp.y);
        }
        
        // Reset carried texture if not already set
        if (!ct.sprite.texture.key.includes('_carried')) {
            ct.sprite.setTexture(getTexWithFallback(ct.tex, '_carried'));
        }
        
        const hook = nearestFreeHook(sp);
        if (hook && dist(sp, hook) < CONFIG.INTERACT_DISTANCE + 20) {
            isCarryingNearHook = true;
            updateActionButton(true);
            
            if (actionPressed) {
                hangSurvivor(ct, hook);
                p.carryTarget = null;
                isCarryingNearHook = false;
                updateActionButton(false);
                
                UI.showToast('🪝 Выживший повешен!', 2000);

                if (isMultiplayer && roomCode && playerId) {
                    hookSurvivor(roomCode, ct.playerId, hook.id);
                }
            }
        } else {
            isCarryingNearHook = false;
            updateActionButton(false);
        }
        return;
    }

    // Show attack animation on every swing
    killerStrikeTimer = 0.3;
    if (!sp.texture.key.includes('killer_strike')) {
        sp.setTexture('killer_strike');
    }

    // Check for target in range
    const target = nearestAliveTarget(sp, CONFIG.CATCH_DISTANCE);
    if (target) {
        const t = target._pRef;
        if (!t) return;

        // Hit survivor based on their state
        if (t.state === 'alive') {
            // First hit - survivor becomes injured
            t.state = 'injured';
            t.isVulnerable = false;
            t.sprite.setTint(0xff8888);
            // Killer slows down for 2 seconds
            killerSlowdown = 2.0;
            killerAttackCooldown = 1.5;
            // Survivor speeds up for 1 second
            if (t.isMe) {
                boostTimer = 1.0;
                survivorSpeedBoost = 1.0;
            }
            UI.showToast('💥 Выживший ранен!', 2000);

            if (isMultiplayer && roomCode && playerId) {
                setKillerStrikeAnimation(roomCode, playerId, true, t.playerId);
                setPlayerInjured(roomCode, t.playerId);
                clearPlayerAnimation(roomCode, t.playerId);
            }
        } else if (t.state === 'injured') {
            // Second hit - survivor falls to ground (dying state)
            t.state = 'dying';
            t.isVulnerable = false;
            t.sprite.setTint(0xff4444);
            t.progressAction = null;
            t.isRepairing = false;
            if (t.repairSparks) t.repairSparks.setVisible(false);
            t.sprite.setScale(1, 1);
            t.sprite.setAlpha(1);
            if (t.sprite.texture.key.includes('_repair')) {
                t.sprite.setTexture(t.tex);
            }
            // Killer slows down for 1 second after downing
            killerSlowdown = 1.0;
            killerAttackCooldown = 1.0;
            UI.showToast('⬇️ Выживший упал на землю!', 2000);

            if (isMultiplayer && roomCode && playerId) {
                setKillerStrikeAnimation(roomCode, playerId, true, t.playerId);
                setPlayerDying(roomCode, t.playerId);
                clearPlayerAnimation(roomCode, t.playerId);
            }
        } else if (t.state === 'dying') {
            // Pick up dying survivor
            p.carryTarget = t;
            t.state = 'carried';
            t.isVulnerable = false;
            killerAttackCooldown = 0.8;
            UI.showToast('💪 Поднимаешь выжившего...', 2000);

            if (isMultiplayer && roomCode && playerId) {
                setPlayerCarrying(roomCode, playerId, t.playerId);
            }
        }
        return;
    }
    
    // Missed - short cooldown so player can't spam infinitely
    killerAttackCooldown = 0.3;

    // Break generator
    generators.forEach(gen => {
        if (gen.repaired || gen.progress <= 0) return;
        if (dist(sp, gen) < CONFIG.INTERACT_DISTANCE) {
            gen.progress = Math.max(0, gen.progress - CONFIG.GENERATOR_BREAK_RATE * (dt / 1000));
            drawBar(gen.barGfx, gen.bx, gen.by, gen.progress, 0xff3322);
            if (gen.progress <= 0) {
                gen.setTint(0x444444);
                if (gen.glowGfx) gen.glowGfx.setAlpha(0);
                if (gen.lightGlowGfx) gen.lightGlowGfx.setAlpha(0);
                if (gen.lightGlowInnerGfx) gen.lightGlowInnerGfx.setAlpha(0);
                if (gen.lightSprite) gen.lightSprite.setAlpha(0.2);
                UI.showToast('💥 Генератор сломан!', 2000);

                if (isMultiplayer && roomCode) {
                    updateGeneratorProgress(roomCode, gen.genId, gen.progress, false);
                }
            }
        }
    });

    // Close hatch
    if (hatch && !hatchClosed && dist(sp, hatch) < CONFIG.INTERACT_DISTANCE + 10) {
        closeHatchByKiller();
    }
}

function survivorAction(dt) {
    const p = player;
    const sp = p.sprite;

    if (p.state === 'dying' || p.state === 'hooked') return;

    // Hatch escape logic
    const done = generators.filter(g => g.repaired).length;
    const allGensRepaired = done >= CONFIG.GENERATOR_COUNT;
    const onlyOneSurvivor = getAliveSurvivorCount() === 1;
    const canUseHatch = allGensRepaired || onlyOneSurvivor;
    const nearHatch = hatch && !hatchClosed && canUseHatch && (p.state === 'alive' || p.state === 'injured') && dist(sp, hatch) < 60;
    
    // Check if killer is near (in single player, check aiPlayers; in multiplayer check remotePlayers)
    let nearKiller = false;
    if (isMultiplayer) {
        Object.values(remotePlayers).forEach(rp => {
            if (rp.role === 'killer') {
                nearKiller = nearKiller || dist(sp, { x: rp.x, y: rp.y }) < 120;
            }
        });
    } else {
        (player.aiPlayers || []).forEach(ai => {
            if (ai.isAIKiller) {
                nearKiller = nearKiller || dist(sp, ai.sprite) < 120;
            }
        });
    }
    
    if (nearHatch && !nearKiller) {
        isNearHatch = true;
        
        // Check if survivor is escaping
        if (isEscapingHatch) {
            hatchEscapeProgress += dt / 1000;
            const pct = Math.min(100, (hatchEscapeProgress / HATCH_ESCAPE_TIME) * 100);
            
            // Animate: scale down, fade out, and sink
            const scale = 1 - (pct / 100) * 0.8;
            const alpha = 1 - (pct / 100) * 0.9;
            const sinkY = pct / 100 * 30;
            
            sp.setScale(scale);
            sp.setAlpha(alpha);
            sp.y += sinkY * (dt / 1000 * 20);
            
            // Show progress bar
            drawBar(floatBarGfx || scene.add.graphics(), sp.x, sp.y - 50, pct, 0xffaa00);
            
            if (hatchEscapeProgress >= HATCH_ESCAPE_TIME) {
                p.state = 'escaped';
                UI.showToast('🏆 Ты сбежал через люк!', 2000);
                
                if (isMultiplayer && roomCode && playerId) {
                    setPlayerEscaped(roomCode, playerId);
                }
                
                doEndGame(true, 'Ты сбежал через люк!');
            }
            return;
        }
        
        // Show action button for hatch escape
        updateActionButtonForHatch(true);
        
        if (actionPressed && !isEscapingHatch) {
            isEscapingHatch = true;
            hatchEscapeProgress = 0;
            sp.body.setVelocity(0, 0);
            UI.showToast('🔓 Пытаешься сбежать...', 1000);
            
            if (isMultiplayer && roomCode && playerId) {
                setPlayerAnimation(roomCode, playerId, 'escape_hatch', 0);
            }
        }
        
        if (!actionPressed && !isEscapingHatch) {
            updateActionButtonForHatch(false);
        }
        
        return;
    } else {
        isNearHatch = false;
        updateActionButtonForHatch(false);
        
        // Reset escape state if moved away or killer is near
        if (isEscapingHatch) {
            isEscapingHatch = false;
            hatchEscapeProgress = 0;
            sp.setScale(1);
            sp.setAlpha(1);
            UI.showToast('❌ Побег прерван!', 1000);
            if (isMultiplayer && roomCode && playerId) {
                clearPlayerAnimation(roomCode, playerId);
            }
        }
    }

    // Check if still near the generator being repaired
    if (p.isRepairing && p.progressAction && p.progressAction.type === 'repair') {
        const gen = p.progressAction.target;
        if (!gen || dist(sp, gen) >= CONFIG.INTERACT_DISTANCE) {
            cancelProgress(p);
        }
    }

    let acted = false;

    // Repair generator
    if (!acted) {
        generators.some(gen => {
            if (gen.repaired) return false;
            if (dist(sp, gen) < CONFIG.INTERACT_DISTANCE) {
                acted = true;
                sp.body.setVelocity(0, 0);
                const isNewAction = !p.progressAction || p.progressAction.target !== gen;
                if (isNewAction) {
                    p.progressAction = { type: 'repair', target: gen };
                    p.isVulnerable = true;
                    if (isMultiplayer && roomCode && playerId) {
                        setPlayerAnimation(roomCode, playerId, 'repair', gen.genId);
                    }
                }

                // Start repair animation
                p.isRepairing = true;
                if (!sp.texture.key.includes('_repair')) {
                    sp.setTexture(getTexWithFallback(p.tex, '_repair'));
                }

                gen.progress = Math.min(100, gen.progress + CONFIG.GENERATOR_REPAIR_RATE * (dt / 1000));
                drawBar(gen.barGfx, gen.bx, gen.by, gen.progress, 0xffee00);

                if (gen.progress >= 100) {
                    gen.repaired = true;
                    gen.progress = 100;
                    gen.setTint(0x22ff66);
                    if (gen.glowGfx) gen.glowGfx.setAlpha(0);
                    if (gen.lightGlowGfx) gen.lightGlowGfx.setAlpha(0);
                    if (gen.lightGlowInnerGfx) gen.lightGlowInnerGfx.setAlpha(0);
                    if (gen.lightSprite) gen.lightSprite.setAlpha(0.3);
                    // Hide progress bar when repair is complete
                    if (gen.barGfx) gen.barGfx.clear();
                    p.progressAction = null;
                    p.isRepairing = false;
                    p.isVulnerable = false;
                    if (p.repairSparks) p.repairSparks.setVisible(false);
                    // Reset to normal texture
                    sp.setTexture(p.tex);
                    UI.showToast('✅ Генератор починен!', 2000);
                    checkAllGens();

                    if (isMultiplayer && roomCode) {
                        updateGeneratorProgress(roomCode, gen.genId, 100, true);
                        clearPlayerAnimation(roomCode, playerId);
                    }
                }
                return true;
            }
        });
    }

    // Unhook survivor
    if (!acted) {
        hooks.some(hook => {
            if (!hook.occupied || !hook.hookedSurvivor) return false;
            const hs = hook.hookedSurvivor;
            if (hs === p) return false;
            if (dist(sp, hook) < CONFIG.INTERACT_DISTANCE) {
                acted = true;
                sp.body.setVelocity(0, 0);
                const isNewAction = !p.progressAction || p.progressAction.target !== hook;
                if (isNewAction) {
                    p.progressAction = { type: 'unhook', target: hook, pct: 0 };
                    if (isMultiplayer && roomCode && playerId) {
                        setPlayerAnimation(roomCode, playerId, 'unhook', hook.hookId);
                    }
                }
                p.progressAction.pct = Math.min(100, (p.progressAction.pct || 0) + CONFIG.UNHOOK_RATE * (dt / 1000));
                floatBars.push({ wx: hook.bx, wy: hook.by - 30, pct: p.progressAction.pct, color: 0x88aaff });

                if (p.progressAction.pct >= 100) {
                    hs.state = 'injured';
                    hs.isVulnerable = false;
                    hs.sprite.clearTint();
                    hs.sprite.setTexture(hs.tex);
                    hs.sprite.setPosition(hook.x + 30, hook.y);
                    hs.sprite.setVisible(true);
                    hook.occupied = false;
                    hook.hookedSurvivor = null;
                    hook.hookTimer = 0;
                    p.progressAction = null;
                    UI.showToast('🙌 Снят с крюка!', 2000);

                    if (isMultiplayer && roomCode && hs.playerId) {
                        unhookSurvivor(roomCode, hs.playerId);
                        clearPlayerAnimation(roomCode, playerId);
                    }
                }
                return true;
            }
        });
    }

    // Heal
    if (!acted) {
        (player.aiPlayers || []).some(ai => {
            if (ai.state !== 'injured') return false;
            if (dist(sp, ai.sprite) < CONFIG.INTERACT_DISTANCE) {
                acted = true;
                sp.body.setVelocity(0, 0);
                const isNewAction = !p.progressAction || p.progressAction.target !== ai;
                if (isNewAction) {
                    p.progressAction = { type: 'heal', target: ai, pct: 0 };
                    if (isMultiplayer && roomCode && playerId) {
                        setPlayerAnimation(roomCode, playerId, 'heal', ai.playerId);
                    }
                }
                p.progressAction.pct = Math.min(100, (p.progressAction.pct || 0) + CONFIG.HEAL_RATE * (dt / 1000));
                floatBars.push({ wx: ai.sprite.x, wy: ai.sprite.y - 42, pct: p.progressAction.pct, color: 0x44ff88 });

                if (p.progressAction.pct >= 100) {
                    ai.state = 'alive';
                    ai.isVulnerable = false;
                    ai.sprite.clearTint();
                    ai.sprite.setTexture(ai.tex);
                    p.progressAction = null;
                    UI.showToast('💊 Вылечен!', 2000);
                    
                    if (isMultiplayer && roomCode && playerId) {
                        clearPlayerAnimation(roomCode, playerId);
                    }
                }
                return true;
            }
        });
    }

    // Escape through opened gate
    const nearOpenedGate = exitOpen && gates.some(gate => gate.opened && dist(sp, gate) < 80);
    
    if (nearOpenedGate && !acted) {
        isNearGate = true;
        
        if (isEscapingGate) {
            gateEscapeProgress += dt / 1000;
            const pct = Math.min(100, (gateEscapeProgress / GATE_ESCAPE_TIME) * 100);
            
            // Animate: scale down, fade out
            const scale = 1 - (pct / 100) * 0.8;
            const alpha = 1 - (pct / 100) * 0.9;
            
            sp.setScale(scale);
            sp.setAlpha(alpha);
            
            // Show progress bar
            drawBar(floatBarGfx || scene.add.graphics(), sp.x, sp.y - 50, pct, 0x66ffaa);
            
            if (gateEscapeProgress >= GATE_ESCAPE_TIME) {
                p.state = 'escaped';
                UI.showToast('🏆 Ты сбежал через ворота!', 2000);
                
                if (isMultiplayer && roomCode && playerId) {
                    setPlayerEscaped(roomCode, playerId);
                }
                
                doEndGame(true, 'Ты сбежал через ворота!');
            }
            return;
        }
        
        // Show action button for gate escape
        updateActionButtonForGate(true);
        
        if (actionPressed && !isEscapingGate) {
            isEscapingGate = true;
            gateEscapeProgress = 0;
            sp.body.setVelocity(0, 0);
            UI.showToast('🚪 Пытаешься сбежать...', 1000);
            
            if (isMultiplayer && roomCode && playerId) {
                setPlayerAnimation(roomCode, playerId, 'escape_gate', 0);
            }
        }
        
        if (!actionPressed && !isEscapingGate) {
            updateActionButtonForGate(false);
        }
        
        return;
    } else {
        isNearGate = false;
        updateActionButtonForGate(false);
        
        if (isEscapingGate) {
            isEscapingGate = false;
            gateEscapeProgress = 0;
            sp.setScale(1);
            sp.setAlpha(1);
            if (isMultiplayer && roomCode && playerId) {
                clearPlayerAnimation(roomCode, playerId);
            }
        }
    }

    // Open gate
    if (!acted) {
        const repairedCount = generators.filter(g => g.repaired).length;
        if (repairedCount >= CONFIG.GENS_REQUIRED_FOR_EXIT) {
            gates.some(gate => {
                if (gate.opened || gate.isOpening) return false;
                if (dist(sp, gate) < CONFIG.INTERACT_DISTANCE + 30) {
                    acted = true;
                    sp.body.setVelocity(0, 0);
                    if (!p.progressAction || p.progressAction.target !== gate) {
                        p.progressAction = { type: 'gate', target: gate };
                        gate.isOpening = true;
                    }
                    gate.progress = Math.min(100, gate.progress + CONFIG.GATE_RATE * (dt / 1000));
                    drawBar(gate.barGfx, gate.bx, gate.by, gate.progress, 0x66ffaa);

                    // Animate gate opening - scale up and fade
                    const openPct = gate.progress / 100;
                    gate.setScale(1.8 + openPct * 0.5);
                    gate.setAlpha(1 - openPct * 0.5);

                    if (gate.progress >= 100) {
                        gate.opened = true;
                        gate.setTint(0x22ff66);
                        gate.setScale(2.3);
                        gate.setAlpha(0);
                        // Hide progress bar when gate opens
                        if (gate.barGfx) gate.barGfx.clear();
                        p.progressAction = null;
                        UI.showToast('🚪 Ворота открыты! Беги!', 2000);

                        if (isMultiplayer && roomCode) {
                            setGateOpened(roomCode, true);
                        }
                    }
                    return true;
                }
            });
        }
    }

    if (!acted) cancelProgress(p);
}

function cancelProgress(p) {
    // Reset gate opening state if player was opening gate
    if (p.progressAction && p.progressAction.type === 'gate' && p.progressAction.target) {
        p.progressAction.target.isOpening = false;
        p.progressAction.target.setScale(1.8);
        p.progressAction.target.setAlpha(1);
    }
    
    const hadAction = p.progressAction !== null;
    p.progressAction = null;
    p.isRepairing = false;
    p.isVulnerable = false;
    if (p.repairSparks) {
        p.repairSparks.setVisible(false);
    }
    if (p.tex && p.sprite) {
        p.sprite.setTexture(p.tex);
    }
    
    // Sync animation cancellation in multiplayer
    if (hadAction && isMultiplayer && roomCode && playerId) {
        clearPlayerAnimation(roomCode, playerId);
    }
}

function checkAllGens() {
    const done = generators.filter(g => g.repaired).length;
    if (done >= CONFIG.GENS_REQUIRED_FOR_EXIT && !exitOpen) {
        exitOpen = true;
        UI.showToast('⚡ Ворота можно открывать!', 3000);

        gates.forEach(gate => {
            gate.glowGfx = scene.add.graphics();
            gate.glowGfx.fillStyle(0x66ffaa, 0.25);
            gate.glowGfx.fillCircle(gate.x, gate.y, 60);
            gate.glowGfx.setDepth(gate.y - 1);
        });

        if (isMultiplayer && roomCode) {
            setGateOpened(roomCode, true);
        }
    }

    // Check if hatch should spawn (ALL 5 generators done OR only 1 survivor left)
    const allGensRepaired = done >= CONFIG.GENERATOR_COUNT;
    const onlyOneSurvivorLeft = getAliveSurvivorCount() === 1;
    
    if ((allGensRepaired || onlyOneSurvivorLeft) && !hatch) {
        spawnHatch();
    }
}

function getAliveSurvivorCount() {
    if (isKiller) {
        if (isMultiplayer) {
            return Object.values(remotePlayers).filter(rp => rp.role === 'survivor' && rp.state !== 'dead' && rp.state !== 'escaped').length;
        } else {
            return (player.aiPlayers || []).filter(a => a.state !== 'dead' && a.state !== 'escaped').length;
        }
    } else {
        if (isMultiplayer) {
            return (player.state !== 'dead' && player.state !== 'escaped' ? 1 : 0) + 
                   Object.values(remotePlayers).filter(rp => rp.role === 'survivor' && rp.state !== 'dead' && rp.state !== 'escaped').length;
        } else {
            return survivorsAlive;
        }
    }
}

function spawnHatch() {
    if (hatch) return;

    const hx = 400 + Math.random() * (2400 - 800);
    const hy = 400 + Math.random() * (1800 - 800);

    const glow = scene.add.graphics();
    glow.fillStyle(0xffaa00, 0.2);
    glow.fillCircle(hx, hy, 60);
    glow.setDepth(hy);

    hatch = scene.add.sprite(hx, hy, 'hatch').setDepth(hy + 1).setScale(1.5);
    hatch.setTint(0xffaa00);
    hatchOpen = true;
    hatchClosed = false;
    hatch.glowGfx = glow;

    const allGensRepaired = generators.filter(g => g.repaired).length >= CONFIG.GENERATOR_COUNT;
    if (allGensRepaired) {
        UI.showToast('🪤 Люк появился на карте!', 3000);
    } else {
        UI.showToast('🪤 Последний шанс - ищи люк!', 3000);
    }

    if (isMultiplayer && roomCode) {
        setHatchSpawned(roomCode, hx, hy);
    }
}

function closeHatchByKiller() {
    if (!hatch || hatchClosed) return;
    
    hatchClosed = true;
    hatchOpen = false;
    hatch.setTint(0xff4444);
    if (hatch.glowGfx) {
        hatch.glowGfx.clear();
        hatch.glowGfx.fillStyle(0xff0000, 0.3);
        hatch.glowGfx.fillCircle(hatch.x, hatch.y, 60);
    }
    
    UI.showToast('🔒 Ты закрыл люк!', 2000);
    
    if (isMultiplayer && roomCode) {
        closeHatch(roomCode);
    }
}

function updateHooks(dt) {
    hooks.forEach(hook => {
        if (!hook.occupied || !hook.hookedSurvivor) return;

        const p = hook.hookedSurvivor;
        p.sprite.setPosition(hook.x, hook.y - 12);
        
        // Make sure the texture is set to normal when on hook (not carried)
        if (p.sprite.texture.key.includes('_carried')) {
            p.sprite.setTexture(p.tex);
        }
        
        p.hookTimer += dt / 1000;

        const pct = 100 - (p.hookTimer / CONFIG.HOOK_TIME * 100);
        floatBars.push({ wx: hook.bx, wy: hook.by - 32, pct: Math.max(0, pct), color: 0xff4444 });

        if (p.hookTimer >= CONFIG.HOOK_TIME) {
            p.state = 'dead';
            p.sprite.setAlpha(0.15);
            hook.occupied = false;
            hook.hookedSurvivor = null;

            if (p.isMe) {
                doEndGame(false, 'Ты умер на крюке!');
            } else {
                survivorsAlive = Math.max(0, survivorsAlive - 1);
            }

            if (isMultiplayer && roomCode && p.playerId) {
                setPlayerDead(roomCode, p.playerId);
            }
        }
    });
}

function updateAI(dt) {
    (player.aiPlayers || []).forEach(ai => {
        const sp = ai.sprite;

        if (ai.state === 'dead' || ai.state === 'hooked') {
            sp.body.setVelocity(0, 0);
            return;
        }

        sp.setDepth(1000 + sp.y);
        
        // Fog hiding effect for AI survivors
        if (!ai.isAIKiller && scene && scene.fogPatches) {
            let fogDensity = 0;
            scene.fogPatches.forEach(patch => {
                const dx = sp.x - patch.x;
                const dy = sp.y - patch.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const maxDist = patch.width * 0.6;
                if (dist < maxDist) {
                    fogDensity += (1 - dist / maxDist) * patch.alpha;
                }
            });
            
            if (fogDensity > 0.3) {
                const fogAlpha = Math.min(0.6, fogDensity * 0.8);
                sp.setAlpha(0.4 + (1 - fogAlpha));
                if (!sp.tintTopLeft || sp.tintTopLeft === 0xffffff) {
                    sp.setTint(0x888899);
                }
            } else {
                sp.setAlpha(1);
                sp.clearTint();
            }
        }

        if (ai.isAIKiller) {
            // Initialize AI timers
            if (!ai.aiAttackCooldown) ai.aiAttackCooldown = 0;
            if (!ai.aiAttackInterval) ai.aiAttackInterval = 0.8 + Math.random() * 0.4;
            if (!ai.strikeTimer) ai.strikeTimer = 0;
            if (!ai.slowdownTimer) ai.slowdownTimer = 0;
            
            ai.aiAttackCooldown -= dt / 1000;

            const target = player;
            if (!target || target.state === 'dead' || target.state === 'carried') {
                moveTo(sp, target?.sprite?.x || 1200, target?.sprite?.y || 900, CONFIG.KILLER_SPEED);
                return;
            }

            const d = dist(sp, target.sprite);
            
            // Update AI killer slowdown
            let aiSpeed = CONFIG.KILLER_SPEED;
            if (ai.slowdownTimer > 0) {
                ai.slowdownTimer -= dt / 1000;
                aiSpeed = CONFIG.KILLER_SPEED * 0.5;
            }
            
            // Update AI killer strike animation
            if (ai.strikeTimer > 0) {
                ai.strikeTimer -= dt / 1000;
                if (!sp.texture.key.includes('killer_strike')) {
                    sp.setTexture('killer_strike');
                }
                if (ai.strikeTimer <= 0) {
                    sp.setTexture('killer');
                }
            }
            
            if (d < CONFIG.CATCH_DISTANCE) {
                // In range - try to attack
                sp.body.setVelocity(0, 0);
                
                if (ai.aiAttackCooldown <= 0) {
                    // Show attack animation
                    ai.strikeTimer = 0.3;
                    if (!sp.texture.key.includes('killer_strike')) {
                        sp.setTexture('killer_strike');
                    }
                    
                    const p2 = player;
                    
                    // If the AI killer was carrying someone, drop the carried survivor when hitting a player
                    if (ai.carryTarget) {
                        const droppedSurvivor = ai.carryTarget;
                        ai.carryTarget = null;
                        
                        droppedSurvivor.sprite.setScale(1, 1);
                        droppedSurvivor.sprite.setRotation(0);
                        droppedSurvivor._carryAnimTimer = 0;
                        droppedSurvivor._carryAnimPhase = 'idle';
                        droppedSurvivor._carryAnimDuration = 0;
                        droppedSurvivor._carryIdlePhase = 0;
                        if (droppedSurvivor.sprite.texture.key.includes('_carried')) {
                            droppedSurvivor.sprite.setTexture(droppedSurvivor.tex);
                        }
                    }
                    
                    if (p2.state === 'alive') {
                        // First hit - survivor becomes injured
                        p2.state = 'injured';
                        p2.isVulnerable = false;
                        p2.sprite.setTint(0xff8888);
                        // Survivor speeds up for 1 second
                        boostTimer = 1.0;
                        survivorSpeedBoost = 1.0;
                        // AI killer slows down for 2 seconds
                        ai.slowdownTimer = 2.0;
                        ai.aiAttackCooldown = 1.5;
                        ai.aiAttackInterval = 1.5 + Math.random() * 0.5;
                        UI.showToast('💥 Ты ранен!', 2000);
                    } else if (p2.state === 'injured') {
                        // Second hit - survivor falls to ground (dying state)
                        p2.state = 'dying';
                        p2.isVulnerable = false;
                        p2.sprite.setTint(0xff4444);
                        p2.progressAction = null;
                        p2.isRepairing = false;
                        if (p2.repairSparks) p2.repairSparks.setVisible(false);
                        p2.sprite.setScale(1, 1);
                        p2.sprite.setAlpha(1);
                        if (p2.sprite.texture.key.includes('_repair')) {
                            p2.sprite.setTexture(p2.tex);
                        }
                        // AI killer slows down for 1 second
                        ai.slowdownTimer = 1.0;
                        ai.aiAttackCooldown = 1.0;
                        ai.aiAttackInterval = 1.0 + Math.random() * 0.3;
                        UI.showToast('⬇️ Ты упал на землю!', 2000);
                    } else if (p2.state === 'dying') {
                        // Pick up dying survivor
                        ai.carryTarget = p2;
                        p2.state = 'carried';
                        p2.isVulnerable = false;
                        p2.sprite.setPosition(sp.x, sp.y - 28);
                        
                        if (!p2.sprite.texture.key.includes('_carried')) {
                            p2.sprite.setTexture(p2.tex + '_carried');
                        }
                        
                        ai.aiAttackCooldown = 0.8;
                        ai.aiAttackInterval = 0.8 + Math.random() * 0.4;
                        UI.showToast('💪 Тебя подняли!', 2000);
                    }
                }
            } else {
                // Out of range - move toward target
                moveTo(sp, target.sprite.x, target.sprite.y, aiSpeed);
                
                // AI attacks periodically when moving (like player pressing attack button)
                ai.aiAttackInterval -= dt / 1000;
                if (ai.aiAttackInterval <= 0 && ai.aiAttackCooldown <= 0 && ai.strikeTimer <= 0) {
                    // Show attack animation even when missing (swing in the air)
                    ai.strikeTimer = 0.3;
                    if (!sp.texture.key.includes('killer_strike')) {
                        sp.setTexture('killer_strike');
                    }
                    ai.aiAttackCooldown = 0.3;
                    ai.aiAttackInterval = 0.8 + Math.random() * 0.4;
                }
                
                // If AI killer is carrying someone, update position
                if (ai.carryTarget) {
                    const ct = ai.carryTarget;
                    ct.sprite.setPosition(sp.x, sp.y - 28);
                    
                    if (!ct.sprite.texture.key.includes('_carried')) {
                        ct.sprite.setTexture(ct.tex + '_carried');
                    }
                    
                    // Occasional animation when being carried
                    if (!ct._carryAnimTimer) ct._carryAnimTimer = 0;
                    if (!ct._carryAnimPhase) ct._carryAnimPhase = 'idle';
                    if (!ct._carryAnimDuration) ct._carryAnimDuration = 0;
                    
                    ct._carryAnimTimer += dt;
                    
                    if (ct._carryAnimTimer > ct._carryAnimDuration) {
                        const rand = Math.random();
                        if (rand < 0.3) {
                            ct._carryAnimPhase = 'arms_up';
                            ct._carryAnimDuration = 300 + Math.random() * 400;
                        } else if (rand < 0.5) {
                            ct._carryAnimPhase = 'legs_flex';
                            ct._carryAnimDuration = 400 + Math.random() * 500;
                        } else {
                            ct._carryAnimPhase = 'idle';
                            ct._carryAnimDuration = 800 + Math.random() * 1200;
                        }
                        ct._carryAnimTimer = 0;
                    }
                    
                    if (ct._carryAnimPhase === 'arms_up') {
                        ct.sprite.setScale(1, 1);
                        ct.sprite.setRotation(0);
                    } else if (ct._carryAnimPhase === 'legs_flex') {
                        ct.sprite.setScale(1, 1);
                        ct.sprite.setRotation(0);
                    } else {
                        ct.sprite.setScale(1, 1);
                        ct.sprite.setRotation(0);
                    }
                    
                    // AI killer auto-moves to nearest hook
                    const hook = nearestFreeHook(sp);
                    if (hook && dist(sp, hook) < CONFIG.INTERACT_DISTANCE + 20) {
                        if (!ai._hookDelay) ai._hookDelay = 0;
                        ai._hookDelay += dt / 1000;
                        
                        if (ai._hookDelay >= 0.5) {
                            hangSurvivor(ct, hook);
                            ai.carryTarget = null;
                            ai._hookDelay = 0;
                            
                            // Reset scale and rotation when dropping survivor
                            ct.sprite.setScale(1, 1);
                            ct.sprite.setRotation(0);
                            ct._carryAnimTimer = 0;
                            ct._carryAnimPhase = 'idle';
                            
                            UI.showToast('🪝 Тебя повесили!', 2000);
                        }
                    } else {
                        ai._hookDelay = 0;
                        if (hook) {
                            moveTo(sp, hook.x, hook.y, CONFIG.KILLER_SPEED * 0.7);
                        }
                    }
                }
                
                // AI killer tries to close hatch if nearby
                if (hatch && !hatchClosed && dist(sp, hatch) < CONFIG.INTERACT_DISTANCE + 20) {
                    if (!ai._hatchCloseDelay) ai._hatchCloseDelay = 0;
                    ai._hatchCloseDelay += dt / 1000;
                    
                    if (ai._hatchCloseDelay >= 0.5) {
                        closeHatchByKiller();
                        ai._hatchCloseDelay = 0;
                    }
                } else {
                    ai._hatchCloseDelay = 0;
                }
            }
        } else {
            ai.aiTimer = (ai.aiTimer || 0) - dt / 1000;
            if (ai.aiTimer <= 0) {
                ai.aiTimer = 0.8 + Math.random() * 2;
                const ang = Math.random() * Math.PI * 2;
                ai.aiDir = { x: Math.cos(ang), y: Math.sin(ang) };
            }

            if (player && player.role === 'killer') {
                const dk = dist(sp, player.sprite);
                if (dk < 180) {
                    const ak = Math.atan2(sp.y - player.sprite.y, sp.x - player.sprite.x);
                    ai.aiDir = { x: Math.cos(ak), y: Math.sin(ak) };
                    ai.aiTimer = 1.2;
                }
            }

            const as = ai.state === 'dying' ? CONFIG.DYING_SPEED :
                ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED;
            sp.body.setVelocity(ai.aiDir.x * as, ai.aiDir.y * as);

            // Rotate sprite based on movement direction only when dying (crawling on ground)
            if (ai.state === 'dying' && (ai.aiDir.x !== 0 || ai.aiDir.y !== 0)) {
                const targetAngle = Math.atan2(ai.aiDir.y, ai.aiDir.x) * (180 / Math.PI);
                let currentAngle = sp.rotation * (180 / Math.PI);
                let diff = targetAngle - currentAngle;
                while (diff > 180) diff -= 360;
                while (diff < -180) diff += 360;
                sp.rotation += (diff * 0.15) * (Math.PI / 180);
            }

            // Update dying texture for AI survivors - no scale distortion
            if (ai.state === 'dying') {
                if (!sp.texture.key.includes('_dying')) {
                    sp.setTexture(getTexWithFallback(ai.tex, '_dying'));
                }
                sp.setScale(1, 1);
            } else if (sp.texture.key.includes('_dying')) {
                sp.setTexture(ai.tex);
                sp.setScale(1, 1);
            } else if (sp.texture.key.includes('_carried')) {
                // If AI survivor is no longer being carried, reset to normal texture
                sp.setTexture(ai.tex);
                sp.setScale(1, 1);
            }
        }
    });
}

function updateHUD() {
    const p = player;
    const genCount = generators.filter(g => g.repaired).length;

    let aliveCount;
    if (isKiller) {
        if (isMultiplayer) {
            // Count real survivors from remotePlayers (not dead, not escaped)
            aliveCount = Object.values(remotePlayers).filter(rp => rp.role === 'survivor' && rp.state !== 'dead' && rp.state !== 'escaped').length;
        } else {
            aliveCount = (player.aiPlayers || []).filter(a => a.state !== 'dead' && a.state !== 'escaped').length;
        }
    } else {
        if (isMultiplayer) {
            // Count real survivors (self + remote players, not dead, not escaped)
            aliveCount = (player.state !== 'dead' && player.state !== 'escaped' ? 1 : 0) + 
                         Object.values(remotePlayers).filter(rp => rp.role === 'survivor' && rp.state !== 'dead' && rp.state !== 'escaped').length;
        } else {
            aliveCount = survivorsAlive;
        }
    }

    UI.updateHUD(
        p.role,
        p.state,
        genCount,
        exitOpen,
        hatchOpen && !hatchClosed,
        aliveCount
    );
}

function checkWinLose() {
    if (gameEnded) return;

    if (isKiller) {
        let allEliminated = false;
        if (isMultiplayer) {
            // All real survivors must be dead or escaped for killer to win
            const survivors = Object.values(remotePlayers).filter(rp => rp.role === 'survivor');
            allEliminated = survivors.length > 0 && survivors.every(rp => rp.state === 'dead' || rp.state === 'escaped');
        } else {
            allEliminated = (player.aiPlayers || []).filter(a => a.state !== 'dead' && a.state !== 'escaped').length === 0;
        }
        if (allEliminated) {
            doEndGame(true, 'Ты поймал всех выживших!');
        }
    } else {
        if (player.state === 'dead') {
            doEndGame(false, 'Тебя поймали!');
        }

        if (player.state === 'alive' || player.state === 'injured') {
            if (exitOpen) {
                gates.forEach(gate => {
                    if (gate.opened && dist(player.sprite, gate) < 80) {
                        doEndGame(true, 'Ты сбежал через ворота!');
                    }
                });
            }
        }
    }
}

function doEndGame(won, msg) {
    if (gameEnded) return;
    gameEnded = true;
    isCarryingNearHook = false;
    updateActionButton(false);

    // Reset any carried state when game ends
    if (player && player.carryTarget) {
        const carried = player.carryTarget;
        if (carried && carried.sprite) {
            carried.sprite.setScale(1, 1);
            if (carried.sprite.texture.key.includes('_carried')) {
                carried.sprite.setTexture(carried.tex);
            }
        }
        player.carryTarget = null;
    }

    if (isMultiplayer && roomCode) {
        setGameResult(roomCode, won ? (isKiller ? 'killer' : 'survivors') : (isKiller ? 'survivors' : 'killer'), msg);
    }

    setTimeout(() => {
        stopGame();
        UI.showGameOver(won, msg);
    }, 600);
}

// ═══════ MULTIPLAYER SYNC ═══════

function initMultiplayerSync() {
    console.log('[MP] initMultiplayerSync started');
    if (!roomCode || !playerId) {
        console.log('[MP] ABORT: no roomCode or playerId', roomCode, playerId);
        return;
    }

    try {
        // Set initial player state
        const initialData = {
            x: player.sprite.x,
            y: player.sprite.y,
            role: player.role,
            state: player.state,
            health: player.health
        };
        console.log('[MP] initialData:', initialData);

        // Initialize generators in DB
        console.log('[MP] calling initializeGenerators...');
        initializeGenerators(roomCode);
        console.log('[MP] initializeGenerators done');

        // Initialize crows in DB (only if not already initialized)
        console.log('[MP] calling initializeCrows...');
        initializeCrows(roomCode, scene.crows ? scene.crows.length : 8);
        console.log('[MP] initializeCrows done');

        // Subscribe to game session
        console.log('[MP] calling subscribeToGameSession...');
        subscribeToGameSession(roomCode, {
            onPlayersUpdate: (players) => {
                console.log('[MP] onPlayersUpdate', Object.keys(players));
                updateRemotePlayers(players);
            },
            onGeneratorsUpdate: (gens) => {
                console.log('[MP] onGeneratorsUpdate', gens);
                updateGeneratorsFromServer(gens);
            },
            onCrowsUpdate: (crowsData) => {
                console.log('[MP] onCrowsUpdate');
                updateCrowsFromServer(crowsData);
            },
            onGateUpdate: (gate) => {
                console.log('[MP] onGateUpdate', gate);
                if (gate.opened && !exitOpen) {
                    exitOpen = true;
                    UI.showToast('⚡ Ворота открыты!', 2000);
                }
            },
            onHatchUpdate: (hatchData) => {
                console.log('[MP] onHatchUpdate', hatchData);
                if (hatchData.spawned && !hatch) {
                    const glow = scene.add.graphics();
                    glow.fillStyle(0xffaa00, 0.2);
                    glow.fillCircle(hatchData.x, hatchData.y, 60);
                    glow.setDepth(hatchData.y);

                    hatch = scene.add.sprite(hatchData.x, hatchData.y, 'hatch').setDepth(hatchData.y + 1).setScale(1.5);
                    hatch.setTint(0xffaa00);
                    hatchOpen = !hatchData.closedByKiller;
                    hatchClosed = hatchData.closedByKiller;
                    hatch.glowGfx = glow;
                } else if (hatchData.closedByKiller && !hatchClosed) {
                    hatchClosed = true;
                    hatchOpen = false;
                    if (hatch) {
                        hatch.setTint(0xff4444);
                        if (hatch.glowGfx) {
                            hatch.glowGfx.clear();
                            hatch.glowGfx.fillStyle(0xff0000, 0.3);
                            hatch.glowGfx.fillCircle(hatch.x, hatch.y, 60);
                        }
                    }
                }
            },
            onKillerStun: () => {
                console.log('[MP] onKillerStun');
                if (!isKiller) {
                    killerStun = CONFIG.STUN_TIME;
                    UI.showToast('💥 Убийца оглушён доской!', 1500);
                }
            },
            onPalletsUpdate: (palletsData) => {
                console.log('[MP] onPalletsUpdate');
                updatePalletsFromServer(palletsData);
            },
            onStatusUpdate: (status) => {
                console.log('[MP] onStatusUpdate', status);
                if (status === 'finished') {
                    // Game over handled by onGameResult
                }
            },
            onGameResult: (winner, message) => {
                console.log('[MP] onGameResult', winner, message);
                const won = (winner === (isKiller ? 'killer' : 'survivors'));
                doEndGame(won, message);
            },
            onError: (error) => {
                console.error('[MP] Game session error:', error);
            }
        });
        console.log('[MP] subscribeToGameSession done');

        console.log('[MP] Multiplayer sync initialized for room:', roomCode);
    } catch (e) {
        console.error('[MP] ERROR in initMultiplayerSync:', e);
    }
}

function sendPositionUpdate() {
    if (!roomCode || !playerId || !player) {
        console.log('[MP] sendPositionUpdate skipped: roomCode:', roomCode, 'playerId:', playerId, 'player:', !!player);
        return;
    }

    const now = Date.now();
    if (now - lastPosUpdate < POS_UPDATE_INTERVAL) return;
    lastPosUpdate = now;

    console.log('[MP] Sending position:', playerId, 'pos:', Math.round(player.sprite.x), Math.round(player.sprite.y));
    sendPlayerPosition(roomCode, playerId, player.sprite.x, player.sprite.y);

    // Also update state
    updatePlayerState(roomCode, playerId, player.state);
    if (player.health !== undefined) {
        updatePlayerHealth(roomCode, playerId, player.health);
    }
}

// ═══════ Update crows from server (for multiplayer) ═══════
function updateCrowsFromServer(crowsData) {
    if (!scene || !scene.crows) return;
    
    // Only update if crows are controlled by server (not local)
    if (!scene.crowsServerSync) scene.crowsServerSync = true;
    
    Object.keys(crowsData).forEach((crowId, index) => {
        if (index >= scene.crows.length) return;
        
        const serverCrow = crowsData[crowId];
        const localCrow = scene.crows[index];
        
        if (!localCrow) return;
        
        // Update crow state from server
        localCrow.state = serverCrow.state;
        localCrow.targetX = serverCrow.targetX;
        localCrow.targetY = serverCrow.targetY;
        localCrow.flipX = serverCrow.flipX;
        
        // Smoothly interpolate position from server
        localCrow.serverX = serverCrow.x;
        localCrow.serverY = serverCrow.y;
        
        // Update landing spot if sitting
        if (serverCrow.state === 'sitting' && serverCrow.landingX && serverCrow.landingY) {
            localCrow.landingSpot = {
                x: serverCrow.landingX,
                y: serverCrow.landingY
            };
        }
        
        // Update texture based on state
        if (serverCrow.state === 'sitting' && !localCrow.sprite.texture.key.includes('sitting')) {
            localCrow.sprite.setTexture('crow_sitting');
        } else if (serverCrow.state === 'flying' && localCrow.sprite.texture.key.includes('sitting')) {
            localCrow.sprite.setTexture('crow');
        }
    });
}

function updatePalletsFromServer(palletsData) {
    if (!scene || !pallets) return;
    
    Object.keys(palletsData).forEach(palletId => {
        const serverPallet = palletsData[palletId];
        const localPallet = pallets.find(p => p.palletId === parseInt(palletId));
        
        if (!localPallet) return;
        
        // Update pallet state
        if (serverPallet.state !== localPallet.state) {
            if (serverPallet.state === 'fallen') {
                localPallet.state = 'fallen';
                localPallet.sprite.setTexture('pallet_falling');
                localPallet.breakTimer = 15;
            } else if (serverPallet.state === 'broken') {
                localPallet.state = 'broken';
                localPallet.sprite.setTexture('pallet_broken');
                localPallet.breakTimer = 2;
            }
        }
    });
}

// ═══════ Send crow updates to server ═══════
let lastCrowUpdate = 0;
const CROW_UPDATE_INTERVAL = 100; // Update every 100ms

function sendCrowUpdate() {
    if (!isMultiplayer || !roomCode || !scene || !scene.crows) return;
    
    const now = Date.now();
    if (now - lastCrowUpdate < CROW_UPDATE_INTERVAL) return;
    lastCrowUpdate = now;
    
    // Send current crow state to server
    updateCrows(roomCode, scene.crows);
}

function updateRemotePlayers(players) {
    if (!scene) return;

    console.log('[MP] updateRemotePlayers called, player count:', Object.keys(players).length, 'my playerId:', playerId);
    console.log('[MP] players:', JSON.stringify(Object.keys(players)));

    Object.keys(players).forEach(pid => {
        if (pid === playerId) return; // Skip self

        const pdata = players[pid];
        console.log('[MP] processing player:', pid, 'pdata:', pdata);

        if (remotePlayers[pid]) {
            // Update existing - store target position for interpolation
            const rp = remotePlayers[pid];
            rp.targetX = pdata.x;
            rp.targetY = pdata.y;
            rp.state = pdata.state || rp.state;
            rp.animation = pdata.animation || null;

            if (pdata.state === 'dead') {
                rp.sprite.setAlpha(0.3);
                rp.sprite.setVelocity(0, 0);
                // Reset killer strike texture
                if (rp.sprite.texture.key.includes('killer_strike')) {
                    rp.sprite.setTexture('killer');
                }
            } else if (pdata.state === 'dying') {
                // Show dying texture for remote players
                if (!rp.sprite.texture.key.includes('_dying') && rp.tex) {
                    rp.sprite.setTexture(getTexWithFallback(rp.tex, '_dying'));
                }
                rp.sprite.setTint(0xff4444);
                // Reset any repair animation
                if (rp.sprite.texture.key.includes('_repair') && rp.tex) {
                    rp.sprite.setTexture(getTexWithFallback(rp.tex, '_dying'));
                }
            } else if (pdata.state === 'injured') {
                rp.sprite.clearTint();
                if (rp.sprite.texture.key.includes('_dying') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                }
                if (rp.sprite.texture.key.includes('_repair') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                }
                if (rp.sprite.texture.key.includes('_carried') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                    rp.sprite.setScale(1, 1);
                    rp.sprite.setRotation(0);
                    rp._carryAnimTimer = 0;
                    rp._carryAnimPhase = 'idle';
                    rp._carryIdlePhase = 0;
                }
                rp.sprite.setTint(0xff8888);
            } else if (pdata.state === 'carrying') {
                // Killer is carrying someone - move toward hook (slower when carrying)
                const hook = nearestFreeHookById(pdata.hookTarget);
                if (hook) {
                    moveTo(rp.sprite, hook.x, hook.y, CONFIG.KILLER_SPEED * 0.7);
                    if (dist(rp.sprite, hook) < CONFIG.INTERACT_DISTANCE + 20) {
                        rp.sprite.setVelocity(0, 0);
                    }
                }
                // Find and position carried player
                if (pdata.carryingId) {
                    const carriedPlayer = Object.values(remotePlayers).find(p => p.playerId === pdata.carryingId);
                    if (carriedPlayer) {
                        carriedPlayer.sprite.setPosition(pdata.x, pdata.y - 28);
                        if (!carriedPlayer.sprite.texture.key.includes('_carried')) {
                            carriedPlayer.sprite.setTexture(getTexWithFallback(carriedPlayer.tex, '_carried'));
                        }
                        carriedPlayer.sprite.setVelocity(0, 0);
                    }
                }
            } else if (pdata.state === 'carried') {
                // Show carried texture for remote players who are being carried
                if (!rp.sprite.texture.key.includes('_carried') && rp.tex) {
                    rp.sprite.setTexture(getTexWithFallback(rp.tex, '_carried'));
                }
                rp.sprite.setVelocity(0, 0);
                
                // Occasional animation when being carried
                if (!rp._carryAnimTimer) rp._carryAnimTimer = 0;
                if (!rp._carryAnimPhase) rp._carryAnimPhase = 'idle';
                if (!rp._carryAnimDuration) rp._carryAnimDuration = 0;
                
                rp._carryAnimTimer += 16; // Approximate frame time
                
                if (rp._carryAnimTimer > rp._carryAnimDuration) {
                    const rand = Math.random();
                    if (rand < 0.3) {
                        rp._carryAnimPhase = 'arms_up';
                        rp._carryAnimDuration = 300 + Math.random() * 400;
                    } else if (rand < 0.5) {
                        rp._carryAnimPhase = 'legs_flex';
                        rp._carryAnimDuration = 400 + Math.random() * 500;
                    } else {
                        rp._carryAnimPhase = 'idle';
                        rp._carryAnimDuration = 800 + Math.random() * 1200;
                    }
                    rp._carryAnimTimer = 0;
                }
                
                if (rp._carryAnimPhase === 'arms_up') {
                    rp.sprite.setScale(1, 1);
                    rp.sprite.setRotation(0);
                } else if (rp._carryAnimPhase === 'legs_flex') {
                    rp.sprite.setScale(1, 1);
                    rp.sprite.setRotation(0);
                } else {
                    rp.sprite.setScale(1, 1);
                    rp.sprite.setRotation(0);
                }
            } else if (pdata.state === 'hooked') {
                // Find hook and position - no interpolation for hooked players
                const hook = hooks.find(h => h.hookId === pdata.hookId);
                if (hook) {
                    rp.sprite.setPosition(hook.x, hook.y - 12);
                    rp.targetX = hook.x;
                    rp.targetY = hook.y - 12;
                    rp.sprite.setVelocity(0, 0);
                }
                // Reset textures
                if (rp.sprite.texture.key.includes('_carried') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                    rp.sprite.setScale(1, 1);
                    rp.sprite.setRotation(0);
                    rp._carryAnimTimer = 0;
                    rp._carryAnimPhase = 'idle';
                    rp._carryIdlePhase = 0;
                }
            } else if (pdata.state === 'alive' || pdata.state === 'injured') {
                // Handle repair animation
                if (pdata.animation === 'repair' && pdata.animationTarget !== undefined) {
                    const gen = generators.find(g => g.genId == pdata.animationTarget);
                    if (gen) {
                        if (!rp.sprite.texture.key.includes('_repair') && rp.tex) {
                            rp.sprite.setTexture(getTexWithFallback(rp.tex, '_repair'));
                        }
                        rp.sprite.setVelocity(0, 0);
                    }
                } else if (rp.sprite.texture.key.includes('_repair') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                }
                
                // Reset dying/carried textures
                if (rp.sprite.texture.key.includes('_dying') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                } else if (rp.sprite.texture.key.includes('_carried') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                    rp.sprite.setScale(1, 1);
                }
                
                // Handle killer strike animation
                if (rp.role === 'killer') {
                    if (pdata.isStriking) {
                        if (!rp.sprite.texture.key.includes('killer_strike')) {
                            rp.sprite.setTexture('killer_strike');
                        }
                    } else if (rp.sprite.texture.key.includes('killer_strike')) {
                        rp.sprite.setTexture('killer');
                    }
                }
                
                // Clear tint for alive state, set tint for injured
                if (pdata.state === 'alive') {
                    rp.sprite.clearTint();
                    // Reset rotation if coming from carried state
                    if (rp._carryAnimTimer !== undefined) {
                        rp.sprite.setRotation(0);
                        rp.sprite.setScale(1, 1);
                        rp._carryAnimTimer = 0;
                        rp._carryAnimPhase = 'idle';
                        rp._carryIdlePhase = 0;
                    }
                } else {
                    rp.sprite.setTint(0xff8888);
                }
            }
        } else {
            // Create new remote player
            console.log('[MP] Creating remote player:', pid, 'role:', pdata.role, 'pos:', pdata.x, pdata.y);
            let tex = pdata.role === 'killer' ? 'killer' : 's1';
            let initialState = pdata.state || 'alive';
            
            // Set appropriate texture based on state
            if (initialState === 'dying' && tex !== 'killer') {
                tex = tex + '_dying';
            } else if (initialState === 'carried' && tex !== 'killer') {
                tex = tex + '_carried';
            } else if (initialState === 'repair' && pdata.animationTarget !== undefined && tex !== 'killer') {
                tex = tex + '_repair';
            } else if (pdata.role === 'killer' && pdata.isStriking) {
                tex = 'killer_strike';
            }
            
            const sp = scene.add.sprite(pdata.x || 1200, pdata.y || 900, tex);
            sp.setDepth(1000 + (pdata.y || 900));
            scene.physics.add.existing(sp);
            sp.body.setCollideWorldBounds(true);
            sp.body.setSize(24, 28, true);
            
            // Set alpha for dead players
            if (initialState === 'dead') {
                sp.setAlpha(0.3);
            }
            
            // Set tint for injured/dying players
            if (initialState === 'injured') {
                sp.setTint(0xff8888);
            } else if (initialState === 'dying') {
                sp.setTint(0xff4444);
            }

            const glow = scene.add.graphics();
            glow.fillStyle(pdata.role === 'killer' ? 0x333333 : 0x44aaff, 0.15);
            glow.fillCircle(0, 0, 25);
            glow.setDepth(999);

            remotePlayers[pid] = {
                sprite: sp,
                glowFx: glow,
                tex: pdata.role === 'killer' ? 'killer' : 's1',
                role: pdata.role,
                state: pdata.state || 'alive',
                playerId: pid,
                targetX: pdata.x || 1200,
                targetY: pdata.y || 900,
                animation: pdata.animation || null
            };
        }
    });

    // Remove disconnected players
    Object.keys(remotePlayers).forEach(pid => {
        if (!players[pid]) {
            const rp = remotePlayers[pid];
            if (rp && rp.sprite) {
                rp.sprite.destroy();
            }
            if (rp && rp.glowFx) {
                rp.glowFx.destroy();
            }
            delete remotePlayers[pid];
        }
    });

    // Update survivors count for killer
    if (isKiller) {
        survivorsAlive = Object.values(players).filter(p => p.role === 'survivor' && p.state !== 'dead').length;
    }
}

function updateGeneratorsFromServer(gens) {
    if (!scene) return;

    Object.keys(gens).forEach(id => {
        const gdata = gens[id];
        const gen = generators.find(g => g.genId == id);
        if (!gen) return;

        gen.progress = gdata.progress || 0;
        gen.repaired = gdata.repaired || false;

        if (gen.repaired) {
            gen.progress = 100;
            if (!gen.getTint() || gen.getTint() === 0xffffff) {
                gen.setTint(0x22ff66);
            }
            if (gen.glowGfx) gen.glowGfx.setAlpha(0);
            if (gen.lightGlowGfx) gen.lightGlowGfx.setAlpha(0);
            if (gen.lightGlowInnerGfx) gen.lightGlowInnerGfx.setAlpha(0);
            if (gen.lightSprite) gen.lightSprite.setAlpha(0.3);
            // Hide progress bar for repaired generators
            if (gen.barGfx) gen.barGfx.clear();
        } else if (gen.progress > 0) {
            drawBar(gen.barGfx, gen.bx, gen.by, gen.progress, 0xffee00);
        } else {
            if (gen.barGfx) gen.barGfx.clear();
        }
    });
}

function interpolateRemotePlayers(dt) {
    if (!scene) return;

    const lerpFactor = 1 - Math.pow(1 - POS_LERP_SPEED, dt / 16.67);

    Object.values(remotePlayers).forEach(rp => {
        console.log('[MP] interpolateRemotePlayers:', rp.playerId, 'targetX:', rp.targetX, 'targetY:', rp.targetY, 'sprite.x:', rp.sprite.x, 'sprite.y:', rp.sprite.y);
        if (rp.targetX === undefined || rp.targetY === undefined) return;
        if (rp.state === 'dead' || rp.state === 'hooked') return;

        const dx = rp.targetX - rp.sprite.x;
        const dy = rp.targetY - rp.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Snap if very close to avoid drifting
        if (dist < 1) {
            rp.sprite.x = rp.targetX;
            rp.sprite.y = rp.targetY;
        } else {
            rp.sprite.x += dx * lerpFactor;
            rp.sprite.y += dy * lerpFactor;

            // Rotate sprite based on movement direction only when dying (crawling on ground)
            if (rp.state === 'dying') {
                const targetAngle = Math.atan2(dy, dx) * (180 / Math.PI);
                let currentAngle = rp.sprite.rotation * (180 / Math.PI);
                let diff = targetAngle - currentAngle;
                while (diff > 180) diff -= 360;
                while (diff < -180) diff += 360;
                rp.sprite.rotation += (diff * 0.2) * (Math.PI / 180);
            }
        }
        
        // Fog hiding effect for remote survivors
        if (rp.role === 'survivor' && scene && scene.fogPatches) {
            let fogDensity = 0;
            scene.fogPatches.forEach(patch => {
                const fdx = rp.sprite.x - patch.x;
                const fdy = rp.sprite.y - patch.y;
                const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
                const maxDist = patch.width * 0.6;
                if (fdist < maxDist) {
                    fogDensity += (1 - fdist / maxDist) * patch.alpha;
                }
            });
            
            if (fogDensity > 0.3) {
                const fogAlpha = Math.min(0.6, fogDensity * 0.8);
                rp.sprite.setAlpha(0.4 + (1 - fogAlpha));
                if (!rp.sprite.tintTopLeft || rp.sprite.tintTopLeft === 0xffffff) {
                    rp.sprite.setTint(0x888899);
                }
            } else {
                rp.sprite.setAlpha(1);
                rp.sprite.clearTint();
            }
        }

        // Update glow position
        if (rp.glowFx) {
            rp.glowFx.setPosition(rp.sprite.x, rp.sprite.y);
        }

        // Crawling animation for dying state - keep scale normal
        if (rp.state === 'dying') {
            rp.sprite.setScale(1, 1);
            rp._crawlPhase = 0;
        } else if (rp.state === 'carried') {
            // Occasional animation when being carried
            if (!rp._carryAnimTimer) rp._carryAnimTimer = 0;
            if (!rp._carryAnimPhase) rp._carryAnimPhase = 'idle';
            if (!rp._carryAnimDuration) rp._carryAnimDuration = 0;
            
            rp._carryAnimTimer += dt;
            
            if (rp._carryAnimTimer > rp._carryAnimDuration) {
                const rand = Math.random();
                if (rand < 0.3) {
                    rp._carryAnimPhase = 'arms_up';
                    rp._carryAnimDuration = 300 + Math.random() * 400;
                } else if (rand < 0.5) {
                    rp._carryAnimPhase = 'legs_flex';
                    rp._carryAnimDuration = 400 + Math.random() * 500;
                } else {
                    rp._carryAnimPhase = 'idle';
                    rp._carryAnimDuration = 800 + Math.random() * 1200;
                }
                rp._carryAnimTimer = 0;
            }
            
            if (rp._carryAnimPhase === 'arms_up') {
                const progress = rp._carryAnimTimer / rp._carryAnimDuration;
                const armWave = Math.sin(progress * Math.PI) * 0.15;
                rp.sprite.setScale(1 + armWave, 1 - armWave * 0.5);
                rp.sprite.setRotation(0);
            } else if (rp._carryAnimPhase === 'legs_flex') {
                const progress = rp._carryAnimTimer / rp._carryAnimDuration;
                const legFlex = Math.sin(progress * Math.PI) * 0.1;
                rp.sprite.setScale(1 - legFlex * 0.3, 1 + legFlex * 0.5);
                rp.sprite.setRotation(0);
            } else {
                if (!rp._carryIdlePhase) rp._carryIdlePhase = 0;
                rp._carryIdlePhase += dt * 0.002;
                const idleSway = Math.sin(rp._carryIdlePhase) * 0.02;
                rp.sprite.setRotation(idleSway);
                rp.sprite.setScale(1, 1);
            }
        } else {
            rp.sprite.setScale(1, 1);
        }

        // Update sprite depth
        rp.sprite.setDepth(1000 + rp.sprite.y);
    });
}

// ═══════ HELPERS ═══════

function dist(a, b) {
    const ax = a.x || 0, ay = a.y || 0;
    const bx = b.x || 0, by = b.y || 0;
    return Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by));
}

function normalize(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    if (len < 0.01) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
}

function moveTo(sp, tx, ty, spd) {
    const dx = tx - sp.x, dy = ty - sp.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 2) {
        sp.body.setVelocity(0, 0);
        return;
    }
    sp.body.setVelocity((dx / d) * spd, (dy / d) * spd);
}

function nearestAliveTarget(sp, maxD) {
    let best = null, bd = maxD;
    let pool = [];

    if (isMultiplayer && isKiller) {
        // In multiplayer, target real survivors from remotePlayers
        pool = Object.values(remotePlayers).filter(rp => rp.role === 'survivor' && rp.state !== 'dead');
    } else if (isKiller) {
        pool = (player.aiPlayers || []).filter(a => a.state !== 'dead');
    } else {
        // Survivor targets the AI killer (singleplayer only)
        pool = (player.aiPlayers || []).filter(a => a.isAIKiller);
    }

    pool.forEach(target => {
        if (!target || target.state === 'dead') return;
        const d = dist(sp, target.sprite);
        if (d < bd) {
            bd = d;
            best = target.sprite;
        }
    });

    return best;
}

function nearestFreeHook(sp) {
    let best = null, bd = 9999;
    hooks.forEach(h => {
        if (h.occupied) return;
        const d = dist(sp, h);
        if (d < bd) {
            bd = d;
            best = h;
        }
    });
    return best;
}

function nearestFreeHookById(hookId) {
    if (hookId === undefined || hookId === null) return nearestFreeHook({ x: 0, y: 0 });
    return hooks.find(h => h.hookId === hookId) || null;
}

function hangSurvivor(p, hook) {
    hook.occupied = true;
    hook.hookedSurvivor = p;
    p.hookTimer = 0;
    p.state = 'hooked';
    p.sprite.setTint(0xaaaaaa);
    
    // Reset to normal texture if it was carried
    if (p.sprite.texture.key.includes('_carried')) {
        p.sprite.setTexture(p.tex);
        // Reset scale and rotation from carry animation
        p.sprite.setScale(1, 1);
        p.sprite.setRotation(0);
        p._carryAnimTimer = 0;
        p._carryAnimPhase = 'idle';
        p._carryAnimDuration = 0;
        p._carryIdlePhase = 0;
    } else {
        p.sprite.setTexture(p.tex);
    }
    
    p.sprite.setPosition(hook.x, hook.y - 12);

    if (!p.isMe) {
        survivorsAlive = Math.max(0, survivorsAlive - 1);
    }
}

function drawBar(gfx, bx, by, pct, color) {
    gfx.clear();
    pct = Math.max(0, Math.min(100, pct));
    gfx.fillStyle(0x000000, 0.75);
    gfx.fillRect(bx - 25, by - 30, 50, 8);
    gfx.fillStyle(color, 1);
    gfx.fillRect(bx - 24, by - 29, 48 * (pct / 100), 6);
}

function flushFloatBars() {
    if (!floatBarGfx) return;
    floatBarGfx.clear();
    floatBars.forEach(b => {
        const pct = Math.max(0, Math.min(100, b.pct));
        floatBarGfx.fillStyle(0x000000, 0.75);
        floatBarGfx.fillRect(b.wx - 25, b.wy, 50, 8);
        floatBarGfx.fillStyle(b.color, 1);
        floatBarGfx.fillRect(b.wx - 24, b.wy + 1, 48 * (pct / 100), 6);
    });
    floatBars = [];
}

// ═══════ CONTROLS ═══════

function createControls() {
    removeControls();

    // Joystick
    const joy = document.createElement('div');
    joy.id = 'joystick-zone';
    joy.style.cssText = 'position:fixed;bottom:28px;left:28px;width:114px;height:114px;z-index:99999;touch-action:none;';
    joy.innerHTML = '<div id="joy-base" style="width:100%;height:100%;background:rgba(255,255,255,0.12);border:3px solid rgba(255,255,255,0.3);border-radius:50%;position:relative;"><div id="joy-knob" style="width:46px;height:46px;background:rgba(220,50,50,0.88);border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);box-shadow:0 0 10px rgba(220,50,50,0.5);"></div></div>';
    document.body.appendChild(joy);

    // Action button
    const ab = document.createElement('div');
    ab.id = 'action-btn';
    ab.textContent = '⚡';
    ab.style.cssText = 'position:fixed;bottom:48px;right:28px;width:82px;height:82px;border-radius:50%;background:linear-gradient(135deg,#ff6600,#cc2200);border:3px solid rgba(255,255,255,0.4);color:#fff;font-size:30px;font-weight:bold;display:flex;align-items:center;justify-content:center;z-index:99999;touch-action:none;box-shadow:0 0 16px rgba(255,80,0,0.5);';
    document.body.appendChild(ab);

    const jbase = document.getElementById('joy-base');
    const knob = document.getElementById('joy-knob');
    const maxD = 44;
    let tid = null, touching = false;

    function updateJoy(cx, cy) {
        const r = jbase.getBoundingClientRect();
        const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
        const d = Math.sqrt(dx * dx + dy * dy), lim = Math.min(d, maxD);
        const ang = Math.atan2(dy, dx);
        const nx = (lim / maxD) * Math.cos(ang), ny = (lim / maxD) * Math.sin(ang);
        knob.style.transform = 'translate(calc(-50% + ' + (nx * maxD) + 'px), calc(-50% + ' + (ny * maxD) + 'px))';
        inputVec.x = nx;
        inputVec.y = ny;
    }

    function resetJoy() {
        touching = false;
        tid = null;
        inputVec.x = 0;
        inputVec.y = 0;
        knob.style.transform = 'translate(-50%,-50%)';
    }

    joy.addEventListener('touchstart', function (e) {
        e.preventDefault();
        touching = true;
        tid = e.changedTouches[0].identifier;
        updateJoy(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    joy.addEventListener('touchmove', function (e) {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === tid) {
                updateJoy(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
                break;
            }
        }
    }, { passive: false });

    joy.addEventListener('touchend', resetJoy);
    joy.addEventListener('touchcancel', resetJoy);

    joy.addEventListener('mousedown', function (e) {
        touching = true;
        updateJoy(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', function (e) {
        if (touching) updateJoy(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', function () {
        if (touching) resetJoy();
    });

    ab.addEventListener('touchstart', function (e) {
        e.preventDefault();
        actionPressed = true;
        ab.style.transform = 'scale(0.92)';
    }, { passive: false });

    ab.addEventListener('touchend', function (e) {
        e.preventDefault();
        actionPressed = false;
        ab.style.transform = 'scale(1)';
    });

    ab.addEventListener('touchcancel', function () {
        actionPressed = false;
        ab.style.transform = 'scale(1)';
    });

    ab.addEventListener('mousedown', function () {
        actionPressed = true;
        ab.style.transform = 'scale(0.92)';
    });

    ab.addEventListener('mouseup', function () {
        actionPressed = false;
        ab.style.transform = 'scale(1)';
    });

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
}

function onKey(e) {
    keys[e.code] = (e.type === 'keydown');
    inputVec.x = ((keys.ArrowRight || keys.KeyD) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA) ? 1 : 0);
    inputVec.y = ((keys.ArrowDown || keys.KeyS) ? 1 : 0) - ((keys.ArrowUp || keys.KeyW) ? 1 : 0);
    const len = Math.sqrt(inputVec.x * inputVec.x + inputVec.y * inputVec.y);
    if (len > 1) {
        inputVec.x /= len;
        inputVec.y /= len;
    }
    if (e.code === 'Space' || e.code === 'KeyE') actionPressed = (e.type === 'keydown');
}

function updateActionButton(forHook = false) {
    const ab = document.getElementById('action-btn');
    if (!ab) return;
    
    if (forHook) {
        ab.textContent = '🪝';
        ab.style.background = 'linear-gradient(135deg, #ff3333, #aa0000)';
        ab.style.boxShadow = '0 0 16px rgba(255,50,50,0.7)';
    } else {
        ab.textContent = '⚡';
        ab.style.background = 'linear-gradient(135deg,#ff6600,#cc2200)';
        ab.style.boxShadow = '0 0 16px rgba(255,80,0,0.5)';
    }
}

function updateActionButtonForHatch(forHatch = false) {
    const ab = document.getElementById('action-btn');
    if (!ab) return;
    
    if (forHatch) {
        ab.textContent = '🚪';
        ab.style.background = 'linear-gradient(135deg, #ffaa00, #cc8800)';
        ab.style.boxShadow = '0 0 16px rgba(255,170,0,0.7)';
    }
}

function updateActionButtonForGate(forGate = false) {
    const ab = document.getElementById('action-btn');
    if (!ab) return;
    
    if (forGate) {
        ab.textContent = '🚪';
        ab.style.background = 'linear-gradient(135deg, #44cc66, #22aa44)';
        ab.style.boxShadow = '0 0 16px rgba(68,204,102,0.7)';
    }
}

function removeControls() {
    const j = document.getElementById('joystick-zone');
    if (j) j.remove();
    const a = document.getElementById('action-btn');
    if (a) a.remove();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKey);
}

// ═══════ EXPORTS ═══════

window.Game = {
    start: startGame,
    stop: stopGame,
    CONFIG: CONFIG,
    UI: UI
};

window.UI = UI;

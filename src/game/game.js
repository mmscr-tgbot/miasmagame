// ═══════ GAME ENGINE WITH MULTIPLAYER SYNC ═══════

const CONFIG = {
    PLAYER_SPEED: 145,
    KILLER_SPEED: 162,
    INJURED_SPEED: 115,
    DYING_SPEED: 38,
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
let killerAttackCooldown = 0;
let actionPressed = false;
let inputVec = { x: 0, y: 0 };
let isCarryingNearHook = false;

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
    console.log('startGame called', {killerMode, multiplayer, code, pid});
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
    document.getElementById('game-container').innerHTML = '';

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
}

// ═══════ TEXTURE BUILDER ═══════

function preload() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Ground
    g.fillStyle(0x1a2610);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle(0x243515);
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 64, Math.random() * 64, 2, 4);
    g.fillStyle(0x2a4018);
    for (let i = 0; i < 25; i++) g.fillCircle(Math.random() * 64, Math.random() * 64, 1.5);
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

    // Brick wall tile - detailed DBD-style
    // Background mortar
    g.fillStyle(0x4a4a4a); g.fillRect(0, 0, 96, 48);
    // Brick variations for realism
    const brickColors = [0x8B4513, 0x7a3a10, 0x9a5520, 0x6B3008, 0x854015];
    // Row 1 - bottom
    for (let i = 0; i < 3; i++) {
        const c = brickColors[(i * 2) % brickColors.length];
        g.fillStyle(c); g.fillRect(2 + i * 32, 34, 30, 12);
        g.fillStyle(c + 0x111111); g.fillRect(2 + i * 32, 34, 30, 2);
        g.fillStyle(c - 0x111111); g.fillRect(2 + i * 32, 44, 30, 2);
    }
    // Mortar line
    g.fillStyle(0x3a3a3a); g.fillRect(0, 32, 96, 2);
    g.fillStyle(0x5a5a5a); g.fillRect(0, 32, 96, 1);
    // Row 2 - middle (offset)
    g.fillStyle(brickColors[1]); g.fillRect(-14, 17, 30, 13);
    g.fillStyle(brickColors[2]); g.fillRect(18, 17, 30, 13);
    g.fillStyle(brickColors[3]); g.fillRect(50, 17, 30, 13);
    g.fillStyle(brickColors[4]); g.fillRect(82, 17, 28, 13);
    g.fillStyle(0x3a3a3a); g.fillRect(0, 16, 96, 2);
    g.fillStyle(0x5a5a5a); g.fillRect(0, 16, 96, 1);
    // Row 3 - top
    for (let i = 0; i < 3; i++) {
        const c = brickColors[(i + 1) % brickColors.length];
        g.fillStyle(c); g.fillRect(2 + i * 32, 2, 30, 12);
        g.fillStyle(c + 0x111111); g.fillRect(2 + i * 32, 2, 30, 2);
        g.fillStyle(c - 0x111111); g.fillRect(2 + i * 32, 12, 30, 2);
    }
    g.fillStyle(0x3a3a3a); g.fillRect(0, 0, 96, 2);
    // Vertical mortar lines
    g.fillStyle(0x3a3a3a); g.fillRect(30, 0, 2, 16); g.fillRect(62, 0, 2, 16);
    g.fillStyle(0x3a3a3a); g.fillRect(14, 16, 2, 16); g.fillRect(46, 16, 2, 16); g.fillRect(78, 16, 2, 16);
    g.fillStyle(0x3a3a3a); g.fillRect(30, 32, 2, 16); g.fillRect(62, 32, 2, 16);
    // Random cracks and wear
    g.fillStyle(0x2a2a2a, 0.5); g.fillRect(10, 36, 8, 1); g.fillRect(50, 38, 12, 1);
    g.fillStyle(0x2a2a2a, 0.5); g.fillRect(70, 5, 10, 1); g.fillRect(25, 20, 6, 1);
    // Dark spots / aging
    g.fillStyle(0x3a2a1a, 0.3); g.fillCircle(50, 40, 4);
    g.fillStyle(0x3a2a1a, 0.25); g.fillCircle(20, 8, 3);
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

    // Tree
    g.fillStyle(0x4a3020); g.fillRect(16, 40, 10, 30);
    g.fillStyle(0x1a5a10); g.fillCircle(21, 35, 20);
    g.fillStyle(0x228a20); g.fillCircle(21, 30, 17);
    g.fillStyle(0x2aaa2a); g.fillCircle(15, 25, 12); g.fillCircle(27, 25, 12); g.fillCircle(21, 20, 10);
    g.generateTexture('tree', 42, 72);
    g.clear();

    // Bush
    g.fillStyle(0x1a5a10); g.fillCircle(18, 16, 16);
    g.fillStyle(0x228a20); g.fillCircle(9, 14, 10); g.fillCircle(26, 12, 11); g.fillCircle(18, 8, 9);
    g.fillStyle(0x8B0000); g.fillCircle(12, 10, 2); g.fillCircle(24, 14, 2);
    g.generateTexture('bush', 36, 30);
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
    createSurvivorTextures(g, 's4', 0xf1c40f, 0x8B4513);

    // Repairing textures for survivors
    createRepairingTextures(g, 's1', 0xc0392b, 0x3d2314);
    createRepairingTextures(g, 's2', 0x8e44ad, 0x4a3020);
    createRepairingTextures(g, 's3', 0x27ae60, 0x1a1a1a);
    createRepairingTextures(g, 's4', 0xf1c40f, 0x8B4513);

    // Dying (crawling) textures for survivors
    createDyingTextures(g, 's1', 0xc0392b, 0x3d2314);
    createDyingTextures(g, 's2', 0x8e44ad, 0x4a3020);
    createDyingTextures(g, 's3', 0x27ae60, 0x1a1a1a);
    createDyingTextures(g, 's4', 0xf1c40f, 0x8B4513);

    // Carried (on killer's shoulder) textures for survivors
    createCarriedTextures(g, 's1', 0xc0392b, 0x3d2314);
    createCarriedTextures(g, 's2', 0x8e44ad, 0x4a3020);
    createCarriedTextures(g, 's3', 0x27ae60, 0x1a1a1a);
    createCarriedTextures(g, 's4', 0xf1c40f, 0x8B4513);

    // Killer - highly detailed DBD-style killer (The Trapper inspired)
    // Shadow under feet
    g.fillStyle(0x000000, 0.35); g.fillEllipse(30, 86, 40, 12);
    
    // Left leg - slightly bent at knee
    g.fillStyle(0x151515); g.fillRect(16, 54, 11, 24);
    g.fillStyle(0x1f1f1f); g.fillRect(16, 54, 4, 24);
    g.fillStyle(0x0a0a0a); g.fillRect(14, 70, 14, 10); // Boot
    g.fillStyle(0x1a1a1a); g.fillRect(14, 70, 5, 10); // Boot highlight
    
    // Right leg - slightly bent at knee
    g.fillStyle(0x151515); g.fillRect(33, 54, 11, 24);
    g.fillStyle(0x1f1f1f); g.fillRect(33, 54, 4, 24);
    g.fillStyle(0x0a0a0a); g.fillRect(32, 70, 14, 10); // Boot
    g.fillStyle(0x1a1a1a); g.fillRect(32, 70, 5, 10); // Boot highlight
    
    // Torn robe bottom - jagged edges
    g.fillStyle(0x0f0f0f); g.fillRect(8, 52, 44, 6);
    g.fillStyle(0x0f0f0f); g.fillRect(4, 56, 6, 12);
    g.fillStyle(0x0f0f0f); g.fillRect(14, 56, 5, 10);
    g.fillStyle(0x0f0f0f); g.fillRect(26, 56, 4, 14);
    g.fillStyle(0x0f0f0f); g.fillRect(36, 56, 6, 11);
    g.fillStyle(0x0f0f0f); g.fillRect(48, 56, 8, 8);
    
    // Main robe body - more organic shape
    g.fillStyle(0x1a1a1a); g.fillRect(10, 26, 40, 30);
    g.fillStyle(0x252525); g.fillRect(10, 26, 8, 30); // Left fold
    g.fillStyle(0x202020); g.fillRect(42, 26, 8, 30); // Right fold
    
    // Robe stitching details
    g.fillStyle(0x333333); g.fillRect(10, 32, 40, 2);
    g.fillStyle(0x333333); g.fillRect(10, 42, 40, 2);
    g.fillStyle(0x333333); g.fillRect(10, 50, 40, 2);
    
    // Dark crimson chest emblem
    g.fillStyle(0x8B0000); g.fillRect(18, 30, 24, 18);
    g.fillStyle(0x6a0000); g.fillRect(18, 30, 6, 18); // Shadow side
    g.fillStyle(0xaa1111); g.fillRect(36, 30, 6, 18); // Highlight side
    g.fillStyle(0x7a0000); g.fillCircle(30, 39, 8); // Central emblem
    
    // Shoulder pads
    g.fillStyle(0x1a1a1a); g.fillCircle(10, 28, 8);
    g.fillStyle(0x252525); g.fillCircle(10, 28, 6);
    g.fillStyle(0x1a1a1a); g.fillCircle(50, 28, 8);
    g.fillStyle(0x252525); g.fillCircle(50, 28, 6);
    
    // Left arm - detailed sleeve
    g.fillStyle(0x1a1a1a); g.fillRect(-2, 26, 12, 22);
    g.fillStyle(0x252525); g.fillRect(-2, 26, 4, 22);
    g.fillStyle(0x1a1a1a); g.fillRect(-4, 40, 14, 10); // Forearm
    g.fillStyle(0x151515); g.fillRect(-4, 40, 5, 10); // Forearm shadow
    
    // Right arm - detailed sleeve
    g.fillStyle(0x1a1a1a); g.fillRect(50, 26, 12, 22);
    g.fillStyle(0x252525); g.fillRect(54, 26, 6, 22);
    g.fillStyle(0x1a1a1a); g.fillRect(50, 40, 14, 10); // Forearm
    g.fillStyle(0x151515); g.fillRect(59, 40, 5, 10); // Forearm shadow
    
    // Clawed left hand
    g.fillStyle(0x3a3a3a); g.fillCircle(2, 52, 7);
    g.fillStyle(0x4a4a4a); g.fillCircle(2, 51, 5);
    g.fillStyle(0x3a3a3a); g.fillCircle(2, 51, 4);
    // Claws
    g.fillStyle(0x555555); g.fillRect(-2, 56, 3, 10); g.fillRect(1, 58, 3, 11); g.fillRect(4, 57, 3, 10); g.fillRect(7, 55, 3, 9);
    g.fillStyle(0x666666); g.fillRect(-2, 56, 1, 10); g.fillRect(1, 58, 1, 11); g.fillRect(4, 57, 1, 10); g.fillRect(7, 55, 1, 9);
    
    // Clawed right hand
    g.fillStyle(0x3a3a3a); g.fillCircle(58, 52, 7);
    g.fillStyle(0x4a4a4a); g.fillCircle(58, 51, 5);
    g.fillStyle(0x3a3a3a); g.fillCircle(58, 51, 4);
    // Claws
    g.fillStyle(0x555555); g.fillRect(50, 55, 3, 9); g.fillRect(53, 57, 3, 10); g.fillRect(56, 58, 3, 11); g.fillRect(59, 56, 3, 10);
    g.fillStyle(0x666666); g.fillRect(59, 56, 1, 10); g.fillRect(56, 58, 1, 11); g.fillRect(53, 57, 1, 10); g.fillRect(50, 55, 1, 9);
    
    // Neck
    g.fillStyle(0x2a2a2a); g.fillRect(22, 20, 16, 8);
    g.fillStyle(0x333333); g.fillRect(22, 20, 5, 8);
    
    // Head base - skull shape
    g.fillStyle(0x2a2a2a); g.fillCircle(30, 12, 16);
    g.fillStyle(0x1f1f1f); g.fillCircle(30, 12, 14);
    g.fillStyle(0x252525); g.fillCircle(30, 10, 12);
    
    // Skull cracks and details
    g.fillStyle(0x151515); g.fillRect(28, 2, 2, 6);
    g.fillStyle(0x151515); g.fillRect(24, 4, 3, 2);
    g.fillStyle(0x151515); g.fillRect(34, 3, 2, 4);
    
    // Face mask - smooth white porcelain style
    g.fillStyle(0xf0f0f0); g.fillEllipse(30, 14, 20, 16);
    g.fillStyle(0xe8e8e8); g.fillEllipse(30, 13, 18, 14);
    g.fillStyle(0xdddddd); g.fillEllipse(30, 12, 16, 12);
    
    // Mask cracks and age marks
    g.fillStyle(0xcccccc, 0.5); g.fillRect(22, 8, 2, 4);
    g.fillStyle(0xbbbbbb, 0.5); g.fillRect(36, 16, 3, 2);
    g.fillStyle(0xcccccc, 0.4); g.fillCircle(40, 10, 2);
    
    // Eye sockets - deep dark holes
    g.fillStyle(0x0a0a0a); g.fillEllipse(22, 11, 10, 8);
    g.fillStyle(0x000000); g.fillEllipse(22, 11, 8, 6);
    g.fillStyle(0x0a0a0a); g.fillEllipse(38, 11, 10, 8);
    g.fillStyle(0x000000); g.fillEllipse(38, 11, 8, 6);
    
    // Eye socket shadows
    g.fillStyle(0x050505); g.fillEllipse(22, 12, 6, 4);
    g.fillStyle(0x050505); g.fillEllipse(38, 12, 6, 4);
    
    // Glowing red eyes - intense
    g.fillStyle(0xff0000); g.fillCircle(22, 11, 4);
    g.fillStyle(0xff2222); g.fillCircle(22, 10, 3);
    g.fillStyle(0xff4444); g.fillCircle(21, 9, 1.5);
    g.fillStyle(0xff0000); g.fillCircle(38, 11, 4);
    g.fillStyle(0xff2222); g.fillCircle(38, 10, 3);
    g.fillStyle(0xff4444); g.fillCircle(39, 9, 1.5);
    
    // Eye glow effect
    g.fillStyle(0xff0000, 0.3); g.fillCircle(22, 11, 6);
    g.fillStyle(0xff0000, 0.2); g.fillCircle(38, 11, 6);
    
    // Nose hole
    g.fillStyle(0x1a1a1a); g.fillEllipse(30, 16, 3, 4);
    g.fillStyle(0x0a0a0a); g.fillEllipse(30, 17, 2, 2);
    
    // Mouth - stitched shut
    g.fillStyle(0x1a1a1a); g.fillRect(22, 20, 16, 4);
    g.fillStyle(0x151515); g.fillRect(22, 21, 16, 2);
    // Stitches
    g.fillStyle(0x888888); g.fillRect(24, 19, 2, 6);
    g.fillStyle(0x888888); g.fillRect(28, 19, 2, 6);
    g.fillStyle(0x888888); g.fillRect(32, 19, 2, 6);
    g.fillStyle(0x888888); g.fillRect(36, 19, 2, 6);
    // Stitch thread
    g.fillStyle(0x666666); g.fillRect(25, 21, 2, 1);
    g.fillStyle(0x666666); g.fillRect(29, 21, 2, 1);
    g.fillStyle(0x666666); g.fillRect(33, 21, 2, 1);
    g.fillStyle(0x666666); g.fillRect(37, 21, 2, 1);
    
    // Hair wisps from under mask
    g.fillStyle(0x1a1a1a); g.fillRect(14, 4, 4, 8);
    g.fillStyle(0x1a1a1a); g.fillRect(42, 3, 5, 10);
    g.fillStyle(0x222222); g.fillRect(16, 2, 3, 6);
    
    // Blood drips from mask edge
    g.fillStyle(0x8B0000); g.fillCircle(12, 22, 2);
    g.fillStyle(0x6a0000); g.fillCircle(12, 26, 1.5);
    g.fillStyle(0x8B0000); g.fillCircle(48, 24, 2);
    g.fillStyle(0x6a0000); g.fillCircle(48, 28, 1.5);
    
    // Rust stains on robe
    g.fillStyle(0x3a2a1a, 0.4); g.fillCircle(20, 44, 4);
    g.fillStyle(0x3a2a1a, 0.3); g.fillCircle(42, 48, 3);
    
    // Chain accessory around neck
    g.fillStyle(0x4a4a4a); g.fillCircle(20, 24, 3);
    g.fillStyle(0x5a5a5a); g.fillCircle(20, 24, 2);
    g.fillStyle(0x4a4a4a); g.fillCircle(40, 24, 3);
    g.fillStyle(0x5a5a5a); g.fillCircle(40, 24, 2);
    g.fillStyle(0x555555); g.fillRect(23, 23, 14, 3);
    g.fillStyle(0x666666); g.fillRect(23, 23, 14, 1);
    
    g.generateTexture('killer', 60, 90);
    g.clear();

    // ═══════ KILLER STRIKE ANIMATION ═══════
    // Shadow under feet - wider for impact
    g.fillStyle(0x000000, 0.4); g.fillEllipse(30, 86, 44, 14);
    
    // Left leg - planted
    g.fillStyle(0x151515); g.fillRect(16, 54, 11, 24);
    g.fillStyle(0x1f1f1f); g.fillRect(16, 54, 4, 24);
    g.fillStyle(0x0a0a0a); g.fillRect(14, 70, 14, 10);
    g.fillStyle(0x1a1a1a); g.fillRect(14, 70, 5, 10);
    
    // Right leg - lunging forward
    g.fillStyle(0x151515); g.fillRect(33, 56, 11, 22);
    g.fillStyle(0x1f1f1f); g.fillRect(33, 56, 4, 22);
    g.fillStyle(0x0a0a0a); g.fillRect(32, 70, 16, 10);
    g.fillStyle(0x1a1a1a); g.fillRect(32, 70, 6, 10);
    
    // Torn robe - more dynamic
    g.fillStyle(0x0f0f0f); g.fillRect(8, 52, 44, 6);
    g.fillStyle(0x0f0f0f); g.fillRect(4, 56, 6, 12);
    g.fillStyle(0x0f0f0f); g.fillRect(14, 56, 5, 10);
    g.fillStyle(0x0f0f0f); g.fillRect(26, 56, 4, 14);
    g.fillStyle(0x0f0f0f); g.fillRect(36, 56, 6, 11);
    g.fillStyle(0x0f0f0f); g.fillRect(48, 56, 8, 8);
    
    // Main robe body - leaning forward
    g.fillStyle(0x1a1a1a); g.fillRect(10, 26, 40, 30);
    g.fillStyle(0x252525); g.fillRect(10, 26, 8, 30);
    g.fillStyle(0x202020); g.fillRect(42, 26, 8, 30);
    
    // Robe movement effect
    g.fillStyle(0x151515); g.fillRect(4, 30, 8, 20);
    g.fillStyle(0x0f0f0f); g.fillRect(2, 36, 6, 14);
    
    // Robe stitching
    g.fillStyle(0x333333); g.fillRect(10, 32, 40, 2);
    g.fillStyle(0x333333); g.fillRect(10, 42, 40, 2);
    g.fillStyle(0x333333); g.fillRect(10, 50, 40, 2);
    
    // Dark crimson chest emblem - glowing brighter
    g.fillStyle(0xaa0000); g.fillRect(18, 30, 24, 18);
    g.fillStyle(0x8B0000); g.fillRect(18, 30, 6, 18);
    g.fillStyle(0xcc2222); g.fillRect(36, 30, 6, 18);
    g.fillStyle(0x990000); g.fillCircle(30, 39, 8);
    // Emblem glow
    g.fillStyle(0xff0000, 0.3); g.fillCircle(30, 39, 12);
    
    // Shoulder pads - more pronounced
    g.fillStyle(0x1a1a1a); g.fillCircle(10, 28, 9);
    g.fillStyle(0x252525); g.fillCircle(10, 28, 7);
    g.fillStyle(0x1a1a1a); g.fillCircle(50, 28, 9);
    g.fillStyle(0x252525); g.fillCircle(50, 28, 7);
    
    // Left arm - raised and ready to strike
    g.fillStyle(0x1a1a1a); g.fillRect(-2, 18, 12, 20);
    g.fillStyle(0x252525); g.fillRect(-2, 18, 4, 20);
    g.fillStyle(0x1a1a1a); g.fillRect(-12, 10, 14, 10); // Raised forearm
    g.fillStyle(0x151515); g.fillRect(-12, 10, 5, 10);
    
    // Right arm - extended forward with claw
    g.fillStyle(0x1a1a1a); g.fillRect(50, 26, 12, 22);
    g.fillStyle(0x252525); g.fillRect(54, 26, 6, 22);
    g.fillStyle(0x1a1a1a); g.fillRect(58, 30, 22, 10); // Extended arm
    g.fillStyle(0x151515); g.fillRect(58, 30, 6, 10);
    
    // Extended claw hand
    g.fillStyle(0x3a3a3a); g.fillCircle(82, 36, 8);
    g.fillStyle(0x4a4a4a); g.fillCircle(82, 36, 6);
    g.fillStyle(0x3a3a3a); g.fillCircle(82, 36, 5);
    
    // Extended claws - longer and more menacing
    g.fillStyle(0x555555); g.fillRect(76, 40, 4, 14); g.fillRect(80, 42, 4, 15); g.fillRect(84, 41, 4, 14); g.fillRect(88, 38, 4, 12);
    g.fillStyle(0x777777); g.fillRect(76, 40, 1, 14); g.fillRect(80, 42, 1, 15); g.fillRect(84, 41, 1, 14); g.fillRect(88, 38, 1, 12);
    
    // Motion trail effect for extended arm
    g.fillStyle(0x2a2a2a, 0.4); g.fillRect(60, 33, 20, 4);
    g.fillStyle(0x3a3a3a, 0.3); g.fillRect(62, 33, 16, 3);
    g.fillStyle(0x4a4a4a, 0.2); g.fillRect(64, 33, 12, 2);
    
    // Impact effect - blood splatter
    g.fillStyle(0x8B0000); g.fillCircle(92, 38, 3);
    g.fillStyle(0x6a0000); g.fillCircle(96, 42, 2);
    g.fillStyle(0x8B0000); g.fillCircle(94, 34, 2);
    
    // Left claw - raised
    g.fillStyle(0x3a3a3a); g.fillCircle(2, 42, 7);
    g.fillStyle(0x4a4a4a); g.fillCircle(2, 42, 5);
    g.fillStyle(0x3a3a3a); g.fillCircle(2, 42, 4);
    g.fillStyle(0x555555); g.fillRect(-2, 46, 3, 12); g.fillRect(1, 48, 3, 13); g.fillRect(4, 47, 3, 12); g.fillRect(7, 45, 3, 11);
    g.fillStyle(0x666666); g.fillRect(-2, 46, 1, 12); g.fillRect(1, 48, 1, 13); g.fillRect(4, 47, 1, 12); g.fillRect(7, 45, 1, 11);
    
    // Neck - tense
    g.fillStyle(0x2a2a2a); g.fillRect(22, 20, 16, 8);
    g.fillStyle(0x333333); g.fillRect(22, 20, 5, 8);
    
    // Head - tilted forward aggressively
    g.fillStyle(0x2a2a2a); g.fillCircle(30, 12, 16);
    g.fillStyle(0x1f1f1f); g.fillCircle(30, 12, 14);
    g.fillStyle(0x252525); g.fillCircle(30, 10, 12);
    
    // Skull cracks
    g.fillStyle(0x151515); g.fillRect(28, 2, 2, 6);
    g.fillStyle(0x151515); g.fillRect(24, 4, 3, 2);
    g.fillStyle(0x151515); g.fillRect(34, 3, 2, 4);
    
    // Face mask - strained expression
    g.fillStyle(0xf0f0f0); g.fillEllipse(30, 14, 20, 16);
    g.fillStyle(0xe8e8e8); g.fillEllipse(30, 13, 18, 14);
    g.fillStyle(0xdddddd); g.fillEllipse(30, 12, 16, 12);
    
    // Mask cracks
    g.fillStyle(0xcccccc, 0.5); g.fillRect(22, 8, 2, 4);
    g.fillStyle(0xbbbbbb, 0.5); g.fillRect(36, 16, 3, 2);
    g.fillStyle(0xcccccc, 0.4); g.fillCircle(40, 10, 2);
    
    // Eye sockets - darker, angrier
    g.fillStyle(0x050505); g.fillEllipse(22, 11, 10, 8);
    g.fillStyle(0x000000); g.fillEllipse(22, 11, 8, 6);
    g.fillStyle(0x050505); g.fillEllipse(38, 11, 10, 8);
    g.fillStyle(0x000000); g.fillEllipse(38, 11, 8, 6);
    
    // Eye socket shadows
    g.fillStyle(0x020202); g.fillEllipse(22, 12, 6, 4);
    g.fillStyle(0x020202); g.fillEllipse(38, 12, 6, 4);
    
    // Glowing red eyes - brighter, angrier
    g.fillStyle(0xff0000); g.fillCircle(22, 11, 5);
    g.fillStyle(0xff2222); g.fillCircle(22, 10, 4);
    g.fillStyle(0xff5555); g.fillCircle(21, 9, 2);
    g.fillStyle(0xff0000); g.fillCircle(38, 11, 5);
    g.fillStyle(0xff2222); g.fillCircle(38, 10, 4);
    g.fillStyle(0xff5555); g.fillCircle(39, 9, 2);
    
    // Eye glow - more intense
    g.fillStyle(0xff0000, 0.4); g.fillCircle(22, 11, 8);
    g.fillStyle(0xff0000, 0.3); g.fillCircle(38, 11, 8);
    g.fillStyle(0xff0000, 0.2); g.fillCircle(22, 11, 12);
    g.fillStyle(0xff0000, 0.15); g.fillCircle(38, 11, 12);
    
    // Nose
    g.fillStyle(0x1a1a1a); g.fillEllipse(30, 16, 3, 4);
    g.fillStyle(0x0a0a0a); g.fillEllipse(30, 17, 2, 2);
    
    // Mouth - slightly open, more menacing
    g.fillStyle(0x0a0a0a); g.fillRect(22, 20, 16, 5);
    g.fillStyle(0x050505); g.fillRect(22, 21, 16, 3);
    // Stitches - strained
    g.fillStyle(0x999999); g.fillRect(24, 19, 2, 7);
    g.fillStyle(0x999999); g.fillRect(28, 19, 2, 7);
    g.fillStyle(0x999999); g.fillRect(32, 19, 2, 7);
    g.fillStyle(0x999999); g.fillRect(36, 19, 2, 7);
    g.fillStyle(0x777777); g.fillRect(25, 22, 2, 1);
    g.fillStyle(0x777777); g.fillRect(29, 22, 2, 1);
    g.fillStyle(0x777777); g.fillRect(33, 22, 2, 1);
    g.fillStyle(0x777777); g.fillRect(37, 22, 2, 1);
    
    // Hair wisps - flying back
    g.fillStyle(0x1a1a1a); g.fillRect(14, 4, 4, 8);
    g.fillStyle(0x1a1a1a); g.fillRect(42, 3, 5, 10);
    g.fillStyle(0x222222); g.fillRect(16, 2, 3, 6);
    
    // Blood drips - more intense
    g.fillStyle(0x8B0000); g.fillCircle(12, 22, 3);
    g.fillStyle(0x6a0000); g.fillCircle(12, 28, 2);
    g.fillStyle(0x8B0000); g.fillCircle(48, 24, 3);
    g.fillStyle(0x6a0000); g.fillCircle(48, 30, 2);
    
    // Rust stains
    g.fillStyle(0x3a2a1a, 0.5); g.fillCircle(20, 44, 5);
    g.fillStyle(0x3a2a1a, 0.4); g.fillCircle(42, 48, 4);
    
    // Chain - taut
    g.fillStyle(0x4a4a4a); g.fillCircle(20, 24, 3);
    g.fillStyle(0x5a5a5a); g.fillCircle(20, 24, 2);
    g.fillStyle(0x4a4a4a); g.fillCircle(40, 24, 3);
    g.fillStyle(0x5a5a5a); g.fillCircle(40, 24, 2);
    g.fillStyle(0x555555); g.fillRect(23, 23, 14, 3);
    g.fillStyle(0x666666); g.fillRect(23, 23, 14, 1);
    
    // Power aura effect
    g.fillStyle(0xff0000, 0.1); g.fillCircle(30, 45, 40);
    g.fillStyle(0xff0000, 0.08); g.fillCircle(30, 45, 50);
    
    g.generateTexture('killer_strike', 100, 95);
    g.clear();

    g.destroy();
}

function createSurvivorTextures(g, name, shirtColor, hairColor) {
    // Shadow
    g.fillStyle(0x000000, 0.3); g.fillEllipse(22, 80, 28, 10);
    // Legs - two separate legs with jeans color
    g.fillStyle(0x2c3e70); g.fillRect(12, 48, 9, 34);
    g.fillStyle(0x1a2a50); g.fillRect(12, 48, 3, 34);
    g.fillStyle(0x2c3e70); g.fillRect(25, 48, 9, 34);
    g.fillStyle(0x1a2a50); g.fillRect(25, 48, 3, 34);
    // Boots
    g.fillStyle(0x4a3a2a); g.fillRect(10, 76, 12, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(10, 76, 4, 8);
    g.fillStyle(0x4a3a2a); g.fillRect(24, 76, 12, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(24, 76, 4, 8);
    // Body
    g.fillStyle(shirtColor); g.fillRect(8, 26, 28, 24);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(8, 26, 6, 24);
    g.fillStyle(shirtColor + 0x222222); g.fillRect(30, 26, 4, 24);
    // Collar
    g.fillStyle(shirtColor - 0x222222); g.fillRect(18, 26, 8, 4);
    // Arms - two separate arms
    g.fillStyle(0xffccaa); g.fillRect(0, 28, 9, 18);
    g.fillStyle(0xeeaa88); g.fillRect(0, 28, 3, 18);
    g.fillStyle(0xffccaa); g.fillRect(35, 28, 9, 18);
    g.fillStyle(0xeeaa88); g.fillRect(35, 28, 3, 18);
    // Hands
    g.fillStyle(0xffccaa); g.fillCircle(4, 48, 5);
    g.fillStyle(0xffccaa); g.fillCircle(40, 48, 5);
    // Shirt sleeves
    g.fillStyle(shirtColor); g.fillRect(0, 26, 10, 8);
    g.fillStyle(shirtColor); g.fillRect(34, 26, 10, 8);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(0, 26, 4, 8);
    g.fillStyle(shirtColor - 0x111111); g.fillRect(34, 26, 4, 8);
    // Head
    g.fillStyle(0xffccaa); g.fillCircle(22, 14, 12);
    g.fillStyle(0xeebb99); g.fillCircle(22, 16, 10);
    // Hair
    g.fillStyle(hairColor); g.fillCircle(22, 10, 11);
    g.fillStyle(hairColor - 0x222222); g.fillCircle(22, 7, 8);
    g.fillStyle(hairColor); g.fillRect(10, 6, 24, 8);
    // Eyes
    g.fillStyle(0x222222); g.fillCircle(17, 13, 3);
    g.fillStyle(0x222222); g.fillCircle(27, 13, 3);
    g.fillStyle(0xffffff); g.fillCircle(16, 12, 1.5);
    g.fillStyle(0xffffff); g.fillCircle(26, 12, 1.5);
    // Eyebrows
    g.fillStyle(hairColor - 0x333333); g.fillRect(14, 9, 7, 2);
    g.fillStyle(hairColor - 0x333333); g.fillRect(24, 9, 7, 2);
    // Nose
    g.fillStyle(0xddaa88); g.fillRect(20, 15, 4, 3);
    // Mouth
    g.fillStyle(0xcc8877); g.fillRect(18, 20, 8, 3);
    g.fillStyle(0xaa6655); g.fillRect(18, 20, 8, 1);
    // Ears
    g.fillStyle(0xffccaa); g.fillRect(9, 12, 4, 6);
    g.fillStyle(0xffccaa); g.fillRect(33, 12, 4, 6);
    g.generateTexture(name, 44, 88);
    g.clear();
}

// Create repairing (crouching) textures for survivors
function createRepairingTextures(g, name, shirtColor, hairColor) {
    // Shadow (larger, more spread out for crouching)
    g.fillStyle(0x000000, 0.4); g.fillEllipse(22, 72, 36, 12);
    // Crouched legs (bent at knees)
    g.fillStyle(0x2c3e70); g.fillRect(6, 50, 10, 18);
    g.fillStyle(0x1a2a50); g.fillRect(6, 50, 3, 18);
    g.fillStyle(0x2c3e70); g.fillRect(28, 50, 10, 18);
    g.fillStyle(0x1a2a50); g.fillRect(28, 50, 3, 18);
    // Knees bent
    g.fillStyle(0x2c3e70); g.fillRect(8, 62, 10, 8);
    g.fillStyle(0x2c3e70); g.fillRect(26, 62, 10, 8);
    // Boots
    g.fillStyle(0x4a3a2a); g.fillRect(4, 68, 12, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(4, 68, 4, 8);
    g.fillStyle(0x4a3a2a); g.fillRect(26, 68, 12, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(26, 68, 4, 8);
    // Crouched body (leaning forward)
    g.fillStyle(shirtColor); g.fillRect(8, 32, 28, 22);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(8, 32, 6, 22);
    g.fillStyle(shirtColor + 0x222222); g.fillRect(30, 32, 4, 22);
    // Back bent
    g.fillStyle(shirtColor - 0x111111); g.fillRect(14, 32, 16, 4);
    // Arms reaching forward (for repair animation - frame 1)
    g.fillStyle(0xffccaa); g.fillRect(-4, 36, 14, 7);
    g.fillStyle(0xeeaa88); g.fillRect(-4, 36, 4, 7);
    g.fillStyle(0xffccaa); g.fillRect(34, 36, 14, 7);
    g.fillStyle(0xeeaa88); g.fillRect(42, 36, 4, 7);
    // Hands reaching to generator
    g.fillStyle(0xffccaa); g.fillCircle(-8, 40, 5);
    g.fillStyle(0xffccaa); g.fillCircle(48, 40, 5);
    // Sleeves
    g.fillStyle(shirtColor); g.fillRect(-2, 34, 10, 6);
    g.fillStyle(shirtColor); g.fillRect(36, 34, 10, 6);
    // Head (slightly tilted)
    g.fillStyle(0xffccaa); g.fillCircle(24, 18, 11);
    g.fillStyle(0xeebb99); g.fillCircle(24, 19, 9);
    // Hair
    g.fillStyle(hairColor); g.fillCircle(24, 14, 10);
    g.fillStyle(hairColor - 0x222222); g.fillCircle(24, 11, 7);
    g.fillStyle(hairColor); g.fillRect(12, 10, 24, 7);
    // Eyes (focused on work)
    g.fillStyle(0x222222); g.fillCircle(19, 17, 2.5);
    g.fillStyle(0x222222); g.fillCircle(29, 17, 2.5);
    g.fillStyle(0xffffff); g.fillCircle(18, 16, 1);
    g.fillStyle(0xffffff); g.fillCircle(28, 16, 1);
    // Eyebrows (concentrated)
    g.fillStyle(hairColor - 0x333333); g.fillRect(16, 13, 7, 2);
    g.fillStyle(hairColor - 0x333333); g.fillRect(26, 13, 7, 2);
    // Nose
    g.fillStyle(0xddaa88); g.fillRect(22, 19, 4, 3);
    // Mouth (slightly open, concentrated)
    g.fillStyle(0xcc8877); g.fillRect(20, 24, 8, 2);
    // Ears
    g.fillStyle(0xffccaa); g.fillRect(11, 16, 4, 5);
    g.fillStyle(0xffccaa); g.fillRect(35, 16, 4, 5);
    g.generateTexture(name + '_repair', 56, 80);
    g.clear();
}

// Create dying (crawling on ground) textures for survivors
function createDyingTextures(g, name, shirtColor, hairColor) {
    // Shadow - much wider and flatter for lying on ground
    g.fillStyle(0x000000, 0.5); g.fillEllipse(22, 72, 44, 8);
    // Legs - lying flat on ground
    g.fillStyle(0x2c3e70); g.fillRect(2, 56, 14, 10);
    g.fillStyle(0x1a2a50); g.fillRect(2, 56, 3, 10);
    g.fillStyle(0x2c3e70); g.fillRect(28, 56, 14, 10);
    g.fillStyle(0x1a2a50); g.fillRect(28, 56, 3, 10);
    // Feet pointing outward (crawling pose)
    g.fillStyle(0x4a3a2a); g.fillRect(-2, 54, 8, 6);
    g.fillStyle(0x3a2a1a); g.fillRect(-2, 54, 3, 6);
    g.fillStyle(0x4a3a2a); g.fillRect(38, 54, 8, 6);
    g.fillStyle(0x3a2a1a); g.fillRect(38, 54, 3, 6);
    // Body - lying flat/horizontal
    g.fillStyle(shirtColor); g.fillRect(4, 44, 36, 16);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(4, 44, 6, 16);
    g.fillStyle(shirtColor + 0x222222); g.fillRect(34, 44, 4, 16);
    // Arms - one in front, one behind (crawling)
    g.fillStyle(0xffccaa); g.fillRect(-6, 46, 14, 6);
    g.fillStyle(0xeeaa88); g.fillRect(-6, 46, 4, 6);
    g.fillStyle(0xffccaa); g.fillRect(36, 46, 14, 6);
    g.fillStyle(0xeeaa88); g.fillRect(42, 46, 4, 6);
    // Hands - touching ground
    g.fillStyle(0xffccaa); g.fillCircle(-10, 49, 4);
    g.fillStyle(0xffccaa); g.fillCircle(50, 49, 4);
    // Sleeves
    g.fillStyle(shirtColor); g.fillRect(-4, 44, 10, 5);
    g.fillStyle(shirtColor); g.fillRect(38, 44, 10, 5);
    // Head - very low to ground
    g.fillStyle(0xffccaa); g.fillCircle(22, 38, 10);
    g.fillStyle(0xeebb99); g.fillCircle(22, 39, 8);
    // Hair - flattened
    g.fillStyle(hairColor); g.fillCircle(22, 34, 9);
    g.fillStyle(hairColor - 0x222222); g.fillCircle(22, 32, 6);
    g.fillStyle(hairColor); g.fillRect(12, 32, 20, 5);
    // Eyes - looking forward/distressed
    g.fillStyle(0x222222); g.fillCircle(18, 37, 2);
    g.fillStyle(0x222222); g.fillCircle(26, 37, 2);
    g.fillStyle(0xffffff); g.fillCircle(17, 36, 0.8);
    g.fillStyle(0xffffff); g.fillCircle(25, 36, 0.8);
    // Eyebrows - worried
    g.fillStyle(hairColor - 0x333333); g.fillRect(15, 34, 6, 1.5);
    g.fillStyle(hairColor - 0x333333); g.fillRect(24, 34, 6, 1.5);
    // Nose
    g.fillStyle(0xddaa88); g.fillRect(20, 38, 3, 2);
    // Mouth - gasping/in pain
    g.fillStyle(0xcc8877); g.fillRect(18, 41, 8, 2.5);
    g.fillStyle(0xaa6655); g.fillRect(19, 41.5, 6, 1);
    // Ears
    g.fillStyle(0xffccaa); g.fillRect(11, 36, 3, 4);
    g.fillStyle(0xffccaa); g.fillRect(30, 36, 3, 4);
    g.generateTexture(name + '_dying', 56, 66);
    g.clear();
}

// Create carried (on killer's shoulder) textures for survivors
function createCarriedTextures(g, name, shirtColor, hairColor) {
    // Shadow - smaller since elevated
    g.fillStyle(0x000000, 0.3); g.fillEllipse(22, 80, 20, 6);
    // Body - vertical, on killer's shoulder
    g.fillStyle(shirtColor); g.fillRect(16, 20, 28, 36);
    g.fillStyle(shirtColor + 0x111111); g.fillRect(16, 20, 6, 36);
    g.fillStyle(shirtColor + 0x222222); g.fillRect(38, 20, 4, 36);
    // Head - tilted, showing distress
    g.fillStyle(0xffccaa); g.fillCircle(28, 14, 10);
    g.fillStyle(0xeebb99); g.fillCircle(28, 15, 8);
    // Hair - disheveled
    g.fillStyle(hairColor); g.fillCircle(28, 10, 9);
    g.fillStyle(hairColor - 0x222222); g.fillCircle(28, 7, 6);
    g.fillStyle(hairColor); g.fillRect(18, 6, 20, 7);
    // Eyes - wide/open with fear
    g.fillStyle(0x222222); g.fillCircle(24, 13, 2.5);
    g.fillStyle(0x222222); g.fillCircle(32, 13, 2.5);
    g.fillStyle(0xffffff); g.fillCircle(23, 12, 1.2);
    g.fillStyle(0xffffff); g.fillCircle(31, 12, 1.2);
    // Eyebrows - raised in fear
    g.fillStyle(hairColor - 0x333333); g.fillRect(21, 9, 6, 2);
    g.fillStyle(hairColor - 0x333333); g.fillRect(29, 9, 6, 2);
    // Nose
    g.fillStyle(0xddaa88); g.fillRect(26, 15, 4, 3);
    // Mouth - open in scream or protest
    g.fillStyle(0xcc8877); g.fillRect(24, 19, 8, 3);
    g.fillStyle(0xaa6655); g.fillRect(25, 19.5, 6, 1);
    // Arms - one hanging, one resisting (animated)
    g.fillStyle(0xffccaa); g.fillRect(0, 24, 16, 6); // Left arm hanging
    g.fillStyle(0xeeaa88); g.fillRect(0, 24, 4, 6);
    g.fillStyle(0xffccaa); g.fillRect(44, 18, 16, 8); // Right arm resisting (raised)
    g.fillStyle(0xeeaa88); g.fillRect(50, 18, 4, 8);
    // Hands
    g.fillStyle(0xffccaa); g.fillCircle(4, 27, 4);
    g.fillStyle(0xffccaa); g.fillCircle(56, 16, 4);
    // Legs - dangling
    g.fillStyle(0x2c3e70); g.fillRect(18, 56, 10, 20);
    g.fillStyle(0x1a2a50); g.fillRect(18, 56, 3, 20);
    g.fillStyle(0x2c3e70); g.fillRect(32, 56, 10, 20);
    g.fillStyle(0x1a2a50); g.fillRect(32, 56, 3, 20);
    // Boots
    g.fillStyle(0x4a3a2a); g.fillRect(16, 74, 12, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(16, 74, 4, 8);
    g.fillStyle(0x4a3a2a); g.fillRect(30, 74, 12, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(30, 74, 4, 8);
    g.generateTexture(name + '_carried', 60, 84);
    g.clear();
}

// ═══════ CREATE SCENE ═══════

function create() {
    scene = this;
    const MAP_W = 2400, MAP_H = 1800;

    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);

    // Ground
    for (let x = 0; x < MAP_W; x += 64) {
        for (let y = 0; y < MAP_H; y += 64) {
            this.add.image(x + 32, y + 32, 'ground').setAlpha(0.6 + Math.random() * 0.35);
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

    // Generators with poles and flickering lights
    [{ x: 300, y: 200 }, { x: 2100, y: 200 }, { x: 1200, y: 900 }, { x: 300, y: 1600 }, { x: 2100, y: 1600 }]
        .forEach((p, i) => {
            // Light glow (outer) - will flicker
            const lightGlow = this.add.graphics();
            lightGlow.fillStyle(0xffee88, 0.15);
            lightGlow.fillCircle(p.x, p.y - 50, 60);
            lightGlow.setDepth(p.y - 50 + 1);

            // Light glow (inner, brighter)
            const lightGlowInner = this.add.graphics();
            lightGlowInner.fillStyle(0xffee88, 0.3);
            lightGlowInner.fillCircle(p.x, p.y - 50, 30);
            lightGlowInner.setDepth(p.y - 50 + 2);

            // Light fixture (on top of pole)
            const light = this.add.sprite(p.x, p.y - 50, 'gen_light').setDepth(p.y - 50 + 3);

            // Light pole
            const pole = this.add.sprite(p.x, p.y - 26, 'gen_pole').setDepth(p.y - 26 + 1);
            pole.setScale(0.8);

            // Generator body glow
            const glow = this.add.graphics();
            glow.fillStyle(0x00ff44, 0.08);
            glow.fillCircle(p.x, p.y, 50);
            glow.setDepth(p.y + 1);

            // Generator body
            const sp = this.add.sprite(p.x, p.y, 'gen').setDepth(p.y + 2);
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
    this.cameras.main.setBackgroundColor('#050505');

    // Floating bar graphics
    floatBarGfx = this.add.graphics().setDepth(55000);

    // Controls
    createControls();

    // Initialize multiplayer if enabled
    if (isMultiplayer && roomCode && playerId) {
        initMultiplayerSync.call(this);
    }
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

    function addBrickRow(sx, sy, n) { for (let i = 0; i < n; i++) obs.push({ t: 'brick', x: sx + i * 96, y: sy, sw: 94, sh: 46, solid: true }); }
    function addBrickCol(sx, sy, n) { for (let i = 0; i < n; i++) obs.push({ t: 'brick', x: sx, y: sy + i * 50, sw: 94, sh: 46, solid: true }); }

    // Brick walls
    addBrickRow(280, 260, 5); addBrickCol(280, 260, 6);
    addBrickRow(880, 340, 6); addBrickCol(880, 340, 5);
    addBrickRow(1880, 580, 5); addBrickCol(1880, 580, 6);
    addBrickRow(360, 1380, 5); addBrickCol(360, 1380, 5);
    addBrickRow(1580, 1040, 5); addBrickCol(1580, 1040, 4);
    addBrickRow(1080, 1480, 6);
    addBrickCol(680, 820, 5); addBrickRow(680, 820, 4);

    // Stones - varied types with different shapes and colors
    const stoneTypes = ['stone1', 'stone2', 'stone3', 'stone4', 'stone5'];
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
        obs.push({ t: p[2], x: p[0], y: p[1], sw: st.sw, sh: st.sh, solid: true });
    });

    // Trees
    [[150, 150], [600, 100], [1100, 150], [1600, 100], [2200, 200],
    [100, 600], [400, 400], [900, 500], [1400, 300], [2000, 400],
    [150, 1100], [500, 900], [1000, 1300], [1500, 1100], [2100, 800],
    [300, 1700], [700, 1700], [1200, 1700], [1700, 1700], [2200, 1600]
    ].forEach(p => obs.push({ t: 'tree', x: p[0], y: p[1], sw: 40, sh: 68, solid: false }));

    // Bushes
    [[250, 500], [700, 300], [1050, 400], [1800, 700], [2100, 300],
    [350, 1200], [800, 1000], [1300, 1400], [1600, 800], [2200, 1200]
    ].forEach(p => obs.push({ t: 'bush', x: p[0], y: p[1], sw: 36, sh: 30, solid: false }));

    return obs;
}

function spawnPlayers() {
    const kSpawn = { x: 1200, y: 900 };
    const sSpawns = [{ x: 200, y: 200 }, { x: 2200, y: 200 }, { x: 200, y: 1600 }, { x: 2200, y: 1600 }];

    if (isKiller) {
        player = makePlayer(this, kSpawn.x, kSpawn.y, 'killer', true);
        this.physics.add.collider(player.sprite, staticGroup);

        // AI survivors - only in singleplayer mode
        if (!isMultiplayer) {
            const sTex = ['s1', 's2', 's3'];
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

    const glow = scene.add.graphics();
    const glowColor = (tex === 'killer') ? 0xff2222 : 0x44aaff;
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

// ═══════ MAIN UPDATE ═══════

let gameTime = 0;

function update(time, dt) {
    if (!scene || !player || gameEnded) return;

    gameTime += dt;

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
                sp.setTexture(p.tex + '_repair');
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
                sp.setTexture(p.tex + '_dying');
            }
            // Crawling animation - slight scale oscillation when moving
            const v = p.sprite.body ? { x: p.sprite.body.velocity.x, y: p.sprite.body.velocity.y } : { x: 0, y: 0 };
            const speed = Math.sqrt(v.x * v.x + v.y * v.y);
            if (speed > 5) {
                // Add crawling wobble effect
                p._crawlPhase = (p._crawlPhase || 0) + dt * 0.015;
                const wobble = Math.sin(p._crawlPhase * 3) * 0.08;
                sp.setScale(1 + wobble, 1 - wobble * 0.5);
            } else {
                // Reset scale when not moving
                sp.setScale(1, 1);
                p._crawlPhase = 0;
            }
        } else if (p.carryTarget) {
            // Update carried texture for the carried survivor
            const carried = p.carryTarget;
            const carriedSprite = carried.sprite;
            
            // Show carried texture (on killer's shoulder)
            if (!carriedSprite.texture.key.includes('_carried')) {
                carriedSprite.setTexture(carried.tex + '_carried');
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
    flushFloatBars();
    updateHUD();
    checkWinLose();

    // Smooth interpolation for remote players in multiplayer
    if (isMultiplayer) {
        interpolateRemotePlayers(dt);
    }

    // Send position update in multiplayer
    if (isMultiplayer && roomCode && playerId) {
        sendPositionUpdate();
    }
}

function updatePlayer(dt) {
    const p = player;
    const sp = p.sprite;

    sp.setDepth(1000 + sp.y);

    if (p.role === 'killer') {
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
        if (actionPressed && killerAttackCooldown <= 0 && killerStrikeTimer <= 0 && !p.carryTarget) {
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
            
            // Apply animation based on phase
            if (p._carryAnimPhase === 'arms_up') {
                const progress = p._carryAnimTimer / p._carryAnimDuration;
                const armWave = Math.sin(progress * Math.PI) * 0.15;
                sp.setScale(1 + armWave, 1 - armWave * 0.5);
                sp.setRotation(0);
            } else if (p._carryAnimPhase === 'legs_flex') {
                const progress = p._carryAnimTimer / p._carryAnimDuration;
                const legFlex = Math.sin(progress * Math.PI) * 0.1;
                sp.setScale(1 - legFlex * 0.3, 1 + legFlex * 0.5);
                sp.setRotation(0);
            } else {
                // Idle - slight natural sway
                if (!p._carryIdlePhase) p._carryIdlePhase = 0;
                p._carryIdlePhase += dt * 0.002;
                const idleSway = Math.sin(p._carryIdlePhase) * 0.02;
                sp.setRotation(idleSway);
                sp.setScale(1, 1);
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
            ct.sprite.setTexture(ct.tex + '_carried');
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

        // Survivor can only be caught if they are vulnerable (repairing a generator)
        // Check local vulnerability or synced animation for multiplayer
        const isVulnerable = t.isVulnerable || (isMultiplayer && remotePlayers[t.playerId]?.animation === 'repair');
        if (!isVulnerable && t.state !== 'dying') {
            // Survivor is not vulnerable - it's a miss
            UI.showToast('❌ Выживший убежал!', 500);
            killerAttackCooldown = 0.4;
            return;
        }

        if (t.state === 'alive') {
            t.state = 'injured';
            t.isVulnerable = false;
            t.sprite.setTint(0xff8888);
            killerSlowdown = 0.8;
            killerAttackCooldown = 0.6;
            if (t.isMe) {
                boostTimer = CONFIG.BOOST_TIME;
                survivorSpeedBoost = 1.0;
            }
            UI.showToast('💥 Выживший ранен!', 2000);

            if (isMultiplayer && roomCode && playerId) {
                setKillerStrikeAnimation(roomCode, playerId, true, t.playerId);
                setPlayerInjured(roomCode, t.playerId);
                clearPlayerAnimation(roomCode, t.playerId);
            }
        } else if (t.state === 'injured') {
            t.state = 'dying';
            t.isVulnerable = false;
            t.sprite.setTint(0xff4444);
            killerSlowdown = 0.8;
            killerAttackCooldown = 0.6;
            UI.showToast('⬇️ Выживший упал!', 2000);

            if (isMultiplayer && roomCode && playerId) {
                setKillerStrikeAnimation(roomCode, playerId, true, t.playerId);
                setPlayerDying(roomCode, t.playerId);
                clearPlayerAnimation(roomCode, t.playerId);
            }
        } else if (t.state === 'dying') {
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
}
            t.state = 'carried';
            UI.showToast('💪 Поднимаешь выжившего...', 2000);

            if (isMultiplayer && roomCode && playerId) {
                setPlayerCarrying(roomCode, playerId, t.playerId);
            }
        }
        return;
    }

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
    if (hatch && hatchOpen && !hatchClosed && dist(sp, hatch) < CONFIG.INTERACT_DISTANCE) {
        hatchClosed = true;
        hatchOpen = false;
        hatch.setTint(0x220000);
        UI.showToast('🔒 Маньяк закрыл люк!', 2000);

        if (isMultiplayer && roomCode) {
            closeHatch(roomCode);
        }
    }
}

function survivorAction(dt) {
    const p = player;
    const sp = p.sprite;

    if (p.state === 'dying' || p.state === 'hooked') return;

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
                    sp.setTexture(p.tex + '_repair');
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

    // Hatch spawns when ALL 5 generators are done
    if (done >= CONFIG.GENERATOR_COUNT && !hatch) {
        spawnHatch();
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
    hatch.glowGfx = glow;

    UI.showToast('🪤 Люк появился на карте!', 3000);

    if (isMultiplayer && roomCode) {
        setHatchSpawned(roomCode, hx, hy);
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
                    
                    // Survivor can only be caught if they are vulnerable (repairing a generator)
                    if (!p2.isVulnerable && p2.state !== 'dying') {
                        // Survivor is not vulnerable - AI misses
                        UI.showToast('❌ Ты убежал!', 500);
                        ai.aiAttackCooldown = 0.4;
                    } else {
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
                            p2.state = 'injured';
                            p2.isVulnerable = false;
                            p2.sprite.setTint(0xff8888);
                            boostTimer = CONFIG.BOOST_TIME;
                            survivorSpeedBoost = 1.0;
                            ai.slowdownTimer = 0.8;
                            ai.aiAttackCooldown = 0.6;
                            ai.aiAttackInterval = 0.8 + Math.random() * 0.4;
                            UI.showToast('💥 Ты ранен!', 2000);
                        } else if (p2.state === 'injured') {
                            p2.state = 'dying';
                            p2.isVulnerable = false;
                            p2.sprite.setTint(0xff4444);
                            ai.slowdownTimer = 0.8;
                            ai.aiAttackCooldown = 0.6;
                            ai.aiAttackInterval = 0.8 + Math.random() * 0.4;
                            UI.showToast('⬇️ Ты упал!', 2000);
                        } else if (p2.state === 'dying') {
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
                        const progress = ct._carryAnimTimer / ct._carryAnimDuration;
                        const armWave = Math.sin(progress * Math.PI) * 0.15;
                        ct.sprite.setScale(1 + armWave, 1 - armWave * 0.5);
                        ct.sprite.setRotation(0);
                    } else if (ct._carryAnimPhase === 'legs_flex') {
                        const progress = ct._carryAnimTimer / ct._carryAnimDuration;
                        const legFlex = Math.sin(progress * Math.PI) * 0.1;
                        ct.sprite.setScale(1 - legFlex * 0.3, 1 + legFlex * 0.5);
                        ct.sprite.setRotation(0);
                    } else {
                        if (!ct._carryIdlePhase) ct._carryIdlePhase = 0;
                        ct._carryIdlePhase += dt * 0.002;
                        const idleSway = Math.sin(ct._carryIdlePhase) * 0.02;
                        ct.sprite.setRotation(idleSway);
                        ct.sprite.setScale(1, 1);
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

            // Update dying texture for AI survivors
            if (ai.state === 'dying') {
                if (!sp.texture.key.includes('_dying')) {
                    sp.setTexture(ai.tex + '_dying');
                }
                // Crawling animation for AI
                const speed = Math.sqrt(ai.aiDir.x * ai.aiDir.x + ai.aiDir.y * ai.aiDir.y) * as;
                if (speed > 5) {
                    ai._crawlPhase = (ai._crawlPhase || 0) + dt * 0.015;
                    const wobble = Math.sin(ai._crawlPhase * 3) * 0.08;
                    sp.setScale(1 + wobble, 1 - wobble * 0.5);
                } else {
                    sp.setScale(1, 1);
                    ai._crawlPhase = 0;
                }
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
            // Count real survivors from remotePlayers
            aliveCount = Object.values(remotePlayers).filter(rp => rp.role === 'survivor' && rp.state !== 'dead').length;
        } else {
            aliveCount = (player.aiPlayers || []).filter(a => a.state !== 'dead').length;
        }
    } else {
        if (isMultiplayer) {
            // Count real survivors (self + remote players)
            aliveCount = 1 + Object.values(remotePlayers).filter(rp => rp.role === 'survivor' && rp.state !== 'dead').length;
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
        let allDead = false;
        if (isMultiplayer) {
            // All real survivors must be dead for killer to win
            const survivors = Object.values(remotePlayers).filter(rp => rp.role === 'survivor');
            allDead = survivors.length > 0 && survivors.every(rp => rp.state === 'dead');
        } else {
            allDead = (player.aiPlayers || []).filter(a => a.state !== 'dead').length === 0;
        }
        if (allDead) {
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

                if (hatch && hatchOpen && !hatchClosed && dist(player.sprite, hatch) < 50) {
                    doEndGame(true, 'Ты сбежал через люк!');
                }
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
    if (!roomCode || !playerId) return;

    // Set initial player state
    const initialData = {
        x: player.sprite.x,
        y: player.sprite.y,
        role: player.role,
        state: player.state,
        health: player.health
    };

    // Initialize generators in DB
    initializeGenerators(roomCode);

    // Subscribe to game session
    subscribeToGameSession(roomCode, {
        onPlayersUpdate: (players) => {
            updateRemotePlayers(players);
        },
        onGeneratorsUpdate: (gens) => {
            updateGeneratorsFromServer(gens);
        },
        onGateUpdate: (gate) => {
            if (gate.opened && !exitOpen) {
                exitOpen = true;
                UI.showToast('⚡ Ворота открыты!', 2000);
            }
        },
        onHatchUpdate: (hatchData) => {
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
                if (hatch) hatch.setTint(0x220000);
            }
        },
        onStatusUpdate: (status) => {
            if (status === 'finished') {
                // Game over handled by onGameResult
            }
        },
        onGameResult: (winner, message) => {
            const won = (winner === (isKiller ? 'killer' : 'survivors'));
            doEndGame(won, message);
        },
        onError: (error) => {
            console.error('Game session error:', error);
        }
    });

    console.log('Multiplayer sync initialized for room:', roomCode);
}

function sendPositionUpdate() {
    if (!roomCode || !playerId || !player) return;

    const now = Date.now();
    if (now - lastPosUpdate < POS_UPDATE_INTERVAL) return;
    lastPosUpdate = now;

    sendPlayerPosition(roomCode, playerId, player.sprite.x, player.sprite.y);

    // Also update state
    updatePlayerState(roomCode, playerId, player.state);
    if (player.health !== undefined) {
        updatePlayerHealth(roomCode, playerId, player.health);
    }
}

function updateRemotePlayers(players) {
    if (!scene) return;

    Object.keys(players).forEach(pid => {
        if (pid === playerId) return; // Skip self

        const pdata = players[pid];

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
                    rp.sprite.setTexture(rp.tex + '_dying');
                }
                rp.sprite.setTint(0xff4444);
                // Reset any repair animation
                if (rp.sprite.texture.key.includes('_repair') && rp.tex) {
                    rp.sprite.setTexture(rp.tex + '_dying');
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
                            carriedPlayer.sprite.setTexture(carriedPlayer.tex + '_carried');
                        }
                        carriedPlayer.sprite.setVelocity(0, 0);
                    }
                }
            } else if (pdata.state === 'carried') {
                // Show carried texture for remote players who are being carried
                if (!rp.sprite.texture.key.includes('_carried') && rp.tex) {
                    rp.sprite.setTexture(rp.tex + '_carried');
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
                    rp._carryIdlePhase += 0.002;
                    const idleSway = Math.sin(rp._carryIdlePhase) * 0.02;
                    rp.sprite.setRotation(idleSway);
                    rp.sprite.setScale(1, 1);
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
                            rp.sprite.setTexture(rp.tex + '_repair');
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
            glow.fillStyle(pdata.role === 'killer' ? 0xff2222 : 0x44aaff, 0.15);
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

        // Update glow position
        if (rp.glowFx) {
            rp.glowFx.setPosition(rp.sprite.x, rp.sprite.y);
        }

        // Crawling animation for dying state
        if (rp.state === 'dying' && dist > 5) {
            rp._crawlPhase = (rp._crawlPhase || 0) + dt * 0.015;
            const wobble = Math.sin(rp._crawlPhase * 3) * 0.08;
            rp.sprite.setScale(1 + wobble, 1 - wobble * 0.5);
        } else if (rp.state === 'dying') {
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

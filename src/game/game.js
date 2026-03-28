// ═══════ GAME ENGINE WITH MULTIPLAYER SYNC ═══════

const CONFIG = {
    PLAYER_SPEED: 145,
    KILLER_SPEED: 162,
    INJURED_SPEED: 115,
    DYING_SPEED: 38,
    GENERATOR_COUNT: 5,
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
let actionPressed = false;
let inputVec = { x: 0, y: 0 };

let floatBars = [];
let floatBarGfx = null;
let keys = {};

let gameEnded = false;
let localPlayerId = null;

// Remote players for multiplayer
let remotePlayers = {};
let lastPosUpdate = 0;
const POS_UPDATE_INTERVAL = 50;

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
    actionPressed = false;
    inputVec = { x: 0, y: 0 };
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

    // Brick
    g.fillStyle(0x8B4513); g.fillRect(0, 0, 48, 24);
    g.fillStyle(0x6B3008); g.fillRect(0, 0, 48, 2); g.fillRect(0, 11, 48, 2); g.fillRect(0, 22, 48, 2);
    g.fillStyle(0x9a5520, 0.4); g.fillRect(3, 3, 18, 6); g.fillRect(26, 3, 18, 6);
    g.generateTexture('brick', 48, 24);
    g.clear();

    // Stone
    g.fillStyle(0x696969); g.fillEllipse(22, 18, 42, 34);
    g.fillStyle(0x808080); g.fillEllipse(22, 20, 38, 30);
    g.fillStyle(0x909090); g.fillCircle(13, 12, 8); g.fillCircle(28, 9, 6);
    g.generateTexture('stone', 44, 38);
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

    // Generator
    g.fillStyle(0x3a3a40); g.fillRect(0, 0, 48, 36);
    g.fillStyle(0x4a4a52); g.fillRect(2, 2, 28, 32);
    g.fillStyle(0x222228); g.fillRect(32, 4, 14, 14);
    g.fillStyle(0x00ff44); g.fillRect(34, 6, 4, 6);
    g.fillStyle(0xff2222); g.fillRect(40, 6, 4, 6);
    g.generateTexture('gen', 48, 36);
    g.clear();

    // Hook
    g.fillStyle(0x444450); g.fillCircle(16, 16, 14);
    g.fillStyle(0x666670); g.fillCircle(16, 13, 10);
    g.fillStyle(0x333340); g.fillRect(13, 4, 6, 12);
    g.fillStyle(0x888890); g.fillCircle(16, 4, 4);
    g.generateTexture('hook', 32, 32);
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

    // Killer
    g.fillStyle(0x1a1a1a); g.fillRect(6, 28, 30, 26);
    g.fillStyle(0x8B0000); g.fillRect(10, 32, 22, 18);
    g.fillStyle(0x2a2a2a); g.fillCircle(20, 14, 13);
    g.fillStyle(0xeeeeee); g.fillRect(9, 7, 24, 14);
    g.fillStyle(0x000000); g.fillRect(11, 10, 7, 6); g.fillRect(24, 10, 7, 6);
    g.fillStyle(0xff0000); g.fillCircle(14, 13, 3); g.fillCircle(26, 13, 3);
    g.generateTexture('killer', 40, 72);
    g.clear();

    g.destroy();
}

function createSurvivorTextures(g, name, shirtColor, hairColor) {
    // Shadow
    g.fillStyle(0x000000, 0.3); g.fillEllipse(20, 60, 24, 8);
    // Legs
    g.fillStyle(0x2c3e70); g.fillRect(12, 44, 8, 20); g.fillRect(22, 44, 8, 20);
    // Body
    g.fillStyle(shirtColor); g.fillRect(10, 26, 22, 20);
    g.fillStyle(shirtColor + 0x222222); g.fillRect(11, 27, 20, 18);
    // Head
    g.fillStyle(0xffccaa); g.fillCircle(20, 14, 11);
    g.fillStyle(hairColor); g.fillCircle(20, 8, 10);
    // Eyes
    g.fillStyle(0x222222); g.fillCircle(16, 13, 2.5); g.fillCircle(24, 13, 2.5);
    g.fillStyle(0xffffff); g.fillCircle(15, 12, 1); g.fillCircle(23, 12, 1);
    // Mouth
    g.fillStyle(0xcc8877); g.fillRect(17, 18, 6, 2);
    g.generateTexture(name, 40, 64);
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

    // Generators
    [{ x: 300, y: 200 }, { x: 2100, y: 200 }, { x: 1200, y: 900 }, { x: 300, y: 1600 }, { x: 2100, y: 1600 }]
        .forEach((p, i) => {
            const glow = this.add.graphics();
            glow.fillStyle(0x00ff44, 0.1);
            glow.fillCircle(p.x, p.y, 40);
            glow.setDepth(p.y + 1);

            const sp = this.add.sprite(p.x, p.y, 'gen').setDepth(p.y + 2);
            sp.genId = i;
            sp.progress = 0;
            sp.repaired = false;
            sp.barGfx = this.add.graphics().setDepth(p.y + 3);
            sp.bx = p.x;
            sp.by = p.y;
            sp.glowGfx = glow;
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

    function addBrickRow(sx, sy, n) { for (let i = 0; i < n; i++) obs.push({ t: 'brick', x: sx + i * 50, y: sy, sw: 46, sh: 22, solid: true }); }
    function addBrickCol(sx, sy, n) { for (let i = 0; i < n; i++) obs.push({ t: 'brick', x: sx, y: sy + i * 26, sw: 46, sh: 22, solid: true }); }

    // Brick walls
    addBrickRow(280, 260, 5); addBrickCol(280, 260, 6);
    addBrickRow(880, 340, 6); addBrickCol(880, 340, 5);
    addBrickRow(1880, 580, 5); addBrickCol(1880, 580, 6);
    addBrickRow(360, 1380, 5); addBrickCol(360, 1380, 5);
    addBrickRow(1580, 1040, 5); addBrickCol(1580, 1040, 4);
    addBrickRow(1080, 1480, 6);
    addBrickCol(680, 820, 5); addBrickRow(680, 820, 4);

    // Stones
    [[200, 400], [500, 200], [1200, 300], [1800, 200], [2200, 500],
    [300, 1000], [600, 1400], [1400, 900], [2000, 1100], [1700, 1600],
    [800, 1600], [1100, 700], [1500, 400], [2100, 1400], [450, 700],
    [950, 1200], [1700, 350], [2300, 900], [400, 1550], [1600, 250],
    [1050, 1600], [750, 450], [1800, 1000], [2200, 1200]
    ].forEach(p => obs.push({ t: 'stone', x: p[0], y: p[1], sw: 44, sh: 38, solid: true }));

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

        // AI survivors
        const sTex = ['s1', 's2', 's3'];
        sTex.forEach((t, i) => {
            const ai = makePlayer(this, sSpawns[i].x, sSpawns[i].y, t, false);
            ai.aiDir = { x: 0, y: 0 }; ai.aiTimer = 0;
            this.physics.add.collider(ai.sprite, staticGroup);
            player.aiPlayers = player.aiPlayers || [];
            player.aiPlayers.push(ai);
        });
    } else {
        player = makePlayer(this, sSpawns[0].x, sSpawns[0].y, 's1', true);
        this.physics.add.collider(player.sprite, staticGroup);

        // AI killer
        const aiK = makePlayer(this, kSpawn.x, kSpawn.y, 'killer', false);
        aiK.isAIKiller = true; aiK.aiTimer = 0; aiK.aiHitCooldown = 0;
        this.physics.add.collider(aiK.sprite, staticGroup);
        this.physics.add.collider(player.sprite, aiK.sprite);
        player.aiPlayers = [aiK];
        survivorsAlive = 1;
    }
}

function makePlayer(scene, x, y, tex, isMe) {
    const sp = scene.add.sprite(x, y, tex);
    sp.setDepth(1000 + y);
    scene.physics.add.existing(sp);
    sp.body.setCollideWorldBounds(true);
    sp.body.setSize(24, 28, true);

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
        glowColor: glowColor
    };

    sp._pRef = p;
    return p;
}

// ═══════ MAIN UPDATE ═══════

let gameTime = 0;

function update(time, dt) {
    if (!scene || !player || gameEnded) return;

    gameTime += dt;

    // Animate glows
    generators.forEach(gen => {
        if (gen.glowGfx && !gen.repaired) {
            const pulse = 0.8 + Math.sin(gameTime * 0.003) * 0.3;
            gen.glowGfx.setAlpha(pulse * 0.15);
        }
    });

    [player].concat(player.aiPlayers || []).forEach(p => {
        if (p.glowFx) {
            const pulse = 0.5 + Math.sin(gameTime * 0.004) * 0.2;
            p.glowFx.setAlpha(pulse * 0.4);
            p.glowFx.setPosition(p.sprite.x, p.sprite.y);
        }
    });

    updatePlayer(dt);
    updateAI(dt);
    updateHooks(dt);
    flushFloatBars();
    updateHUD();
    checkWinLose();

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
            return;
        }
        const spd = CONFIG.KILLER_SPEED;
        const v = normalize(inputVec);
        sp.body.setVelocity(v.x * spd, v.y * spd);
        if (actionPressed) killerAction(dt);
    } else {
        if (p.state === 'hooked' || p.state === 'dead') {
            sp.body.setVelocity(0, 0);
            return;
        }
        let spd = CONFIG.PLAYER_SPEED;
        if (p.state === 'injured') spd = CONFIG.INJURED_SPEED;
        if (p.state === 'dying') spd = CONFIG.DYING_SPEED;
        if (boostTimer > 0) {
            boostTimer -= dt / 1000;
            spd = Math.min(spd * 1.25, CONFIG.PLAYER_SPEED * 1.25);
        }
        const v = normalize(inputVec);
        sp.body.setVelocity(v.x * spd, v.y * spd);
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
        const hook = nearestFreeHook(sp);
        if (hook && dist(sp, hook) < CONFIG.INTERACT_DISTANCE + 20) {
            hangSurvivor(ct, hook);
            p.carryTarget = null;
            UI.showToast('🪝 Выживший повешен!', 2000);

            if (isMultiplayer && roomCode && playerId) {
                hookSurvivor(roomCode, ct.playerId, hook.id);
            }
        }
        return;
    }

    const target = nearestAliveTarget(sp, CONFIG.CATCH_DISTANCE);
    if (target) {
        const t = target._pRef;
        if (!t) return;

        if (t.state === 'alive') {
            t.state = 'injured';
            t.sprite.setTint(0xff8888);
            killerStun = CONFIG.STUN_TIME;
            if (t.isMe) boostTimer = CONFIG.BOOST_TIME;
            UI.showToast('💥 Выживший ранен!', 2000);

            if (isMultiplayer && roomCode && t.playerId) {
                setPlayerInjured(roomCode, t.playerId);
            }
        } else if (t.state === 'injured') {
            t.state = 'dying';
            t.sprite.setTint(0xff4444);
            killerStun = CONFIG.STUN_TIME;
            UI.showToast('⬇️ Выживший упал!', 2000);

            if (isMultiplayer && roomCode && t.playerId) {
                setPlayerDying(roomCode, t.playerId);
            }
        } else if (t.state === 'dying') {
            p.carryTarget = t;
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

    let acted = false;

    // Repair generator
    if (!acted) {
        generators.some(gen => {
            if (gen.repaired) return false;
            if (dist(sp, gen) < CONFIG.INTERACT_DISTANCE) {
                acted = true;
                sp.body.setVelocity(0, 0);
                if (!p.progressAction || p.progressAction.target !== gen) {
                    p.progressAction = { type: 'repair', target: gen };
                }
                gen.progress = Math.min(100, gen.progress + CONFIG.GENERATOR_REPAIR_RATE * (dt / 1000));
                drawBar(gen.barGfx, gen.bx, gen.by, gen.progress, 0xffee00);

                if (gen.progress >= 100) {
                    gen.repaired = true;
                    gen.setTint(0x22ff66);
                    if (gen.glowGfx) gen.glowGfx.setAlpha(0);
                    p.progressAction = null;
                    UI.showToast('✅ Генератор починен!', 2000);
                    checkAllGens();

                    if (isMultiplayer && roomCode) {
                        updateGeneratorProgress(roomCode, gen.genId, 100, true);
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
                if (!p.progressAction || p.progressAction.target !== hook) {
                    p.progressAction = { type: 'unhook', target: hook, pct: 0 };
                }
                p.progressAction.pct = Math.min(100, (p.progressAction.pct || 0) + CONFIG.UNHOOK_RATE * (dt / 1000));
                floatBars.push({ wx: hook.bx, wy: hook.by - 30, pct: p.progressAction.pct, color: 0x88aaff });

                if (p.progressAction.pct >= 100) {
                    hs.state = 'injured';
                    hs.sprite.setTint(0xff8888);
                    hs.sprite.setPosition(hook.x + 30, hook.y);
                    hs.sprite.setVisible(true);
                    hook.occupied = false;
                    hook.hookedSurvivor = null;
                    hook.hookTimer = 0;
                    p.progressAction = null;
                    UI.showToast('🙌 Снят с крюка!', 2000);

                    if (isMultiplayer && roomCode && hs.playerId) {
                        unhookSurvivor(roomCode, hs.playerId);
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
                if (!p.progressAction || p.progressAction.target !== ai) {
                    p.progressAction = { type: 'heal', target: ai, pct: 0 };
                }
                p.progressAction.pct = Math.min(100, (p.progressAction.pct || 0) + CONFIG.HEAL_RATE * (dt / 1000));
                floatBars.push({ wx: ai.sprite.x, wy: ai.sprite.y - 42, pct: p.progressAction.pct, color: 0x44ff88 });

                if (p.progressAction.pct >= 100) {
                    ai.state = 'alive';
                    ai.sprite.clearTint();
                    p.progressAction = null;
                    UI.showToast('💊 Вылечен!', 2000);
                }
                return true;
            }
        });
    }

    // Open gate
    if (!acted) {
        gates.some(gate => {
            if (gate.opened || !exitOpen) return false;
            if (dist(sp, gate) < CONFIG.INTERACT_DISTANCE + 30) {
                acted = true;
                sp.body.setVelocity(0, 0);
                if (!p.progressAction || p.progressAction.target !== gate) {
                    p.progressAction = { type: 'gate', target: gate };
                }
                gate.progress = Math.min(100, gate.progress + CONFIG.GATE_RATE * (dt / 1000));
                drawBar(gate.barGfx, gate.bx, gate.by, gate.progress, 0x66ffaa);

                if (gate.progress >= 100) {
                    gate.opened = true;
                    gate.setTint(0x22ff66);
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

    if (!acted) cancelProgress(p);
}

function cancelProgress(p) {
    p.progressAction = null;
}

function checkAllGens() {
    const done = generators.filter(g => g.repaired).length;
    if (done >= CONFIG.GENERATOR_COUNT && !exitOpen) {
        exitOpen = true;
        UI.showToast('⚡ Все генераторы! Открывай ворота!', 3000);

        gates.forEach(gate => {
            gate.glowGfx = scene.add.graphics();
            gate.glowGfx.fillStyle(0x66ffaa, 0.25);
            gate.glowGfx.fillCircle(gate.x, gate.y, 60);
            gate.glowGfx.setDepth(gate.y - 1);
        });

        spawnHatch();

        if (isMultiplayer && roomCode) {
            setGateOpened(roomCode, true);
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
            if (ai.aiHitCooldown > 0) ai.aiHitCooldown -= dt / 1000;

            const target = player;
            if (!target || target.state === 'dead') return;

            const d = dist(sp, target.sprite);
            if (d < CONFIG.CATCH_DISTANCE) {
                sp.body.setVelocity(0, 0);
                if (ai.aiHitCooldown <= 0) {
                    ai.aiHitCooldown = CONFIG.STUN_TIME + 0.3;
                    const p2 = player;
                    if (p2.state === 'alive') {
                        p2.state = 'injured';
                        p2.sprite.setTint(0xff8888);
                        boostTimer = CONFIG.BOOST_TIME;
                        UI.showToast('💥 Ты ранен!', 2000);
                    } else if (p2.state === 'injured') {
                        p2.state = 'dying';
                        p2.sprite.setTint(0xff4444);
                        UI.showToast('⬇️ Ты упал!', 2000);
                    } else if (p2.state === 'dying') {
                        const hook = nearestFreeHook(sp);
                        if (hook) {
                            hangSurvivor(p2, hook);
                            UI.showToast('🪝 Тебя повесили!', 2000);
                        }
                    }
                }
            } else {
                moveTo(sp, target.sprite.x, target.sprite.y, CONFIG.KILLER_SPEED);
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
        }
    });
}

function updateHUD() {
    const p = player;
    const genCount = generators.filter(g => g.repaired).length;

    UI.updateHUD(
        p.role,
        p.state,
        genCount,
        exitOpen,
        hatchOpen && !hatchClosed,
        isKiller ? (player.aiPlayers || []).filter(a => a.state !== 'dead').length : survivorsAlive
    );
}

function checkWinLose() {
    if (gameEnded) return;

    if (isKiller) {
        const alive = (player.aiPlayers || []).filter(a => a.state !== 'dead').length;
        if (alive === 0) {
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
            // Update existing
            const rp = remotePlayers[pid];
            rp.sprite.x = pdata.x || rp.sprite.x;
            rp.sprite.y = pdata.y || rp.sprite.y;
            rp.state = pdata.state || rp.state;

            if (pdata.state === 'dead') {
                rp.sprite.setAlpha(0.3);
            } else if (pdata.state === 'hooked') {
                // Find hook and position
                const hook = hooks.find(h => h.hookId === pdata.hookId);
                if (hook) {
                    rp.sprite.setPosition(hook.x, hook.y - 12);
                }
            }

            if (rp.glowFx) {
                rp.glowFx.setPosition(rp.sprite.x, rp.sprite.y);
            }
        } else {
            // Create new remote player
            const tex = pdata.role === 'killer' ? 'killer' : 's1';
            const sp = scene.add.sprite(pdata.x || 1200, pdata.y || 900, tex);
            sp.setDepth(1000 + (pdata.y || 900));
            scene.physics.add.existing(sp);
            sp.body.setCollideWorldBounds(true);
            sp.body.setSize(24, 28, true);

            const glow = scene.add.graphics();
            glow.fillStyle(pdata.role === 'killer' ? 0xff2222 : 0x44aaff, 0.15);
            glow.fillCircle(0, 0, 25);
            glow.setDepth(999);

            remotePlayers[pid] = {
                sprite: sp,
                glowFx: glow,
                role: pdata.role,
                state: pdata.state || 'alive',
                playerId: pid
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

        if (gen.repaired && !gen.getTint()) {
            gen.setTint(0x22ff66);
            if (gen.glowGfx) gen.glowGfx.setAlpha(0);
        }

        if (!gen.repaired && gen.progress > 0) {
            drawBar(gen.barGfx, gen.bx, gen.by, gen.progress, 0xffee00);
        }
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
    const pool = isKiller ? (player.aiPlayers || []) : (player.aiPlayers || []).filter(a => a.isAIKiller);

    pool.forEach(ai => {
        if (!ai || ai.state === 'dead') return;
        const d = dist(sp, ai.sprite);
        if (d < bd) {
            bd = d;
            best = ai.sprite;
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

function hangSurvivor(p, hook) {
    hook.occupied = true;
    hook.hookedSurvivor = p;
    p.hookTimer = 0;
    p.state = 'hooked';
    p.sprite.setTint(0xaaaaaa);
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

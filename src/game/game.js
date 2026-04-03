// ═══════ GAME ENGINE - Phaser Scene ═══════

function startGame(killerMode, multiplayer, code, pid) {
    isKiller = killerMode;
    isMultiplayer = multiplayer || false;
    roomCode = code || null;
    playerId = pid || localPlayerId;

    exitOpen = false; hatchOpen = false; hatchClosed = false;
    survivorsAlive = isKiller ? 3 : 0;
    killerStun = 0; boostTimer = 0; killerSlowdown = 0;
    survivorSpeedBoost = 0; killerStrikeTimer = 0; killerAttackCooldown = 0;
    actionPressed = false; palletPressed = false;
    inputVec = { x: 0, y: 0 };
    isCarryingNearHook = false; isNearHatch = false; isEscapingHatch = false;
    hatchEscapeProgress = 0; isNearGate = false; isEscapingGate = false;
    gateEscapeProgress = 0; floatBars = []; gameEnded = false;
    remotePlayers = {}; gameTime = 0;

    UI.showScreen('game-screen');
    UI.showToast(isKiller ? '\uD83D\uDD2A \u041F\u043E\u0439\u043C\u0430\u0439 \u0432\u0441\u0435\u0445!' : '\u2699\uFE0F \u041F\u043E\u0447\u0438\u043D\u0438 \u0433\u0435\u043D\u0435\u0440\u0430\u0442\u043E\u0440\u044B!');
    initGame();
}

function stopGame() {
    removeControls();
    if (game) { game.destroy(true); game = null; }
    scene = null; isCarryingNearHook = false;
    if (player && player.carryTarget) {
        var c = player.carryTarget;
        if (c && c.sprite) { c.sprite.setScale(1, 1); if (c.sprite.texture.key.includes('_carried')) c.sprite.setTexture(c.tex); }
        player.carryTarget = null;
    }
    if (isMultiplayer && roomCode) leaveGameSession(roomCode, playerId);
    cleanupThreeJS();
}

function initGame() {
    console.log('initGame called');
    var container = document.getElementById('game-container');
    if (!container) {
        console.error('game-container not found!');
        alert('Ошибка: game-container не найден');
        return;
    }
    container.innerHTML = '';

    console.log('isLowEndDevice:', window.isLowEndDevice);
    console.log('THREE available:', typeof THREE !== 'undefined');

    if (!window.isLowEndDevice && typeof THREE !== 'undefined') {
        try {
            initThreeJS();
            console.log('Three.js init called');
        } catch (e) {
            console.error('Three.js init error:', e);
        }
    }

    try {
        console.log('Creating Phaser.Game...');
        game = new Phaser.Game({
            type: Phaser.AUTO,
            parent: 'game-container',
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: '#1a1a1a',
            roundPixels: true,
            physics: {
                default: 'arcade',
                arcade: { gravity: { y: 0 }, debug: false }
            },
            scene: { preload: preload, create: create, update: update },
            scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
            render: { pixelArt: false, antialias: !window.isLowEndDevice, roundPixels: true, powerPreference: 'high-performance' },
            fps: { target: window.isLowEndDevice ? 30 : 60, forceSetTimeOut: window.isLowEndDevice }
        });
        console.log('Phaser.Game created successfully');
    } catch (e) {
        console.error('Error creating Phaser.Game:', e);
        alert('Ошибка создания игры: ' + e.message);
    }
}

// ═══════ TEXTURE BUILDER ═══════
function preload() {
    var g = this.make.graphics({ x: 0, y: 0, add: false });

    // Ground texture - WebP atlas with seamless blending
    this.load.image('ground_tile', 'src/textures/ground/ground_tile.webp');

    // Brick wall texture - procedural
    g.fillStyle(0x3a2a1a); g.fillRect(0, 0, 128, 128);
    // Bricks
    var brickH = 16, brickW = 32;
    for (var row = 0; row < 8; row++) {
        var offset = (row % 2) * (brickW / 2);
        for (var col = -1; col < 5; col++) {
            var bx = col * brickW + offset;
            var by = row * brickH;
            var r = 70 + Math.floor(Math.random() * 30);
            var gr = 35 + Math.floor(Math.random() * 15);
            var b = 20 + Math.floor(Math.random() * 10);
            g.fillStyle(r << 16 | gr << 8 | b);
            g.fillRect(bx + 1, by + 1, brickW - 2, brickH - 2);
            // Brick highlight
            g.fillStyle((r + 15) << 16 | (gr + 10) << 8 | (b + 5), 0.3);
            g.fillRect(bx + 1, by + 1, brickW - 2, 3);
        }
    }
    // Mortar lines
    g.fillStyle(0x5a5a5a, 0.6);
    for (var row = 0; row <= 8; row++) {
        g.fillRect(0, row * brickH, 128, 2);
    }
    for (var col = 0; col <= 4; col++) {
        g.fillRect(col * brickW, 0, 2, 128);
    }
    g.generateTexture('brick_wall', 128, 128);
    g.clear();

    // Trees
    g.fillStyle(0x000000, 0.3); g.fillEllipse(35, 100, 20, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(30, 60, 10, 40);
    g.fillStyle(0x4a3a2a); g.fillRect(30, 60, 4, 40);
    g.fillStyle(0x1a3a1a); g.fillCircle(35, 40, 25);
    g.fillStyle(0x2a4a2a); g.fillCircle(35, 35, 22);
    g.fillStyle(0x3a5a3a); g.fillCircle(35, 30, 18);
    g.fillStyle(0x4a6a4a); g.fillCircle(30, 25, 12);
    g.fillStyle(0x2a4a2a); g.fillCircle(42, 45, 10);
    g.generateTexture('tree0', 70, 100); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(35, 100, 20, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(30, 60, 10, 40);
    g.fillStyle(0x4a3a2a); g.fillRect(30, 60, 4, 40);
    g.fillStyle(0x1a4a1a); g.fillCircle(35, 40, 25);
    g.fillStyle(0x2a5a2a); g.fillCircle(35, 35, 22);
    g.fillStyle(0x3a6a3a); g.fillCircle(35, 30, 18);
    g.fillStyle(0x4a7a4a); g.fillCircle(28, 25, 12);
    g.fillStyle(0x2a5a2a); g.fillCircle(44, 45, 10);
    g.generateTexture('tree1', 70, 100); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(35, 100, 20, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(30, 60, 10, 40);
    g.fillStyle(0x4a3a2a); g.fillRect(30, 60, 4, 40);
    g.fillStyle(0x1a3a2a); g.fillCircle(35, 40, 25);
    g.fillStyle(0x2a4a3a); g.fillCircle(35, 35, 22);
    g.fillStyle(0x3a5a4a); g.fillCircle(35, 30, 18);
    g.fillStyle(0x4a6a5a); g.fillCircle(32, 25, 12);
    g.fillStyle(0x2a4a3a); g.fillCircle(40, 45, 10);
    g.generateTexture('tree2', 70, 100); g.clear();

    // Pine trees
    g.fillStyle(0x000000, 0.3); g.fillEllipse(25, 95, 16, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(22, 70, 6, 25);
    g.fillStyle(0x1a3a1a); g.fillTriangle(25, 10, 5, 50, 45, 50);
    g.fillStyle(0x2a4a2a); g.fillTriangle(25, 15, 10, 45, 40, 45);
    g.fillStyle(0x3a5a3a); g.fillTriangle(25, 20, 15, 40, 35, 40);
    g.fillStyle(0x4a6a4a); g.fillTriangle(25, 25, 18, 35, 32, 35);
    g.generateTexture('pine_tree', 50, 95); g.clear();

    // Small trees
    g.fillStyle(0x000000, 0.3); g.fillEllipse(20, 80, 14, 6);
    g.fillStyle(0x3a2a1a); g.fillRect(18, 50, 4, 30);
    g.fillStyle(0x1a3a1a); g.fillCircle(20, 35, 18);
    g.fillStyle(0x2a4a2a); g.fillCircle(20, 30, 15);
    g.fillStyle(0x3a5a3a); g.fillCircle(20, 25, 12);
    g.generateTexture('tree_small', 40, 80); g.clear();

    // Bushes
    g.fillStyle(0x000000, 0.3); g.fillEllipse(30, 45, 50, 12);
    g.fillStyle(0x1a3a1a); g.fillCircle(20, 30, 18); g.fillCircle(40, 28, 16);
    g.fillStyle(0x2a4a2a); g.fillCircle(30, 25, 20); g.fillCircle(15, 35, 12);
    g.fillStyle(0x3a5a3a); g.fillCircle(25, 20, 14); g.fillCircle(45, 32, 10);
    g.fillStyle(0x4a6a4a); g.fillCircle(30, 18, 10); g.fillCircle(38, 22, 8);
    g.generateTexture('bush', 60, 45); g.clear();

    // Tall grass
    g.fillStyle(0x2a4a1a); g.fillRect(5, 20, 3, 20); g.fillRect(12, 15, 3, 25);
    g.fillRect(20, 18, 3, 22); g.fillRect(28, 12, 3, 28); g.fillRect(36, 20, 3, 20);
    g.fillRect(44, 16, 3, 24);
    g.fillStyle(0x3a5a2a); g.fillRect(5, 18, 3, 2); g.fillRect(12, 13, 3, 2);
    g.fillRect(20, 16, 3, 2); g.fillRect(28, 10, 3, 2); g.fillRect(36, 18, 3, 2);
    g.fillRect(44, 14, 3, 2);
    g.fillStyle(0x1a3a0a); g.fillRect(8, 25, 2, 15); g.fillRect(16, 22, 2, 18);
    g.fillRect(24, 24, 2, 16); g.fillRect(32, 20, 2, 20); g.fillRect(40, 26, 2, 14);
    g.generateTexture('tall_grass', 50, 40); g.clear();

    // Flower patches
    g.fillStyle(0x2a4a1a); g.fillEllipse(26, 25, 40, 20);
    g.fillStyle(0x3a5a2a); g.fillEllipse(26, 22, 36, 16);
    g.fillStyle(0xff4444); g.fillCircle(12, 18, 3); g.fillCircle(30, 14, 3);
    g.fillStyle(0xffff44); g.fillCircle(22, 20, 3); g.fillCircle(40, 22, 3);
    g.fillStyle(0xff44ff); g.fillCircle(18, 26, 3); g.fillCircle(35, 28, 3);
    g.fillStyle(0xffffff); g.fillCircle(12, 18, 1.5); g.fillCircle(30, 14, 1.5);
    g.fillCircle(22, 20, 1.5); g.fillCircle(40, 22, 1.5);
    g.generateTexture('flower_patch', 52, 35); g.clear();

    // Rocks
    g.fillStyle(0x000000, 0.3); g.fillEllipse(28, 45, 40, 14);
    g.fillStyle(0x4a4a4a); g.fillCircle(28, 28, 18);
    g.fillStyle(0x5a5a5a); g.fillCircle(28, 26, 15);
    g.fillStyle(0x6a6a6a); g.fillCircle(26, 24, 12);
    g.fillStyle(0x7a7a7a); g.fillCircle(24, 22, 8);
    g.fillStyle(0x8a8a8a); g.fillCircle(22, 20, 5);
    g.fillStyle(0x3a3a3a); g.fillCircle(40, 32, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(40, 30, 8);
    g.fillStyle(0x3a3a3a); g.fillCircle(16, 30, 8);
    g.generateTexture('rock_detailed', 56, 45); g.clear();

    // Stones
    g.fillStyle(0x000000, 0.3); g.fillEllipse(20, 38, 30, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(20, 20, 16);
    g.fillStyle(0x5a5a5a); g.fillCircle(20, 18, 13);
    g.fillStyle(0x6a6a6a); g.fillCircle(18, 16, 10);
    g.generateTexture('stone1', 40, 38); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(19, 34, 28, 8);
    g.fillStyle(0x4a4a4a); g.fillCircle(19, 18, 14);
    g.fillStyle(0x5a5a5a); g.fillCircle(19, 16, 11);
    g.fillStyle(0x6a6a6a); g.fillCircle(17, 14, 8);
    g.generateTexture('stone2', 38, 34); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(18, 28, 26, 8);
    g.fillStyle(0x4a4a4a); g.fillCircle(18, 16, 12);
    g.fillStyle(0x5a5a5a); g.fillCircle(18, 14, 9);
    g.fillStyle(0x6a6a6a); g.fillCircle(16, 12, 6);
    g.generateTexture('stone3', 36, 28); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(24, 30, 36, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(24, 18, 18);
    g.fillStyle(0x5a5a5a); g.fillCircle(24, 16, 15);
    g.fillStyle(0x6a6a6a); g.fillCircle(22, 14, 10);
    g.generateTexture('stone4', 48, 30); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(14, 28, 20, 8);
    g.fillStyle(0x4a4a4a); g.fillCircle(14, 16, 10);
    g.fillStyle(0x5a5a5a); g.fillCircle(14, 14, 8);
    g.fillStyle(0x6a6a6a); g.fillCircle(12, 12, 5);
    g.generateTexture('stone5', 28, 28); g.clear();

    // Fence
    g.fillStyle(0x5a4a3a); g.fillRect(4, 0, 16, 64); g.fillStyle(0x6b5a48); g.fillRect(5, 0, 3, 64);
    g.fillStyle(0x4a3a2a); g.fillRect(18, 0, 2, 64); g.fillStyle(0x7a6a58); g.fillRect(2, -2, 20, 6);
    g.fillStyle(0x888888); g.fillCircle(12, 15, 2); g.fillCircle(12, 35, 2); g.fillCircle(12, 55, 2);
    g.generateTexture('fence_post', 24, 64); g.clear();
    g.fillStyle(0x5a4a3a); g.fillRect(0, 2, 64, 8); g.fillStyle(0x6b5a48); g.fillRect(0, 2, 64, 2);
    g.generateTexture('fence_rail', 64, 12); g.clear();

    // Crows
    g.fillStyle(0x1a1a1a); g.fillEllipse(24, 16, 20, 12); g.fillStyle(0x2a2a2a); g.fillEllipse(24, 15, 18, 10);
    g.fillStyle(0x3a3a3a); g.fillEllipse(24, 14, 14, 8);
    g.fillStyle(0x1a1a1a); g.fillCircle(36, 10, 8); g.fillStyle(0x2a2a2a); g.fillCircle(36, 9, 7);
    g.fillStyle(0x3a3a3a); g.fillCircle(36, 8, 5);
    g.fillStyle(0x3a3a3a); g.fillTriangle(42, 10, 50, 12, 42, 14);
    g.fillStyle(0x1a1a1a); g.fillCircle(38, 8, 3); g.fillStyle(0x4a4a4a); g.fillCircle(38, 8, 2);
    g.fillStyle(0x1a1a1a); g.fillEllipse(8, 14, 24, 10); g.fillStyle(0x2a2a2a); g.fillEllipse(8, 13, 20, 8);
    g.fillStyle(0x1a1a1a); g.fillEllipse(40, 14, 24, 10); g.fillStyle(0x2a2a2a); g.fillEllipse(40, 13, 20, 8);
    g.fillStyle(0x1a1a1a); g.fillEllipse(6, 18, 12, 6);
    g.fillStyle(0x4a4a4a); g.fillRect(20, 22, 2, 6); g.fillRect(26, 22, 2, 6);
    g.generateTexture('crow', 50, 32); g.clear();

    g.fillStyle(0x1a1a1a); g.fillEllipse(16, 20, 18, 14); g.fillStyle(0x2a2a2a); g.fillEllipse(16, 18, 16, 12);
    g.fillStyle(0x3a3a3a); g.fillEllipse(16, 16, 12, 10);
    g.fillStyle(0x1a1a1a); g.fillCircle(26, 8, 8); g.fillStyle(0x2a2a2a); g.fillCircle(26, 7, 7);
    g.fillStyle(0x3a3a3a); g.fillCircle(26, 6, 5);
    g.fillStyle(0x3a3a3a); g.fillTriangle(32, 6, 40, 8, 32, 10);
    g.fillStyle(0x1a1a1a); g.fillCircle(28, 4, 3); g.fillStyle(0x4a4a4a); g.fillCircle(28, 4, 2);
    g.fillStyle(0x1a1a1a); g.fillEllipse(6, 18, 14, 10); g.fillStyle(0x2a2a2a); g.fillEllipse(6, 17, 12, 8);
    g.fillStyle(0x1a1a1a); g.fillEllipse(26, 18, 14, 10); g.fillStyle(0x2a2a2a); g.fillEllipse(26, 17, 12, 8);
    g.fillStyle(0x1a1a1a); g.fillEllipse(2, 24, 8, 6);
    g.fillStyle(0x4a4a4a); g.fillRect(14, 28, 2, 8); g.fillRect(20, 28, 2, 8);
    g.fillRect(12, 34, 6, 2); g.fillRect(18, 34, 6, 2);
    g.generateTexture('crow_sitting', 42, 40); g.clear();

    // Generator
    g.fillStyle(0x252530); g.fillRect(4, 18, 56, 58); g.fillStyle(0x2d2d38); g.fillRect(6, 20, 52, 54);
    g.fillStyle(0x353542); g.fillRect(8, 22, 48, 50);
    g.fillStyle(0x1a1a22); g.fillRect(8, 22, 48, 2); g.fillRect(8, 22, 2, 50);
    g.fillStyle(0x404050); g.fillRect(54, 22, 2, 50); g.fillRect(8, 68, 48, 2);
    g.fillStyle(0x2a2a35); g.fillRect(12, 24, 3, 46); g.fillRect(49, 24, 3, 46);
    g.fillRect(14, 32, 36, 2); g.fillRect(14, 48, 36, 2); g.fillRect(14, 62, 36, 2);
    g.fillStyle(0x1a1a20); g.fillRect(14, 26, 36, 8); g.fillStyle(0x252530); g.fillRect(15, 27, 34, 6);
    for (var i = 0; i < 6; i++) { g.fillStyle(0x353540); g.fillRect(16+i*5, 27, 3, 6); g.fillStyle(0x151518); g.fillRect(16+i*5, 28, 3, 2); }
    g.fillStyle(0x1a1a20); g.fillRect(14, 36, 36, 8); g.fillStyle(0x252530); g.fillRect(15, 37, 34, 6);
    for (var i = 0; i < 6; i++) { g.fillStyle(0x353540); g.fillRect(16+i*5, 37, 3, 6); g.fillStyle(0x151518); g.fillRect(16+i*5, 38, 3, 2); }
    g.fillStyle(0x1a1a20); g.fillRect(14, 46, 36, 8); g.fillStyle(0x252530); g.fillRect(15, 47, 34, 6);
    for (var i = 0; i < 6; i++) { g.fillStyle(0x353540); g.fillRect(16+i*5, 47, 3, 6); g.fillStyle(0x151518); g.fillRect(16+i*5, 48, 3, 2); }
    g.fillStyle(0x303038); g.fillRect(12, 56, 28, 18); g.fillStyle(0x383840); g.fillRect(13, 57, 26, 16);
    g.fillStyle(0x404048); g.fillRect(14, 58, 24, 14);
    g.fillStyle(0x5a5a62); g.fillCircle(15, 59, 2); g.fillCircle(37, 59, 2); g.fillCircle(15, 71, 2); g.fillCircle(37, 71, 2);
    g.fillStyle(0x00ff44); g.fillCircle(20, 63, 4); g.fillStyle(0x00dd33); g.fillCircle(20, 63, 3);
    g.fillStyle(0xff2222); g.fillCircle(30, 63, 4); g.fillStyle(0xcc1111); g.fillCircle(30, 63, 3);
    g.fillStyle(0xffff00); g.fillCircle(20, 69, 2); g.fillStyle(0x00ff00); g.fillCircle(26, 69, 2); g.fillStyle(0xff8800); g.fillCircle(32, 69, 2);
    g.fillStyle(0x1a1a1a); g.fillRect(22, 66, 6, 4); g.fillStyle(0x252525); g.fillRect(23, 67, 4, 2);
    g.fillStyle(0x1a1a20); g.fillRect(42, 56, 5, 18); g.fillStyle(0x8B0000); g.fillRect(43, 57, 3, 6);
    g.fillStyle(0x00aa00); g.fillRect(43, 64, 3, 4); g.fillStyle(0x0066aa); g.fillRect(43, 69, 3, 5);
    g.fillStyle(0x2a2a30); g.fillRect(41, 55, 8, 4); g.fillRect(41, 71, 8, 4);
    g.fillStyle(0x2a2a32); g.fillRect(48, 30, 10, 32); g.fillStyle(0x323238); g.fillRect(49, 31, 8, 30);
    g.fillStyle(0x4a4a52); g.fillCircle(53, 34, 4); g.fillStyle(0x3a3a42); g.fillCircle(53, 34, 3);
    g.fillStyle(0x1a1a20); g.fillRect(50, 40, 6, 18); g.fillStyle(0x00aa44); g.fillRect(51, 42, 4, 12);
    g.fillStyle(0x3a3a40); g.fillRect(4, 40, 6, 20); g.fillStyle(0x4a4a50); g.fillRect(4, 40, 6, 2);
    g.fillStyle(0x2a2a30); g.fillRect(2, 38, 10, 4);
    g.fillStyle(0x5a5a62); g.fillCircle(10, 24, 3); g.fillCircle(54, 24, 3); g.fillCircle(10, 68, 3); g.fillCircle(54, 68, 3);
    g.fillStyle(0x4a3a2a, 0.4); g.fillCircle(52, 62, 5); g.fillStyle(0x3a2a1a, 0.3); g.fillCircle(20, 70, 4);
    g.fillStyle(0xffcc00); g.fillRect(16, 58, 14, 6); g.fillStyle(0x1a1a1a); g.fillRect(18, 60, 2, 2);
    g.fillRect(22, 60, 2, 2); g.fillRect(26, 60, 2, 2);
    g.fillStyle(0x4a4a52); g.fillRect(44, 50, 8, 3); g.fillStyle(0x5a5a62); g.fillRect(44, 50, 8, 1);
    g.generateTexture('gen', 64, 80); g.clear();

    // Gen pole
    g.fillStyle(0x3a3a42); g.fillRect(28, 0, 8, 54); g.fillStyle(0x4a4a52); g.fillRect(29, 0, 3, 54);
    g.fillStyle(0x353540); g.fillRect(32, 0, 3, 54);
    g.fillStyle(0x2a2a32); g.fillRect(28, 0, 1, 54); g.fillRect(35, 0, 1, 54);
    g.fillStyle(0x4a4a52); g.fillRect(22, 48, 20, 8); g.fillStyle(0x5a5a62); g.fillRect(24, 48, 16, 6);
    g.fillStyle(0x6a6a72); g.fillCircle(26, 50, 2); g.fillCircle(38, 50, 2); g.fillCircle(26, 54, 2); g.fillCircle(38, 54, 2);
    g.fillStyle(0x5a3a2a, 0.5); g.fillRect(29, 16, 2, 14); g.fillStyle(0x5a3a2a, 0.4); g.fillRect(30, 32, 2, 10);
    g.fillStyle(0x4a4a52); g.fillRect(24, 0, 16, 6); g.fillStyle(0x5a5a62); g.fillRect(26, 1, 12, 4);
    g.fillStyle(0x6a6a72); g.fillCircle(28, 3, 2); g.fillCircle(36, 3, 2);
    g.generateTexture('gen_pole', 64, 60); g.clear();

    // Gen light
    g.fillStyle(0x3a3a40); g.fillRect(16, 0, 32, 18); g.fillStyle(0x454550); g.fillRect(18, 2, 28, 14);
    g.fillStyle(0x404048); g.fillRect(18, 2, 28, 4);
    g.fillStyle(0x353540); g.fillRect(16, 0, 2, 18); g.fillRect(46, 0, 2, 18);
    g.fillStyle(0x4a4a52); g.fillRect(28, 14, 8, 6); g.fillStyle(0x5a5a62); g.fillRect(29, 15, 6, 4);
    g.fillStyle(0x2a2a30); g.fillEllipse(32, 10, 24, 10); g.fillStyle(0x353540); g.fillEllipse(32, 10, 22, 8);
    g.fillStyle(0x4a4a52); g.fillEllipse(32, 10, 18, 6);
    g.fillStyle(0xffee88); g.fillCircle(32, 10, 7); g.fillStyle(0xffdd66); g.fillCircle(32, 10, 5);
    g.fillStyle(0xffeeaa); g.fillCircle(31, 9, 3); g.fillStyle(0xffffcc); g.fillCircle(30, 8, 1.5);
    g.fillStyle(0x5a5a62); g.fillRect(29, 15, 6, 4); g.fillStyle(0x4a4a52); g.fillRect(30, 16, 4, 3);
    g.fillStyle(0x3a3a42); g.fillRect(31, 17, 2, 2);
    g.fillStyle(0x2a2a30); g.fillRect(18, 14, 10, 2); g.fillRect(36, 14, 10, 2);
    g.fillStyle(0xffee88, 0.4); g.fillCircle(32, 10, 12); g.fillStyle(0xffee88, 0.2); g.fillCircle(32, 10, 16);
    g.generateTexture('gen_light', 64, 24); g.clear();

    // Hook
    g.fillStyle(0x2a2a30); g.fillRect(14, 18, 6, 46); g.fillStyle(0x3a3a42); g.fillRect(15, 18, 2, 46);
    g.fillStyle(0x4a4a52); g.fillRect(10, 58, 14, 6); g.fillStyle(0x3a3a42); g.fillRect(10, 58, 14, 2);
    g.fillStyle(0x5a3020, 0.6); g.fillCircle(12, 62, 2); g.fillCircle(20, 61, 1.5);
    g.fillStyle(0x555560); g.fillRect(14, 4, 5, 16);
    g.fillStyle(0x606068); g.fillCircle(18, 14, 6); g.fillStyle(0x505058); g.fillCircle(18, 14, 4);
    g.fillStyle(0x4a4a52); g.fillRect(14, 8, 5, 6);
    g.fillStyle(0x4a4a52); g.fillCircle(13, 10, 3); g.fillStyle(0x5a5a62); g.fillCircle(12, 9, 1.5);
    g.fillStyle(0x484850); g.fillCircle(17, 2, 3); g.fillStyle(0x585860); g.fillCircle(17, 2, 2);
    g.fillStyle(0x888890, 0.4); g.fillRect(15, 20, 1, 40); g.fillStyle(0x707078, 0.3); g.fillCircle(16, 12, 2);
    g.fillStyle(0x6a3a28, 0.4); g.fillRect(14, 30, 2, 8); g.fillStyle(0x6a3a28, 0.3); g.fillRect(15, 42, 1, 6);
    g.generateTexture('hook', 32, 64); g.clear();

    // Gate
    g.fillStyle(0x5a3a1a); g.fillRect(0, 0, 32, 64);
    g.fillStyle(0x7a5a3a); g.fillRect(2, 2, 13, 60); g.fillRect(17, 2, 13, 60);
    g.fillStyle(0x444450); g.fillRect(0, 10, 32, 4); g.fillRect(0, 50, 32, 4);
    g.generateTexture('gate', 32, 64); g.clear();

    // Hatch
    g.fillStyle(0x3a3a30); g.fillCircle(20, 20, 20); g.fillStyle(0x5a5a4a); g.fillCircle(20, 20, 17);
    g.fillStyle(0x1a1a10); g.fillCircle(20, 20, 10);
    g.generateTexture('hatch', 40, 40); g.clear();

    // Pallet
    g.fillStyle(0x5a3a1a); g.fillRect(4, 0, 24, 48); g.fillStyle(0x6a4a2a); g.fillRect(6, 2, 20, 44);
    g.fillStyle(0x4a2a0a); g.fillRect(4, 0, 2, 48); g.fillRect(26, 0, 2, 48);
    g.fillStyle(0x7a5a3a); g.fillRect(6, 2, 20, 2); g.fillRect(6, 22, 20, 2); g.fillRect(6, 42, 20, 2);
    g.fillStyle(0x3a1a0a); g.fillCircle(16, 4, 2); g.fillCircle(16, 24, 2); g.fillCircle(16, 44, 2);
    g.generateTexture('pallet', 32, 48); g.clear();

    // Pallet fallen
    g.fillStyle(0x5a3a1a); g.fillRect(0, 16, 48, 16); g.fillStyle(0x6a4a2a); g.fillRect(2, 18, 44, 12);
    g.fillStyle(0x4a2a0a); g.fillRect(0, 16, 48, 2); g.fillRect(0, 30, 48, 2);
    g.fillStyle(0x7a5a3a); g.fillRect(2, 18, 2, 12); g.fillRect(22, 18, 2, 12); g.fillRect(42, 18, 2, 12);
    g.fillStyle(0x3a1a0a); g.fillCircle(4, 24, 2); g.fillCircle(24, 24, 2); g.fillCircle(44, 24, 2);
    g.generateTexture('pallet_falling', 48, 32); g.clear();

    // Fence
    g.fillStyle(0x5a4a3a); g.fillRect(4, 0, 16, 64); g.fillStyle(0x6b5a48); g.fillRect(5, 0, 3, 64);
    g.fillStyle(0x4a3a2a); g.fillRect(18, 0, 2, 64); g.fillStyle(0x7a6a58); g.fillRect(2, -2, 20, 6);
    g.fillStyle(0x888888); g.fillCircle(12, 15, 2); g.fillCircle(12, 35, 2); g.fillCircle(12, 55, 2);
    g.generateTexture('fence_post', 24, 64); g.clear();
    g.fillStyle(0x5a4a3a); g.fillRect(0, 2, 64, 8); g.fillStyle(0x6b5a48); g.fillRect(0, 2, 64, 2);
    g.generateTexture('fence_rail', 64, 12); g.clear();

    // Crows
    g.fillStyle(0x1a1a1a); g.fillEllipse(24, 16, 20, 12); g.fillStyle(0x2a2a2a); g.fillEllipse(24, 15, 18, 10);
    g.fillStyle(0x3a3a3a); g.fillEllipse(24, 14, 14, 8);
    g.fillStyle(0x1a1a1a); g.fillCircle(36, 10, 8); g.fillStyle(0x2a2a2a); g.fillCircle(36, 9, 7);
    g.fillStyle(0x3a3a3a); g.fillCircle(36, 8, 5);
    g.fillStyle(0x3a3a3a); g.fillTriangle(42, 10, 50, 12, 42, 14);
    g.fillStyle(0x1a1a1a); g.fillCircle(38, 8, 3); g.fillStyle(0x4a4a4a); g.fillCircle(38, 8, 2);
    g.fillStyle(0x1a1a1a); g.fillEllipse(8, 14, 24, 10); g.fillStyle(0x2a2a2a); g.fillEllipse(8, 13, 20, 8);
    g.fillStyle(0x1a1a1a); g.fillEllipse(40, 14, 24, 10); g.fillStyle(0x2a2a2a); g.fillEllipse(40, 13, 20, 8);
    g.fillStyle(0x1a1a1a); g.fillEllipse(6, 18, 12, 6);
    g.fillStyle(0x4a4a4a); g.fillRect(20, 22, 2, 6); g.fillRect(26, 22, 2, 6);
    g.generateTexture('crow', 50, 32); g.clear();

    g.fillStyle(0x1a1a1a); g.fillEllipse(16, 20, 18, 14); g.fillStyle(0x2a2a2a); g.fillEllipse(16, 18, 16, 12);
    g.fillStyle(0x3a3a3a); g.fillEllipse(16, 16, 12, 10);
    g.fillStyle(0x1a1a1a); g.fillCircle(26, 8, 8); g.fillStyle(0x2a2a2a); g.fillCircle(26, 7, 7);
    g.fillStyle(0x3a3a3a); g.fillCircle(26, 6, 5);
    g.fillStyle(0x3a3a3a); g.fillTriangle(32, 6, 40, 8, 32, 10);
    g.fillStyle(0x1a1a1a); g.fillCircle(28, 4, 3); g.fillStyle(0x4a4a4a); g.fillCircle(28, 4, 2);
    g.fillStyle(0x1a1a1a); g.fillEllipse(6, 18, 14, 10); g.fillStyle(0x2a2a2a); g.fillEllipse(6, 17, 12, 8);
    g.fillStyle(0x1a1a1a); g.fillEllipse(26, 18, 14, 10); g.fillStyle(0x2a2a2a); g.fillEllipse(26, 17, 12, 8);
    g.fillStyle(0x1a1a1a); g.fillEllipse(2, 24, 8, 6);
    g.fillStyle(0x4a4a4a); g.fillRect(14, 28, 2, 8); g.fillRect(20, 28, 2, 8);
    g.fillRect(12, 34, 6, 2); g.fillRect(18, 34, 6, 2);
    g.generateTexture('crow_sitting', 42, 40); g.clear();

    // Generator
    g.fillStyle(0x252530); g.fillRect(4, 18, 56, 58); g.fillStyle(0x2d2d38); g.fillRect(6, 20, 52, 54);
    g.fillStyle(0x353542); g.fillRect(8, 22, 48, 50);
    g.fillStyle(0x1a1a22); g.fillRect(8, 22, 48, 2); g.fillRect(8, 22, 2, 50);
    g.fillStyle(0x404050); g.fillRect(54, 22, 2, 50); g.fillRect(8, 68, 48, 2);
    g.fillStyle(0x2a2a35); g.fillRect(12, 24, 3, 46); g.fillRect(49, 24, 3, 46);
    g.fillRect(14, 32, 36, 2); g.fillRect(14, 48, 36, 2); g.fillRect(14, 62, 36, 2);
    g.fillStyle(0x1a1a20); g.fillRect(14, 26, 36, 8); g.fillStyle(0x252530); g.fillRect(15, 27, 34, 6);
    for (var i = 0; i < 6; i++) { g.fillStyle(0x353540); g.fillRect(16+i*5, 27, 3, 6); g.fillStyle(0x151518); g.fillRect(16+i*5, 28, 3, 2); }
    g.fillStyle(0x1a1a20); g.fillRect(14, 36, 36, 8); g.fillStyle(0x252530); g.fillRect(15, 37, 34, 6);
    for (var i = 0; i < 6; i++) { g.fillStyle(0x353540); g.fillRect(16+i*5, 37, 3, 6); g.fillStyle(0x151518); g.fillRect(16+i*5, 38, 3, 2); }
    g.fillStyle(0x1a1a20); g.fillRect(14, 46, 36, 8); g.fillStyle(0x252530); g.fillRect(15, 47, 34, 6);
    for (var i = 0; i < 6; i++) { g.fillStyle(0x353540); g.fillRect(16+i*5, 47, 3, 6); g.fillStyle(0x151518); g.fillRect(16+i*5, 48, 3, 2); }
    g.fillStyle(0x303038); g.fillRect(12, 56, 28, 18); g.fillStyle(0x383840); g.fillRect(13, 57, 26, 16);
    g.fillStyle(0x404048); g.fillRect(14, 58, 24, 14);
    g.fillStyle(0x5a5a62); g.fillCircle(15, 59, 2); g.fillCircle(37, 59, 2); g.fillCircle(15, 71, 2); g.fillCircle(37, 71, 2);
    g.fillStyle(0x00ff44); g.fillCircle(20, 63, 4); g.fillStyle(0x00dd33); g.fillCircle(20, 63, 3);
    g.fillStyle(0xff2222); g.fillCircle(30, 63, 4); g.fillStyle(0xcc1111); g.fillCircle(30, 63, 3);
    g.fillStyle(0xffff00); g.fillCircle(20, 69, 2); g.fillStyle(0x00ff00); g.fillCircle(26, 69, 2); g.fillStyle(0xff8800); g.fillCircle(32, 69, 2);
    g.fillStyle(0x1a1a1a); g.fillRect(22, 66, 6, 4); g.fillStyle(0x252525); g.fillRect(23, 67, 4, 2);
    g.fillStyle(0x1a1a20); g.fillRect(42, 56, 5, 18); g.fillStyle(0x8B0000); g.fillRect(43, 57, 3, 6);
    g.fillStyle(0x00aa00); g.fillRect(43, 64, 3, 4); g.fillStyle(0x0066aa); g.fillRect(43, 69, 3, 5);
    g.fillStyle(0x2a2a30); g.fillRect(41, 55, 8, 4); g.fillRect(41, 71, 8, 4);
    g.fillStyle(0x2a2a32); g.fillRect(48, 30, 10, 32); g.fillStyle(0x323238); g.fillRect(49, 31, 8, 30);
    g.fillStyle(0x4a4a52); g.fillCircle(53, 34, 4); g.fillStyle(0x3a3a42); g.fillCircle(53, 34, 3);
    g.fillStyle(0x1a1a20); g.fillRect(50, 40, 6, 18); g.fillStyle(0x00aa44); g.fillRect(51, 42, 4, 12);
    g.fillStyle(0x3a3a40); g.fillRect(4, 40, 6, 20); g.fillStyle(0x4a4a50); g.fillRect(4, 40, 6, 2);
    g.fillStyle(0x2a2a30); g.fillRect(2, 38, 10, 4);
    g.fillStyle(0x5a5a62); g.fillCircle(10, 24, 3); g.fillCircle(54, 24, 3); g.fillCircle(10, 68, 3); g.fillCircle(54, 68, 3);
    g.fillStyle(0x4a3a2a, 0.4); g.fillCircle(52, 62, 5); g.fillStyle(0x3a2a1a, 0.3); g.fillCircle(20, 70, 4);
    g.fillStyle(0xffcc00); g.fillRect(16, 58, 14, 6); g.fillStyle(0x1a1a1a); g.fillRect(18, 60, 2, 2);
    g.fillRect(22, 60, 2, 2); g.fillRect(26, 60, 2, 2);
    g.fillStyle(0x4a4a52); g.fillRect(44, 50, 8, 3); g.fillStyle(0x5a5a62); g.fillRect(44, 50, 8, 1);
    g.generateTexture('gen', 64, 80); g.clear();

    // Gen pole
    g.fillStyle(0x3a3a42); g.fillRect(28, 0, 8, 54); g.fillStyle(0x4a4a52); g.fillRect(29, 0, 3, 54);
    g.fillStyle(0x353540); g.fillRect(32, 0, 3, 54);
    g.fillStyle(0x2a2a32); g.fillRect(28, 0, 1, 54); g.fillRect(35, 0, 1, 54);
    g.fillStyle(0x4a4a52); g.fillRect(22, 48, 20, 8); g.fillStyle(0x5a5a62); g.fillRect(24, 48, 16, 6);
    g.fillStyle(0x6a6a72); g.fillCircle(26, 50, 2); g.fillCircle(38, 50, 2); g.fillCircle(26, 54, 2); g.fillCircle(38, 54, 2);
    g.fillStyle(0x5a3a2a, 0.5); g.fillRect(29, 16, 2, 14); g.fillStyle(0x5a3a2a, 0.4); g.fillRect(30, 32, 2, 10);
    g.fillStyle(0x4a4a52); g.fillRect(24, 0, 16, 6); g.fillStyle(0x5a5a62); g.fillRect(26, 1, 12, 4);
    g.fillStyle(0x6a6a72); g.fillCircle(28, 3, 2); g.fillCircle(36, 3, 2);
    g.generateTexture('gen_pole', 64, 60); g.clear();

    // Gen light
    g.fillStyle(0x3a3a40); g.fillRect(16, 0, 32, 18); g.fillStyle(0x454550); g.fillRect(18, 2, 28, 14);
    g.fillStyle(0x404048); g.fillRect(18, 2, 28, 4);
    g.fillStyle(0x353540); g.fillRect(16, 0, 2, 18); g.fillRect(46, 0, 2, 18);
    g.fillStyle(0x4a4a52); g.fillRect(28, 14, 8, 6); g.fillStyle(0x5a5a62); g.fillRect(29, 15, 6, 4);
    g.fillStyle(0x2a2a30); g.fillEllipse(32, 10, 24, 10); g.fillStyle(0x353540); g.fillEllipse(32, 10, 22, 8);
    g.fillStyle(0x4a4a52); g.fillEllipse(32, 10, 18, 6);
    g.fillStyle(0xffee88); g.fillCircle(32, 10, 7); g.fillStyle(0xffdd66); g.fillCircle(32, 10, 5);
    g.fillStyle(0xffeeaa); g.fillCircle(31, 9, 3); g.fillStyle(0xffffcc); g.fillCircle(30, 8, 1.5);
    g.fillStyle(0x5a5a62); g.fillRect(29, 15, 6, 4); g.fillStyle(0x4a4a52); g.fillRect(30, 16, 4, 3);
    g.fillStyle(0x3a3a42); g.fillRect(31, 17, 2, 2);
    g.fillStyle(0x2a2a30); g.fillRect(18, 14, 10, 2); g.fillRect(36, 14, 10, 2);
    g.fillStyle(0xffee88, 0.4); g.fillCircle(32, 10, 12); g.fillStyle(0xffee88, 0.2); g.fillCircle(32, 10, 16);
    g.generateTexture('gen_light', 64, 24); g.clear();

    // Hook
    g.fillStyle(0x2a2a30); g.fillRect(14, 18, 6, 46); g.fillStyle(0x3a3a42); g.fillRect(15, 18, 2, 46);
    g.fillStyle(0x4a4a52); g.fillRect(10, 58, 14, 6); g.fillStyle(0x3a3a42); g.fillRect(10, 58, 14, 2);
    g.fillStyle(0x5a3020, 0.6); g.fillCircle(12, 62, 2); g.fillCircle(20, 61, 1.5);
    g.fillStyle(0x555560); g.fillRect(14, 4, 5, 16);
    g.fillStyle(0x606068); g.fillCircle(18, 14, 6); g.fillStyle(0x505058); g.fillCircle(18, 14, 4);
    g.fillStyle(0x4a4a52); g.fillRect(14, 8, 5, 6);
    g.fillStyle(0x4a4a52); g.fillRect(12, 8, 6, 6); g.fillStyle(0x5a5a62); g.fillRect(12, 8, 6, 2);
    g.fillStyle(0x4a4a52); g.fillCircle(13, 10, 3); g.fillStyle(0x5a5a62); g.fillCircle(12, 9, 1.5);
    g.fillStyle(0x484850); g.fillCircle(17, 2, 3); g.fillStyle(0x585860); g.fillCircle(17, 2, 2);
    g.fillStyle(0x888890, 0.4); g.fillRect(15, 20, 1, 40); g.fillStyle(0x707078, 0.3); g.fillCircle(16, 12, 2);
    g.fillStyle(0x6a3a28, 0.4); g.fillRect(14, 30, 2, 8); g.fillStyle(0x6a3a28, 0.3); g.fillRect(15, 42, 1, 6);
    g.generateTexture('hook', 32, 64); g.clear();

    // Gate
    g.fillStyle(0x5a3a1a); g.fillRect(0, 0, 32, 64);
    g.fillStyle(0x7a5a3a); g.fillRect(2, 2, 13, 60); g.fillRect(17, 2, 13, 60);
    g.fillStyle(0x444450); g.fillRect(0, 10, 32, 4); g.fillRect(0, 50, 32, 4);
    g.generateTexture('gate', 32, 64); g.clear();

    // Hatch
    g.fillStyle(0x3a3a30); g.fillCircle(20, 20, 20); g.fillStyle(0x5a5a4a); g.fillCircle(20, 20, 17);
    g.fillStyle(0x1a1a10); g.fillCircle(20, 20, 10);
    g.generateTexture('hatch', 40, 40); g.clear();

    // Pallet
    g.fillStyle(0x5a3a1a); g.fillRect(4, 0, 24, 48); g.fillStyle(0x6a4a2a); g.fillRect(6, 2, 20, 44);
    g.fillStyle(0x4a2a0a); g.fillRect(4, 0, 2, 48); g.fillRect(26, 0, 2, 48);
    g.fillStyle(0x7a5a3a); g.fillRect(6, 2, 20, 2); g.fillRect(6, 22, 20, 2); g.fillRect(6, 42, 20, 2);
    g.fillStyle(0x3a1a0a); g.fillCircle(16, 4, 2); g.fillCircle(16, 24, 2); g.fillCircle(16, 44, 2);
    g.generateTexture('pallet', 32, 48); g.clear();

    // Pallet fallen
    g.fillStyle(0x5a3a1a); g.fillRect(0, 16, 48, 16); g.fillStyle(0x6a4a2a); g.fillRect(2, 18, 44, 12);
    g.fillStyle(0x4a2a0a); g.fillRect(0, 16, 48, 2); g.fillRect(0, 30, 48, 2);
    g.fillStyle(0x7a5a3a); g.fillRect(2, 18, 2, 12); g.fillRect(22, 18, 2, 12); g.fillRect(42, 18, 2, 12);
    g.fillStyle(0x3a1a0a); g.fillCircle(4, 24, 2); g.fillCircle(24, 24, 2); g.fillCircle(44, 24, 2);
    g.generateTexture('pallet_falling', 48, 32); g.clear();

    // Trees
    g.fillStyle(0x000000, 0.3); g.fillEllipse(35, 100, 20, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(30, 60, 10, 40);
    g.fillStyle(0x4a3a2a); g.fillRect(30, 60, 4, 40);
    g.fillStyle(0x1a3a1a); g.fillCircle(35, 40, 25);
    g.fillStyle(0x2a4a2a); g.fillCircle(35, 35, 22);
    g.fillStyle(0x3a5a3a); g.fillCircle(35, 30, 18);
    g.fillStyle(0x4a6a4a); g.fillCircle(30, 25, 12);
    g.fillStyle(0x2a4a2a); g.fillCircle(42, 45, 10);
    g.generateTexture('tree0', 70, 100); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(35, 100, 20, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(30, 60, 10, 40);
    g.fillStyle(0x4a3a2a); g.fillRect(30, 60, 4, 40);
    g.fillStyle(0x1a4a1a); g.fillCircle(35, 40, 25);
    g.fillStyle(0x2a5a2a); g.fillCircle(35, 35, 22);
    g.fillStyle(0x3a6a3a); g.fillCircle(35, 30, 18);
    g.fillStyle(0x4a7a4a); g.fillCircle(28, 25, 12);
    g.fillStyle(0x2a5a2a); g.fillCircle(44, 45, 10);
    g.generateTexture('tree1', 70, 100); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(35, 100, 20, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(30, 60, 10, 40);
    g.fillStyle(0x4a3a2a); g.fillRect(30, 60, 4, 40);
    g.fillStyle(0x1a3a2a); g.fillCircle(35, 40, 25);
    g.fillStyle(0x2a4a3a); g.fillCircle(35, 35, 22);
    g.fillStyle(0x3a5a4a); g.fillCircle(35, 30, 18);
    g.fillStyle(0x4a6a5a); g.fillCircle(32, 25, 12);
    g.fillStyle(0x2a4a3a); g.fillCircle(40, 45, 10);
    g.generateTexture('tree2', 70, 100); g.clear();

    // Pine trees
    g.fillStyle(0x000000, 0.3); g.fillEllipse(25, 95, 16, 8);
    g.fillStyle(0x3a2a1a); g.fillRect(22, 70, 6, 25);
    g.fillStyle(0x1a3a1a); g.fillTriangle(25, 10, 5, 50, 45, 50);
    g.fillStyle(0x2a4a2a); g.fillTriangle(25, 15, 10, 45, 40, 45);
    g.fillStyle(0x3a5a3a); g.fillTriangle(25, 20, 15, 40, 35, 40);
    g.fillStyle(0x4a6a4a); g.fillTriangle(25, 25, 18, 35, 32, 35);
    g.generateTexture('pine_tree', 50, 95); g.clear();

    // Small trees
    g.fillStyle(0x000000, 0.3); g.fillEllipse(20, 80, 14, 6);
    g.fillStyle(0x3a2a1a); g.fillRect(18, 50, 4, 30);
    g.fillStyle(0x1a3a1a); g.fillCircle(20, 35, 18);
    g.fillStyle(0x2a4a2a); g.fillCircle(20, 30, 15);
    g.fillStyle(0x3a5a3a); g.fillCircle(20, 25, 12);
    g.generateTexture('tree_small', 40, 80); g.clear();

    // Bushes
    g.fillStyle(0x000000, 0.3); g.fillEllipse(30, 45, 50, 12);
    g.fillStyle(0x1a3a1a); g.fillCircle(20, 30, 18); g.fillCircle(40, 28, 16);
    g.fillStyle(0x2a4a2a); g.fillCircle(30, 25, 20); g.fillCircle(15, 35, 12);
    g.fillStyle(0x3a5a3a); g.fillCircle(25, 20, 14); g.fillCircle(45, 32, 10);
    g.fillStyle(0x4a6a4a); g.fillCircle(30, 18, 10); g.fillCircle(38, 22, 8);
    g.generateTexture('bush', 60, 45); g.clear();

    // Tall grass
    g.fillStyle(0x2a4a1a); g.fillRect(5, 20, 3, 20); g.fillRect(12, 15, 3, 25);
    g.fillRect(20, 18, 3, 22); g.fillRect(28, 12, 3, 28); g.fillRect(36, 20, 3, 20);
    g.fillRect(44, 16, 3, 24);
    g.fillStyle(0x3a5a2a); g.fillRect(5, 18, 3, 2); g.fillRect(12, 13, 3, 2);
    g.fillRect(20, 16, 3, 2); g.fillRect(28, 10, 3, 2); g.fillRect(36, 18, 3, 2);
    g.fillRect(44, 14, 3, 2);
    g.fillStyle(0x1a3a0a); g.fillRect(8, 25, 2, 15); g.fillRect(16, 22, 2, 18);
    g.fillRect(24, 24, 2, 16); g.fillRect(32, 20, 2, 20); g.fillRect(40, 26, 2, 14);
    g.generateTexture('tall_grass', 50, 40); g.clear();

    // Flower patches
    g.fillStyle(0x2a4a1a); g.fillEllipse(26, 25, 40, 20);
    g.fillStyle(0x3a5a2a); g.fillEllipse(26, 22, 36, 16);
    g.fillStyle(0xff4444); g.fillCircle(12, 18, 3); g.fillCircle(30, 14, 3);
    g.fillStyle(0xffff44); g.fillCircle(22, 20, 3); g.fillCircle(40, 22, 3);
    g.fillStyle(0xff44ff); g.fillCircle(18, 26, 3); g.fillCircle(35, 28, 3);
    g.fillStyle(0xffffff); g.fillCircle(12, 18, 1.5); g.fillCircle(30, 14, 1.5);
    g.fillCircle(22, 20, 1.5); g.fillCircle(40, 22, 1.5);
    g.generateTexture('flower_patch', 52, 35); g.clear();

    // Rocks
    g.fillStyle(0x000000, 0.3); g.fillEllipse(28, 45, 40, 14);
    g.fillStyle(0x4a4a4a); g.fillCircle(28, 28, 18);
    g.fillStyle(0x5a5a5a); g.fillCircle(28, 26, 15);
    g.fillStyle(0x6a6a6a); g.fillCircle(26, 24, 12);
    g.fillStyle(0x7a7a7a); g.fillCircle(24, 22, 8);
    g.fillStyle(0x8a8a8a); g.fillCircle(22, 20, 5);
    g.fillStyle(0x3a3a3a); g.fillCircle(40, 32, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(40, 30, 8);
    g.fillStyle(0x3a3a3a); g.fillCircle(16, 30, 8);
    g.generateTexture('rock_detailed', 56, 45); g.clear();

    // Stones
    g.fillStyle(0x000000, 0.3); g.fillEllipse(20, 38, 30, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(20, 20, 16);
    g.fillStyle(0x5a5a5a); g.fillCircle(20, 18, 13);
    g.fillStyle(0x6a6a6a); g.fillCircle(18, 16, 10);
    g.fillStyle(0x7a7a7a); g.fillCircle(16, 14, 6);
    g.generateTexture('stone1', 40, 38); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(19, 34, 28, 8);
    g.fillStyle(0x4a4a4a); g.fillCircle(19, 18, 14);
    g.fillStyle(0x5a5a5a); g.fillCircle(19, 16, 11);
    g.fillStyle(0x6a6a6a); g.fillCircle(17, 14, 8);
    g.generateTexture('stone2', 38, 34); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(18, 28, 26, 8);
    g.fillStyle(0x4a4a4a); g.fillCircle(18, 16, 12);
    g.fillStyle(0x5a5a5a); g.fillCircle(18, 14, 9);
    g.fillStyle(0x6a6a6a); g.fillCircle(16, 12, 6);
    g.generateTexture('stone3', 36, 28); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(24, 30, 36, 10);
    g.fillStyle(0x4a4a4a); g.fillCircle(24, 18, 18);
    g.fillStyle(0x5a5a5a); g.fillCircle(24, 16, 15);
    g.fillStyle(0x6a6a6a); g.fillCircle(22, 14, 10);
    g.generateTexture('stone4', 48, 30); g.clear();

    g.fillStyle(0x000000, 0.3); g.fillEllipse(14, 28, 20, 8);
    g.fillStyle(0x4a4a4a); g.fillCircle(14, 16, 10);
    g.fillStyle(0x5a5a5a); g.fillCircle(14, 14, 8);
    g.fillStyle(0x6a6a6a); g.fillCircle(12, 12, 5);
    g.generateTexture('stone5', 28, 28); g.clear();

    // Brick wall
    // Brick wall - loaded from texture
    // (no generateTexture needed, loaded in preload)

    // Killer
    g.fillStyle(0x000000, 0.5); g.fillEllipse(45, 120, 58, 18);
    g.fillStyle(0x0a0a0a); g.fillRect(20, 100, 18, 18); g.fillStyle(0x151515); g.fillRect(20, 100, 5, 18);
    g.fillStyle(0x080808); g.fillRect(18, 114, 22, 6); g.fillStyle(0x0a0a0a); g.fillCircle(28, 110, 7);
    g.fillStyle(0x0a0a0a); g.fillRect(52, 100, 18, 18); g.fillStyle(0x151515); g.fillRect(52, 100, 5, 18);
    g.fillStyle(0x080808); g.fillRect(50, 114, 22, 6); g.fillStyle(0x0a0a0a); g.fillCircle(60, 110, 7);
    g.fillStyle(0x0d0d0d); g.fillRect(22, 72, 16, 32); g.fillStyle(0x1a1a1a); g.fillRect(22, 72, 5, 32);
    g.fillStyle(0x0d0d0d); g.fillRect(52, 72, 16, 32); g.fillStyle(0x1a1a1a); g.fillRect(52, 72, 5, 32);
    g.fillStyle(0x1a1a1a); g.fillRect(18, 68, 54, 8); g.fillStyle(0x252525); g.fillRect(18, 68, 54, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(38, 66, 14, 12); g.fillStyle(0x4a4a4a); g.fillRect(40, 68, 10, 8);
    g.fillStyle(0x3a3a3a); g.fillCircle(45, 72, 3);
    g.fillStyle(0x2a2a2a); g.fillCircle(40, 66, 2); g.fillCircle(50, 66, 2); g.fillCircle(45, 64, 2);
    g.fillStyle(0x0d0d0d); g.fillRect(10, 34, 70, 38); g.fillStyle(0x151515); g.fillRect(10, 34, 12, 38);
    g.fillStyle(0x1a1a1a); g.fillRect(68, 34, 12, 38);
    g.fillStyle(0x2a2a2a); g.fillCircle(8, 36, 6); g.fillStyle(0x3a3a3a); g.fillCircle(8, 35, 4);
    g.fillStyle(0x2a2a2a); g.fillCircle(82, 36, 6); g.fillStyle(0x3a3a3a); g.fillCircle(82, 35, 4);
    g.fillStyle(0x0d0d0d); g.fillRect(-8, 36, 18, 26); g.fillStyle(0x151515); g.fillRect(-8, 36, 5, 26);
    g.fillStyle(0x0d0d0d); g.fillRect(-14, 58, 20, 16); g.fillStyle(0x151515); g.fillRect(-14, 58, 5, 16);
    g.fillStyle(0x0a0a0a); g.fillRect(-18, 70, 14, 16); g.fillStyle(0x151515); g.fillRect(-18, 70, 4, 16);
    g.fillStyle(0x0a0a0a); g.fillCircle(-10, 84, 8); g.fillStyle(0x151515); g.fillCircle(-11, 83, 6);
    g.fillStyle(0x8a8a8a); g.fillRect(-30, 72, 28, 6); g.fillStyle(0x9a9a9a); g.fillRect(-30, 72, 28, 2);
    g.fillStyle(0x7a7a7a); g.fillRect(-30, 76, 28, 2); g.fillStyle(0xaaaaaa); g.fillRect(-28, 73, 24, 1);
    g.fillStyle(0x8a8a8a); g.fillTriangle(-2, 72, -2, 78, -8, 75);
    g.fillStyle(0x8B0000, 0.8); g.fillRect(-26, 73, 4, 2); g.fillStyle(0xaa2222, 0.6); g.fillRect(-20, 74, 2, 2);
    g.fillStyle(0x2a1a0a); g.fillRect(-42, 72, 14, 6); g.fillStyle(0x3a2a1a); g.fillRect(-42, 72, 14, 2);
    g.fillStyle(0x1a0a0a); g.fillRect(-40, 73, 3, 4); g.fillRect(-34, 73, 3, 4); g.fillRect(-28, 73, 3, 4);
    g.fillStyle(0x4a4a4a); g.fillRect(-44, 70, 4, 10); g.fillStyle(0x5a5a5a); g.fillRect(-44, 70, 2, 10);
    g.fillStyle(0x0d0d0d); g.fillRect(72, 36, 18, 26); g.fillStyle(0x151515); g.fillRect(82, 36, 5, 26);
    g.fillStyle(0x0d0d0d); g.fillRect(74, 20, 16, 20); g.fillStyle(0x151515); g.fillRect(74, 20, 4, 20);
    g.fillStyle(0x0a0a0a); g.fillRect(76, 6, 14, 16); g.fillStyle(0x151515); g.fillRect(76, 6, 4, 16);
    g.fillStyle(0x0a0a0a); g.fillCircle(84, 18, 8); g.fillStyle(0x151515); g.fillCircle(83, 17, 6);
    g.fillStyle(0x0a0a0a); g.fillRect(74, 0, 4, 10); g.fillRect(80, -2, 4, 12);
    g.fillRect(86, 0, 4, 10); g.fillRect(92, 2, 4, 8);
    g.fillStyle(0x2a2a2a); g.fillRect(36, 26, 18, 12); g.fillStyle(0x3a3a3a); g.fillRect(36, 26, 5, 12);
    g.fillStyle(0xd4c4a8); g.fillCircle(45, 10, 22); g.fillStyle(0xe4d4b8); g.fillCircle(45, 8, 20);
    g.fillStyle(0xf4e4c8); g.fillCircle(45, 6, 18);
    g.fillStyle(0xc4b498); g.fillRect(28, 2, 34, 20); g.fillStyle(0xb4a488); g.fillRect(30, 4, 30, 16);
    g.fillStyle(0x8a7a68, 0.5); g.fillRect(45, -8, 2, 28); g.fillRect(28, 10, 34, 2);
    g.fillStyle(0x000000); g.fillRect(30, 4, 12, 10); g.fillStyle(0x0a0a0a); g.fillRect(32, 6, 8, 6);
    g.fillStyle(0xff0000); g.fillCircle(36, 9, 3); g.fillStyle(0xff3333); g.fillCircle(36, 8, 2);
    g.fillStyle(0x000000); g.fillRect(48, 4, 12, 10); g.fillStyle(0x0a0a0a); g.fillRect(50, 6, 8, 6);
    g.fillStyle(0xff0000); g.fillCircle(54, 9, 3); g.fillStyle(0xff3333); g.fillCircle(54, 8, 2);
    g.fillStyle(0x4a2a1a); g.fillRect(34, 18, 22, 4); g.fillStyle(0x3a1a0a); g.fillRect(34, 18, 22, 2);
    for (var i = 0; i < 6; i++) { g.fillStyle(0x2a1a0a); g.fillRect(36+i*3, 18, 2, 6); }
    g.fillStyle(0x1a0a0a); g.fillCircle(36, 20, 1.5); g.fillCircle(42, 20, 1.5); g.fillCircle(48, 20, 1.5);
    g.fillStyle(0x5a3a2a, 0.5); g.fillRect(30, 14, 4, 8); g.fillRect(56, 14, 4, 8);
    g.fillStyle(0x4a2a1a, 0.4); g.fillCircle(32, 24, 3); g.fillCircle(58, 24, 3);
    g.fillStyle(0x5a4a3a, 0.3); g.fillRect(40, 2, 10, 2);
    g.fillStyle(0x2a2a2a); g.fillCircle(45, -4, 3); g.fillCircle(38, -2, 2.5); g.fillCircle(52, -2, 2.5);
    g.fillStyle(0x1a1a1a); g.fillCircle(45, -4, 2); g.fillCircle(38, -2, 1.5); g.fillCircle(52, -2, 1.5);
    g.generateTexture('killer', 90, 125); g.clear();

    // Killer strike
    g.fillStyle(0x000000, 0.5); g.fillEllipse(45, 120, 58, 18);
    g.fillStyle(0x0a0a0a); g.fillRect(20, 100, 18, 18); g.fillStyle(0x151515); g.fillRect(20, 100, 5, 18);
    g.fillStyle(0x080808); g.fillRect(18, 114, 22, 6); g.fillStyle(0x0a0a0a); g.fillCircle(28, 110, 7);
    g.fillStyle(0x0a0a0a); g.fillRect(52, 100, 18, 18); g.fillStyle(0x151515); g.fillRect(52, 100, 5, 18);
    g.fillStyle(0x080808); g.fillRect(50, 114, 22, 6); g.fillStyle(0x0a0a0a); g.fillCircle(60, 110, 7);
    g.fillStyle(0x0d0d0d); g.fillRect(22, 72, 16, 32); g.fillStyle(0x1a1a1a); g.fillRect(22, 72, 5, 32);
    g.fillStyle(0x0d0d0d); g.fillRect(52, 72, 16, 32); g.fillStyle(0x1a1a1a); g.fillRect(52, 72, 5, 32);
    g.fillStyle(0x1a1a1a); g.fillRect(18, 68, 54, 8); g.fillStyle(0x252525); g.fillRect(18, 68, 54, 3);
    g.fillStyle(0x3a3a3a); g.fillRect(38, 66, 14, 12); g.fillStyle(0x4a4a4a); g.fillRect(40, 68, 10, 8);
    g.fillStyle(0x3a3a3a); g.fillCircle(45, 72, 3);
    g.fillStyle(0x2a2a2a); g.fillCircle(40, 66, 2); g.fillCircle(50, 66, 2); g.fillCircle(45, 64, 2);
    g.fillStyle(0x0d0d0d); g.fillRect(10, 34, 70, 38); g.fillStyle(0x151515); g.fillRect(10, 34, 12, 38);
    g.fillStyle(0x1a1a1a); g.fillRect(68, 34, 12, 38);
    g.fillStyle(0x2a2a2a); g.fillCircle(8, 36, 6); g.fillStyle(0x3a3a3a); g.fillCircle(8, 35, 4);
    g.fillStyle(0x2a2a2a); g.fillCircle(82, 36, 6); g.fillStyle(0x3a3a3a); g.fillCircle(82, 35, 4);
    g.fillStyle(0x0d0d0d); g.fillRect(-8, 36, 18, 26); g.fillStyle(0x151515); g.fillRect(-8, 36, 5, 26);
    g.fillStyle(0x0d0d0d); g.fillRect(-14, 58, 20, 16); g.fillStyle(0x151515); g.fillRect(-14, 58, 5, 16);
    g.fillStyle(0x0a0a0a); g.fillRect(-18, 70, 14, 16); g.fillStyle(0x151515); g.fillRect(-18, 70, 4, 16);
    g.fillStyle(0x0a0a0a); g.fillCircle(-10, 84, 8); g.fillStyle(0x151515); g.fillCircle(-11, 83, 6);
    g.fillStyle(0x8a8a8a); g.fillRect(-30, 72, 28, 6); g.fillStyle(0x9a9a9a); g.fillRect(-30, 72, 28, 2);
    g.fillStyle(0x7a7a7a); g.fillRect(-30, 76, 28, 2); g.fillStyle(0xaaaaaa); g.fillRect(-28, 73, 24, 1);
    g.fillStyle(0x8a8a8a); g.fillTriangle(-2, 72, -2, 78, -8, 75);
    g.fillStyle(0x8B0000, 0.8); g.fillRect(-26, 73, 4, 2); g.fillStyle(0xaa2222, 0.6); g.fillRect(-20, 74, 2, 2);
    g.fillStyle(0x2a1a0a); g.fillRect(-42, 72, 14, 6); g.fillStyle(0x3a2a1a); g.fillRect(-42, 72, 14, 2);
    g.fillStyle(0x1a0a0a); g.fillRect(-40, 73, 3, 4); g.fillRect(-34, 73, 3, 4); g.fillRect(-28, 73, 3, 4);
    g.fillStyle(0x4a4a4a); g.fillRect(-44, 70, 4, 10); g.fillStyle(0x5a5a5a); g.fillRect(-44, 70, 2, 10);
    g.fillStyle(0x0d0d0d); g.fillRect(72, 36, 18, 26); g.fillStyle(0x151515); g.fillRect(82, 36, 5, 26);
    g.fillStyle(0x0d0d0d); g.fillRect(74, 20, 16, 20); g.fillStyle(0x151515); g.fillRect(74, 20, 4, 20);
    g.fillStyle(0x0a0a0a); g.fillRect(76, 6, 14, 16); g.fillStyle(0x151515); g.fillRect(76, 6, 4, 16);
    g.fillStyle(0x0a0a0a); g.fillCircle(84, 18, 8); g.fillStyle(0x151515); g.fillCircle(83, 17, 6);
    g.fillStyle(0x0a0a0a); g.fillRect(74, 0, 4, 10); g.fillRect(80, -2, 4, 12);
    g.fillRect(86, 0, 4, 10); g.fillRect(92, 2, 4, 8);
    g.fillStyle(0x2a2a2a); g.fillRect(36, 26, 18, 12); g.fillStyle(0x3a3a3a); g.fillRect(36, 26, 5, 12);
    g.fillStyle(0xd4c4a8); g.fillCircle(45, 10, 22); g.fillStyle(0xe4d4b8); g.fillCircle(45, 8, 20);
    g.fillStyle(0xf4e4c8); g.fillCircle(45, 6, 18);
    g.fillStyle(0xc4b498); g.fillRect(28, 2, 34, 20); g.fillStyle(0xb4a488); g.fillRect(30, 4, 30, 16);
    g.fillStyle(0x8a7a68, 0.5); g.fillRect(45, -8, 2, 28); g.fillRect(28, 10, 34, 2);
    g.fillStyle(0x000000); g.fillRect(30, 4, 12, 10); g.fillStyle(0x0a0a0a); g.fillRect(32, 6, 8, 6);
    g.fillStyle(0xff0000); g.fillCircle(36, 9, 3); g.fillStyle(0xff3333); g.fillCircle(36, 8, 2);
    g.fillStyle(0x000000); g.fillRect(48, 4, 12, 10); g.fillStyle(0x0a0a0a); g.fillRect(50, 6, 8, 6);
    g.fillStyle(0xff0000); g.fillCircle(54, 9, 3); g.fillStyle(0xff3333); g.fillCircle(54, 8, 2);
    g.fillStyle(0x4a2a1a); g.fillRect(34, 18, 22, 4); g.fillStyle(0x3a1a0a); g.fillRect(34, 18, 22, 2);
    for (var i = 0; i < 6; i++) { g.fillStyle(0x2a1a0a); g.fillRect(36+i*3, 18, 2, 6); }
    g.fillStyle(0x1a0a0a); g.fillCircle(36, 20, 1.5); g.fillCircle(42, 20, 1.5); g.fillCircle(48, 20, 1.5);
    g.fillStyle(0x5a3a2a, 0.5); g.fillRect(30, 14, 4, 8); g.fillRect(56, 14, 4, 8);
    g.fillStyle(0x4a2a1a, 0.4); g.fillCircle(32, 24, 3); g.fillCircle(58, 24, 3);
    g.fillStyle(0x5a4a3a, 0.3); g.fillRect(40, 2, 10, 2);
    g.fillStyle(0x2a2a2a); g.fillCircle(45, -4, 3); g.fillCircle(38, -2, 2.5); g.fillCircle(52, -2, 2.5);
    g.fillStyle(0x1a1a1a); g.fillCircle(45, -4, 2); g.fillCircle(38, -2, 1.5); g.fillCircle(52, -2, 1.5);
    // Strike effect - red slash
    g.fillStyle(0xff0000, 0.6); g.fillRect(0, 40, 90, 8);
    g.fillStyle(0xff4444, 0.4); g.fillRect(0, 36, 90, 16);
    g.fillStyle(0xffffff, 0.3); g.fillRect(5, 42, 80, 4);
    g.generateTexture('killer_strike', 90, 125); g.clear();

    // Survivors - detailed character sprites
    function createSurvivorTextures(name, shirtColor, hairColor) {
        // Shadow
        g.fillStyle(0x000000, 0.3); g.fillEllipse(36, 120, 40, 12);
        // Legs
        g.fillStyle(0x1a1a2a); g.fillRect(22, 96, 12, 24); g.fillRect(38, 96, 12, 24);
        g.fillStyle(0x2a2a3a); g.fillRect(22, 96, 4, 24); g.fillRect(38, 96, 4, 24);
        // Shoes
        g.fillStyle(0x111122); g.fillRect(20, 116, 16, 6); g.fillRect(36, 116, 16, 6);
        // Body/shirt
        g.fillStyle(shirtColor); g.fillRect(18, 40, 36, 58);
        g.fillStyle(0xffffff); g.fillRect(18, 40, 36, 4); g.fillRect(18, 40, 4, 58);
        g.fillStyle(0x000000, 0.15); g.fillRect(18, 94, 36, 4);
        // Arms
        g.fillStyle(0xcc8866); g.fillRect(14, 42, 8, 20); g.fillRect(50, 42, 8, 20);
        g.fillStyle(0xcc8866); g.fillCircle(18, 64, 5); g.fillCircle(54, 64, 5);
        // Head
        g.fillStyle(0xcc8866); g.fillCircle(36, 24, 16);
        // Hair
        g.fillStyle(hairColor); g.fillCircle(36, 18, 18); g.fillRect(18, 18, 36, 8);
        // Eyes
        g.fillStyle(0x1a1a1a); g.fillCircle(30, 22, 2.5); g.fillCircle(42, 22, 2.5);
        g.fillStyle(0xffffff); g.fillCircle(30, 21.5, 1); g.fillCircle(42, 21.5, 1);
        // Mouth
        g.fillStyle(0xaa6655); g.fillRect(33, 28, 6, 2); g.fillStyle(0xcc8866); g.fillRect(34, 28, 4, 1);
        g.fillStyle(0x884433); g.fillRect(33, 31, 6, 2);
        g.generateTexture(name, 72, 125); g.clear();

        // Dying (crawling)
        g.fillStyle(0x000000, 0.3); g.fillEllipse(40, 45, 50, 14);
        g.fillStyle(shirtColor); g.fillRect(8, 28, 56, 24);
        g.fillStyle(0xffffff); g.fillRect(8, 28, 56, 3); g.fillRect(8, 28, 3, 24);
        g.fillStyle(0x000000, 0.15); g.fillRect(8, 49, 56, 3);
        g.fillStyle(0xcc8866); g.fillRect(2, 30, 10, 8); g.fillRect(60, 30, 10, 8);
        g.fillStyle(0xcc8866); g.fillCircle(6, 34, 5); g.fillCircle(66, 34, 5);
        g.fillStyle(0xcc8866); g.fillCircle(40, 38, 10);
        g.fillStyle(hairColor); g.fillCircle(40, 32, 12); g.fillRect(28, 32, 24, 6);
        g.fillStyle(0x1a1a1a); g.fillCircle(36, 36, 2); g.fillCircle(44, 36, 2);
        g.fillStyle(0x884433); g.fillRect(38, 40, 4, 1.5);
        g.generateTexture(name + '_dying', 80, 50); g.clear();

        // Carried (over shoulder)
        g.fillStyle(shirtColor); g.fillRect(12, 20, 52, 40);
        g.fillStyle(0xffffff); g.fillRect(12, 20, 52, 4); g.fillRect(12, 20, 4, 40);
        g.fillStyle(0x000000, 0.15); g.fillRect(12, 56, 52, 4);
        g.fillStyle(0xcc8866); g.fillRect(8, 22, 8, 16); g.fillRect(60, 22, 8, 16);
        g.fillStyle(0xcc8866); g.fillCircle(12, 40, 5); g.fillCircle(64, 40, 5);
        g.fillStyle(0x1a1a2a); g.fillRect(18, 58, 14, 18); g.fillRect(40, 58, 14, 18);
        g.fillStyle(0x2a2a3a); g.fillRect(18, 58, 4, 18); g.fillRect(40, 58, 4, 18);
        g.fillStyle(0x111122); g.fillRect(16, 72, 18, 6); g.fillRect(38, 72, 18, 6);
        g.fillStyle(0xcc8866); g.fillCircle(36, 12, 16);
        g.fillStyle(hairColor); g.fillCircle(36, 6, 18); g.fillRect(18, 6, 36, 8);
        g.fillStyle(0x1a1a1a); g.fillCircle(30, 10, 2.5); g.fillCircle(42, 10, 2.5);
        g.fillStyle(0xffffff); g.fillCircle(30, 9.5, 1); g.fillCircle(42, 9.5, 1);
        g.fillStyle(0x884433); g.fillRect(33, 16, 6, 2);
        g.generateTexture(name + '_carried', 76, 90); g.clear();

        // Repairing (arms raised with wrench)
        g.fillStyle(0x000000, 0.3); g.fillEllipse(36, 120, 40, 12);
        g.fillStyle(0x1a1a2a); g.fillRect(22, 96, 12, 24); g.fillRect(38, 96, 12, 24);
        g.fillStyle(0x2a2a3a); g.fillRect(22, 96, 4, 24); g.fillRect(38, 96, 4, 24);
        g.fillStyle(0x111122); g.fillRect(20, 116, 16, 6); g.fillRect(36, 116, 16, 6);
        g.fillStyle(shirtColor); g.fillRect(18, 40, 36, 58);
        g.fillStyle(0xffffff); g.fillRect(18, 40, 36, 4); g.fillRect(18, 40, 4, 58);
        g.fillStyle(0x000000, 0.15); g.fillRect(18, 94, 36, 4);
        g.fillStyle(0xcc8866); g.fillRect(14, 42, 8, 20); g.fillRect(50, 42, 8, 20);
        g.fillStyle(0xcc8866); g.fillCircle(18, 64, 5); g.fillCircle(54, 64, 5);
        // Arms raised
        g.fillStyle(0xcc8866); g.fillRect(10, 20, 8, 24); g.fillRect(54, 20, 8, 24);
        g.fillStyle(0xcc8866); g.fillCircle(14, 18, 5); g.fillCircle(58, 18, 5);
        // Wrench
        g.fillStyle(0x888888); g.fillRect(8, 10, 4, 12); g.fillStyle(0x999999); g.fillRect(8, 10, 2, 12);
        g.fillStyle(0x666666); g.fillCircle(10, 8, 4); g.fillStyle(0x777777); g.fillCircle(10, 8, 2);
        g.fillStyle(0xcc8866); g.fillCircle(36, 24, 16);
        g.fillStyle(hairColor); g.fillCircle(36, 18, 18); g.fillRect(18, 18, 36, 8);
        g.fillStyle(0x1a1a1a); g.fillCircle(30, 22, 2.5); g.fillCircle(42, 22, 2.5);
        g.fillStyle(0xffffff); g.fillCircle(30, 21.5, 1); g.fillCircle(42, 21.5, 1);
        g.fillStyle(0xaa6655); g.fillRect(33, 28, 6, 2); g.fillStyle(0xcc8866); g.fillRect(34, 28, 4, 1);
        g.fillStyle(0x884433); g.fillRect(33, 31, 6, 2);
        g.generateTexture(name + '_repair', 72, 125); g.clear();
    }

    function createPixelSurvivor(name, hairColor, shirtColor, pantsColor) {
        // Shadow
        g.fillStyle(0x000000, 0.3); g.fillRect(12, 76, 48, 8);
        // Legs
        g.fillStyle(pantsColor); g.fillRect(16, 56, 8, 20); g.fillRect(24, 56, 8, 20);
        g.fillRect(32, 56, 8, 20); g.fillRect(40, 56, 8, 20);
        // Shoes
        g.fillStyle(0x1a1a1a); g.fillRect(16, 72, 8, 4); g.fillRect(24, 72, 8, 4);
        g.fillRect(32, 72, 8, 4); g.fillRect(40, 72, 8, 4);
        // Body
        g.fillStyle(shirtColor); g.fillRect(16, 28, 32, 28);
        g.fillStyle(0xffffff); g.fillRect(16, 28, 32, 4); g.fillRect(16, 28, 4, 28);
        g.fillStyle(0x000000, 0.15); g.fillRect(16, 52, 32, 4);
        // Arms
        g.fillStyle(0xcc8866); g.fillRect(8, 32, 8, 16); g.fillRect(48, 32, 8, 16);
        g.fillStyle(0xcc8866); g.fillRect(8, 44, 8, 8); g.fillRect(48, 44, 8, 8);
        // Head
        g.fillStyle(0xcc8866); g.fillRect(20, 8, 24, 20);
        // Hair
        g.fillStyle(hairColor); g.fillRect(16, 4, 32, 12); g.fillRect(16, 4, 4, 16); g.fillRect(44, 4, 4, 16);
        // Eyes
        g.fillStyle(0x1a1a1a); g.fillRect(24, 16, 4, 4); g.fillRect(36, 16, 4, 4);
        g.fillStyle(0xffffff); g.fillRect(24, 16, 2, 2); g.fillRect(36, 16, 2, 2);
        // Mouth
        g.fillStyle(0x884433); g.fillRect(28, 24, 8, 2);
        g.generateTexture(name, 64, 80); g.clear();

        // Dying
        g.fillStyle(0x000000, 0.3); g.fillRect(8, 40, 48, 8);
        g.fillStyle(shirtColor); g.fillRect(8, 24, 48, 16);
        g.fillStyle(0xffffff); g.fillRect(8, 24, 48, 4); g.fillRect(8, 24, 4, 16);
        g.fillStyle(0x000000, 0.15); g.fillRect(8, 36, 48, 4);
        g.fillStyle(0xcc8866); g.fillRect(4, 26, 8, 8); g.fillRect(52, 26, 8, 8);
        g.fillStyle(0xcc8866); g.fillRect(16, 36, 32, 8);
        g.fillStyle(hairColor); g.fillRect(12, 32, 40, 8);
        g.fillStyle(0x1a1a1a); g.fillRect(24, 36, 4, 4); g.fillRect(36, 36, 4, 4);
        g.fillStyle(0x884433); g.fillRect(28, 40, 8, 2);
        g.generateTexture(name + '_dying', 64, 48); g.clear();

        // Carried
        g.fillStyle(shirtColor); g.fillRect(12, 16, 40, 32);
        g.fillStyle(0xffffff); g.fillRect(12, 16, 40, 4); g.fillRect(12, 16, 4, 32);
        g.fillStyle(0x000000, 0.15); g.fillRect(12, 44, 40, 4);
        g.fillStyle(0xcc8866); g.fillRect(8, 18, 8, 12); g.fillRect(48, 18, 8, 12);
        g.fillStyle(0xcc8866); g.fillRect(8, 26, 8, 8); g.fillRect(48, 26, 8, 8);
        g.fillStyle(pantsColor); g.fillRect(16, 48, 12, 16); g.fillRect(36, 48, 12, 16);
        g.fillStyle(0x1a1a1a); g.fillRect(16, 60, 12, 4); g.fillRect(36, 60, 12, 4);
        g.fillStyle(0xcc8866); g.fillRect(20, 4, 24, 12);
        g.fillStyle(hairColor); g.fillRect(16, 0, 32, 8); g.fillRect(16, 0, 4, 12); g.fillRect(44, 0, 4, 12);
        g.fillStyle(0x1a1a1a); g.fillRect(24, 8, 4, 4); g.fillRect(36, 8, 4, 4);
        g.fillStyle(0x884433); g.fillRect(28, 12, 8, 2);
        g.generateTexture(name + '_carried', 64, 68); g.clear();

        // Repairing
        g.fillStyle(0x000000, 0.3); g.fillRect(12, 76, 48, 8);
        g.fillStyle(pantsColor); g.fillRect(16, 56, 8, 20); g.fillRect(24, 56, 8, 20);
        g.fillRect(32, 56, 8, 20); g.fillRect(40, 56, 8, 20);
        g.fillStyle(0x1a1a1a); g.fillRect(16, 72, 8, 4); g.fillRect(24, 72, 8, 4);
        g.fillRect(32, 72, 8, 4); g.fillRect(40, 72, 8, 4);
        g.fillStyle(shirtColor); g.fillRect(16, 28, 32, 28);
        g.fillStyle(0xffffff); g.fillRect(16, 28, 32, 4); g.fillRect(16, 28, 4, 28);
        g.fillStyle(0x000000, 0.15); g.fillRect(16, 52, 32, 4);
        g.fillStyle(0xcc8866); g.fillRect(8, 12, 8, 20); g.fillRect(48, 12, 8, 20);
        g.fillStyle(0xcc8866); g.fillRect(8, 28, 8, 8); g.fillRect(48, 28, 8, 8);
        g.fillStyle(0x888888); g.fillRect(4, 4, 4, 12); g.fillStyle(0x999999); g.fillRect(4, 4, 2, 12);
        g.fillStyle(0x666666); g.fillRect(2, 0, 8, 8); g.fillStyle(0x777777); g.fillRect(4, 2, 4, 4);
        g.fillStyle(0xcc8866); g.fillRect(20, 8, 24, 20);
        g.fillStyle(hairColor); g.fillRect(16, 4, 32, 12); g.fillRect(16, 4, 4, 16); g.fillRect(44, 4, 4, 16);
        g.fillStyle(0x1a1a1a); g.fillRect(24, 16, 4, 4); g.fillRect(36, 16, 4, 4);
        g.fillStyle(0xffffff); g.fillRect(24, 16, 2, 2); g.fillRect(36, 16, 2, 2);
        g.fillStyle(0x884433); g.fillRect(28, 24, 8, 2);
        g.generateTexture(name + '_repair', 64, 80); g.clear();
    }

    createSurvivorTextures('s1', 0xc0392b, 0x3d2314);
    createSurvivorTextures('s2', 0x8e44ad, 0x4a3020);
    createSurvivorTextures('s3', 0x27ae60, 0x1a1a1a);
    createPixelSurvivor('s4', 0xaa00ff, 0xcc0033, 0x2a2a4a);

    g.clear();
}

// ═══════ CREATE SCENE ═══════
function create() {
    console.log('[CREATE] start, isMultiplayer:', isMultiplayer, 'roomCode:', roomCode, 'playerId:', playerId);
    scene = this;
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);

    // Tiled ground background - WebP atlas, tiles naturally
    var ground = this.add.tileSprite(MAP_W / 2, MAP_H / 2, MAP_W, MAP_H, 'ground_tile');
    ground.setTint(0x888888); // Slight darkening for horror atmosphere
    ground.setDepth(-1);
    ground.tileScaleX = 0.5;
    ground.tileScaleY = 0.5;

    staticGroup = this.physics.add.staticGroup();
    buildFence.call(this, MAP_W, MAP_H);
    var obstacles = getMapObstacles();
    obstacles.forEach(function(o) {
        if (o.solid) {
            var sp = staticGroup.create(o.x + o.sw / 2, o.y + o.sh / 2, o.t);
            sp.setDisplaySize(o.sw, o.sh); sp.refreshBody(); sp.setDepth(o.y + o.sh / 2);
        } else {
            var img = this.add.image(o.x + o.sw / 2, o.y + o.sh / 2, o.t);
            img.setDisplaySize(o.sw, o.sh); img.setDepth(o.y + o.sh / 2 + 1);
        }
    }, this);

    // Generator positions
    var allObs = getMapObstacles();
    var GEN_SIZE = 60, GEN_SAFE = 60, GEN_MIN = 300;
    function isValidGen(x, y) {
        for (var i = 0; i < allObs.length; i++) {
            var o = allObs[i];
            if (o.solid) {
                var cx = o.x + o.sw/2, cy = o.y + o.sh/2;
                if (Math.abs(x - cx) < o.sw/2 + GEN_SAFE && Math.abs(y - cy) < o.sh/2 + GEN_SAFE) return false;
            }
        }
        return true;
    }
    function nearObs(x, y) {
        for (var i = 0; i < allObs.length; i++) {
            var o = allObs[i];
            var cx = o.x + o.sw/2, cy = o.y + o.sh/2;
            if (Math.abs(x - cx) < Math.max(o.sw, o.sh) + 150 && Math.abs(y - cy) < Math.max(o.sw, o.sh) + 150) return true;
        }
        return false;
    }
    function genPositions(count) {
        var pos = [], pad = 200;
        for (var i = 0; i < count; i++) {
            var placed = false;
            for (var a = 0; a < 50 && !placed; a++) {
                var x = pad + Math.random() * (MAP_W - pad*2), y = pad + Math.random() * (MAP_H - pad*2);
                if (!nearObs(x, y) || !isValidGen(x, y)) continue;
                var tooClose = false;
                for (var j = 0; j < pos.length; j++) { if (Math.sqrt((x-pos[j].x)**2 + (y-pos[j].y)**2) < GEN_MIN) { tooClose = true; break; } }
                if (!tooClose) { pos.push({x:x, y:y}); placed = true; }
            }
            if (!placed) for (var a = 0; a < 100 && !placed; a++) {
                var x = pad + Math.random() * (MAP_W - pad*2), y = pad + Math.random() * (MAP_H - pad*2);
                if (!isValidGen(x, y)) continue;
                var tooClose = false;
                for (var j = 0; j < pos.length; j++) { if (Math.sqrt((x-pos[j].x)**2 + (y-pos[j].y)**2) < GEN_MIN) { tooClose = true; break; } }
                if (!tooClose) { pos.push({x:x, y:y}); placed = true; }
            }
        }
        while (pos.length < count) pos.push({x: 300+pos.length*400, y: 300+(pos.length%3)*500});
        return pos;
    }

    var genPos = genPositions(5);
    genPos.forEach(function(p, i) {
        var lightGlow = this.add.graphics();
        lightGlow.fillStyle(0xffee88, 0.15); lightGlow.fillCircle(p.x, p.y - 45, 50); lightGlow.setDepth(p.y - 50 + 1);
        var lightGlowInner = this.add.graphics();
        lightGlowInner.fillStyle(0xffee88, 0.3); lightGlowInner.fillCircle(p.x, p.y - 45, 25); lightGlowInner.setDepth(p.y - 50 + 2);
        var light = this.add.sprite(p.x, p.y - 45, 'gen_light').setDepth(p.y - 50 + 3).setScale(0.7);
        var pole = this.add.sprite(p.x, p.y - 22, 'gen_pole').setDepth(p.y - 26 + 1); pole.setScale(0.6);
        var glow = this.add.graphics();
        glow.fillStyle(0x00ff44, 0.08); glow.fillCircle(p.x, p.y, 40); glow.setDepth(p.y + 1);
        var sp = this.add.sprite(p.x, p.y, 'gen').setDepth(p.y + 2).setScale(0.75);
        sp.genId = i; sp.progress = 0; sp.repaired = false;
        sp.barGfx = this.add.graphics().setDepth(p.y + 3);
        sp.repairSparks = this.add.graphics().setDepth(p.y + 4);
        sp.bx = p.x; sp.by = p.y; sp.glowGfx = glow; sp.lightGlowGfx = lightGlow;
        sp.lightGlowInnerGfx = lightGlowInner; sp.lightSprite = light;
        sp.lightFlickerPhase = Math.random() * Math.PI * 2;
        generators.push(sp);
    }, this);

    // Hooks
    [{x:500,y:450},{x:1900,y:450},{x:500,y:1350},{x:1900,y:1350},{x:1200,y:500},{x:1200,y:1300},{x:800,y:900},{x:1600,y:900}].forEach(function(p, i) {
        var hg = this.add.graphics(); hg.fillStyle(0xff2200, 0.08); hg.fillCircle(p.x, p.y, 35); hg.setDepth(p.y);
        var sp = this.add.sprite(p.x, p.y, 'hook').setDepth(p.y + 1).setScale(1.3);
        sp.hookId = i; sp.occupied = false; sp.hookedSurvivor = null; sp.hookTimer = 0;
        sp.hookGlow = hg; sp.glowPhase = Math.random() * Math.PI * 2;
        hooks.push(sp);
    }, this);

    // Pallets - positioned outside buildings
    [{x:250,y:350},{x:1260,y:400},{x:1550,y:350},{x:2050,y:400},{x:300,y:800},{x:700,y:750},{x:1100,y:800},{x:1500,y:750},{x:2200,y:800},{x:400,y:1250},{x:900,y:1200},{x:1400,y:1250},{x:1900,y:1200},{x:2100,y:1300},{x:1200,y:650},{x:1200,y:1100}].forEach(function(p, i) {
        var sp = this.add.sprite(p.x, p.y, 'pallet').setDepth(p.y + 2).setScale(1.2);
        sp.palletId = i; sp.state = 'standing'; sp.dropTimer = 0; sp.breakTimer = 0;
        sp.canDrop = true; sp.dropCooldown = 0; sp.stunTimer = 0; sp.bx = p.x; sp.by = p.y;
        sp.shadow = this.add.graphics(); sp.shadow.fillStyle(0x000000, 0.3);
        sp.shadow.fillEllipse(p.x, p.y + 35, 30, 12); sp.shadow.setDepth(p.y);
        pallets.push(sp);
    }, this);

    // Gates
    [{x:30,y:900},{x:MAP_W-30,y:900}].forEach(function(p) {
        var gg = this.add.graphics(); gg.fillStyle(0x00ff44, 0.06); gg.fillCircle(p.x, p.y, 45); gg.setDepth(p.y);
        var sp = this.add.sprite(p.x, p.y, 'gate').setDepth(p.y + 1).setScale(1.8);
        sp.progress = 0; sp.opened = false; sp.isOpening = false;
        sp.barGfx = this.add.graphics().setDepth(p.y + 2);
        sp.bx = p.x; sp.by = p.y; sp.gateGlow = gg; sp.glowPhase = Math.random() * Math.PI * 2;
        gates.push(sp);
    }, this);

    // Hatch
    var hatchPos = {x: MAP_W/2, y: MAP_H/2};
    var hatchGlow = this.add.graphics(); hatchGlow.fillStyle(0xffaa00, 0.2);
    hatchGlow.fillCircle(hatchPos.x, hatchPos.y, 60); hatchGlow.setDepth(hatchPos.y);
    hatch = this.add.sprite(hatchPos.x, hatchPos.y, 'hatch').setDepth(hatchPos.y + 1).setScale(1.5);
    hatch.setTint(0xffaa00); hatch.glowGfx = hatchGlow; hatchOpen = false; hatchClosed = false;

    spawnPlayers.call(this);

    // Camera
    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.startFollow(player.sprite, true, 0.1, 0.1);
    this.cameras.main.setBackgroundColor('#030303');

    // Atmosphere
    this.atmosphere = { bloodSplatters:[], bloodGfx:null, heartbeatIntensity:0, heartbeatGfx:null,
        killerAuraGfx:null, screenShakeAmount:0, ambientParticles:[], ambientGfx:null, breathPhase:0 };
    this.atmosphere.bloodGfx = this.add.graphics().setDepth(9995);
    this.atmosphere.heartbeatGfx = this.add.graphics().setDepth(9998);
    this.atmosphere.killerAuraGfx = this.add.graphics().setDepth(9997);
    this.atmosphere.ambientGfx = this.add.graphics().setDepth(9996);
    for (var i = 0; i < 40; i++) {
        this.atmosphere.ambientParticles.push({
            x: Math.random()*window.innerWidth, y: Math.random()*window.innerHeight,
            size: 0.5+Math.random()*2, alpha: 0.1+Math.random()*0.3,
            speedX: (Math.random()-0.5)*0.3, speedY: -0.1-Math.random()*0.4,
            flicker: Math.random()*Math.PI*2, color: Math.random()>0.7 ? 0xff6622 : 0x886644
        });
    }

    // Fog
    this.fogPatches = [];
    var fogColors = [{r:45,g:50,b:55},{r:55,g:50,b:45},{r:40,g:45,b:50},{r:50,g:48,b:45},{r:35,g:40,b:45}];
    var fogCount = window.isLowEndDevice ? 30 : 50;
    for (var i = 0; i < fogCount; i++) {
        this.fogPatches.push({
            x: Math.random()*MAP_W, y: Math.random()*MAP_H,
            width: 250+Math.random()*400, height: 80+Math.random()*100,
            alpha: 0.15+Math.random()*0.35, speedX: -0.08-Math.random()*0.15,
            speedY: (Math.random()-0.5)*0.04, wobblePhase: Math.random()*Math.PI*2,
            wobbleSpeed: 0.0003+Math.random()*0.0002,
            color: fogColors[Math.floor(Math.random()*fogColors.length)],
            layer: Math.floor(Math.random()*3)
        });
    }
    this.fogGfx = [];
    for (var i = 0; i < 3; i++) { var fg = this.add.graphics(); fg.setDepth(95+i*2); this.fogGfx.push(fg); }

    // Dust
    this.dustParticles = [];
    for (var i = 0; i < 35; i++) {
        this.dustParticles.push({
            x: Math.random()*MAP_W, y: Math.random()*MAP_H,
            size: 1+Math.random()*2.5, alpha: 0.08+Math.random()*0.12,
            speedX: (Math.random()-0.5)*0.3, speedY: (Math.random()-0.5)*0.2-0.1,
            wobble: Math.random()*Math.PI*2, color: Math.random()>0.6 ? 0xffaa66 : 0x888877
        });
    }
    this.dustGfx = this.add.graphics().setDepth(150);

    // Ash
    this.ashParticles = [];
    for (var i = 0; i < 20; i++) {
        this.ashParticles.push({
            x: Math.random()*MAP_W, y: Math.random()*MAP_H,
            size: 1+Math.random()*2, alpha: 0.15+Math.random()*0.25,
            speedX: 0.05+Math.random()*0.15, speedY: -0.2-Math.random()*0.3,
            flicker: Math.random()*Math.PI*2, glowSize: 2+Math.random()*3
        });
    }
    this.ashGfx = this.add.graphics().setDepth(149);

    // Crows - placed near player AFTER spawn
    this.crows = [];
    var playerX = player ? player.sprite.x : MAP_W/2;
    var playerY = player ? player.sprite.y : MAP_H/2;
    var landingSpots = [];
    getMapObstacles().forEach(function(o) {
        if (o.t.includes('tree') || o.t.includes('pine') || o.t.includes('stone') || o.t.includes('brick')) {
            var d = Math.sqrt(Math.pow(o.x+o.sw/2-playerX,2) + Math.pow(o.y+o.sh/2-playerY,2));
            if (d < 600) {
                landingSpots.push({x: o.x+o.sw/2, y: o.y+o.sh/2-20, type: o.t});
            }
        }
    });
    var crowSeed = roomCode ? hashCode(roomCode + '_crows') : Date.now();
    var crowRand = seededRandom(crowSeed);
    var numCrows = 5 + Math.floor(crowRand() * 6);
    for (var i = 0; i < numCrows; i++) {
        var isFlying = crowRand() > 0.3;
        var cx = playerX + (crowRand()-0.5) * 500;
        var cy = playerY + (crowRand()-0.5) * 500;
        cx = Math.max(50, Math.min(MAP_W-50, cx));
        cy = Math.max(50, Math.min(MAP_H-50, cy));
        var crow = {
            sprite: this.add.sprite(cx, cy, isFlying ? 'crow' : 'crow_sitting'),
            state: isFlying ? 'flying' : 'sitting', speedX: 0, speedY: 0, targetX: 0, targetY: 0,
            flapPhase: crowRand()*Math.PI*2, flapSpeed: 0.1+crowRand()*0.05,
            wanderTimer: 0, wanderInterval: 3+crowRand()*5, sitTimer: 0, maxSitTime: 5+crowRand()*10,
            landingSpot: null, isAI: true, heightOffset: 0, cawTimer: 0, cawBubble: null, cawText: null
        };
        crow.sprite.setDepth(200); crow.sprite.setScale(0.6+crowRand()*0.3);
        if (!isFlying && landingSpots.length > 0) {
            crow.landingSpot = landingSpots[Math.floor(crowRand()*landingSpots.length)];
            crow.sprite.setPosition(crow.landingSpot.x, crow.landingSpot.y);
            crow.targetX = crow.landingSpot.x; crow.targetY = crow.landingSpot.y;
        }
        this.crows.push(crow);
    }
    this.cawGfx = this.add.graphics().setDepth(300);
    this.vignetteGfx = this.add.graphics().setDepth(99999);
    floatBarGfx = this.add.graphics().setDepth(55000);

    createControls();

    if (isMultiplayer && roomCode && playerId) initMultiplayerSync.call(this);
    console.log('[CREATE] done');
}

function buildFence(W, H) {
    var step = 48;
    for (var x = 0; x <= W; x += step) {
        var sp = staticGroup.create(x, 0, 'brick_wall');
        sp.setDisplaySize(step, 60); sp.refreshBody(); sp.setTint(0x666666);
        var sp2 = staticGroup.create(x, H, 'brick_wall');
        sp2.setDisplaySize(step, 60); sp2.refreshBody(); sp2.setTint(0x666666);
    }
    for (var y = step; y < H; y += step) {
        var sp = staticGroup.create(0, y, 'brick_wall');
        sp.setDisplaySize(60, step); sp.refreshBody(); sp.setTint(0x666666);
        var sp2 = staticGroup.create(W, y, 'brick_wall');
        sp2.setDisplaySize(60, step); sp2.refreshBody(); sp2.setTint(0x666666);
    }
}

function getMapObstacles() {
    var obs = [];
    function overlapsAny(x, y, sw, sh, pad) {
        pad = pad || 30;
        for (var i = 0; i < obs.length; i++) {
            if (obs[i].solid) {
                var dx = Math.abs((x+sw/2)-(obs[i].x+obs[i].sw/2));
                var dy = Math.abs((y+sh/2)-(obs[i].y+obs[i].sh/2));
                if (dx < (sw+obs[i].sw)/2+pad && dy < (sh+obs[i].sh)/2+pad) return true;
            }
        }
        return false;
    }
    function addBrickRow(sx, sy, n) { for (var i = 0; i < n; i++) obs.push({t:'brick_wall', x:sx+i*60, y:sy, sw:60, sh:60, solid:true}); }
    function addBrickCol(sx, sy, n) { for (var i = 0; i < n; i++) obs.push({t:'brick_wall', x:sx, y:sy+i*60, sw:60, sh:60, solid:true}); }
    addBrickRow(280,260,5); addBrickCol(280,260,6); addBrickRow(880,340,6); addBrickCol(880,340,5);
    addBrickRow(1880,580,5); addBrickCol(1880,580,6); addBrickRow(360,1380,5); addBrickCol(360,1380,5);
    addBrickRow(1580,1040,5); addBrickCol(1580,1040,4); addBrickRow(1080,1480,6);
    addBrickCol(680,820,5); addBrickRow(680,820,4);

    var stoneSizes = {stone1:{sw:40,sh:38},stone2:{sw:38,sh:34},stone3:{sw:36,sh:28},stone4:{sw:48,sh:30},stone5:{sw:28,sh:28}};
    [[200,400,'stone1'],[500,200,'stone3'],[1200,300,'stone2'],[1800,200,'stone4'],[2200,500,'stone5'],[300,1000,'stone2'],[600,1400,'stone1'],[1400,900,'stone5'],[2000,1100,'stone3'],[1700,1600,'stone4'],[800,1600,'stone1'],[1100,700,'stone2'],[1500,400,'stone3'],[2100,1400,'stone1'],[450,700,'stone5'],[950,1200,'stone4'],[1700,350,'stone2'],[2300,900,'stone1'],[400,1550,'stone3'],[1600,250,'stone5'],[1050,1600,'stone2'],[750,450,'stone4'],[1800,1000,'stone1'],[2200,1200,'stone3']].forEach(function(p) {
        var st = stoneSizes[p[2]];
        if (!overlapsAny(p[0], p[1], st.sw, st.sh, 40)) obs.push({t:p[2], x:p[0], y:p[1], sw:st.sw, sh:st.sh, solid:true});
    });

    [[120,120],[580,80],[1100,130],[1580,90],[2180,180],[80,580],[380,380],[880,480],[1380,280],[1980,380],[130,1080],[480,880],[980,1280],[1480,1080],[2080,780],[280,1680],[680,1680],[1180,1680],[1680,1680],[2180,1580],[250,350],[720,550],[1250,450],[1750,350],[2150,550],[450,1150],[950,950],[1450,1250],[1950,950],[2350,1150]].forEach(function(p) {
        if (!overlapsAny(p[0], p[1], 70, 100, 50)) obs.push({t:'tree'+Math.floor(Math.random()*3), x:p[0], y:p[1], sw:70, sh:100, solid:false});
    });
    [[350,150],[850,250],[1350,150],[1850,250],[2350,150],[150,750],[650,650],[1150,750],[1650,650],[2150,750],[250,1350],[750,1250],[1250,1350],[1750,1250],[2250,1350]].forEach(function(p) {
        if (!overlapsAny(p[0], p[1], 50, 95, 45)) obs.push({t:'pine_tree', x:p[0], y:p[1], sw:50, sh:95, solid:false});
    });
    [[200,250],[700,150],[1200,250],[1700,150],[2200,250],[320,650],[820,550],[1320,650],[1820,550],[2320,650],[180,1250],[680,1150],[1180,1250],[1680,1150],[2180,1250]].forEach(function(p) {
        if (!overlapsAny(p[0], p[1], 40, 80, 35)) obs.push({t:'tree_small', x:p[0], y:p[1], sw:40, sh:80, solid:false});
    });
    [[220,480],[680,280],[1020,380],[1780,680],[2080,280],[330,1180],[780,980],[1280,1380],[1580,780],[2180,1180],[420,320],[920,420],[1420,320],[1920,420],[2420,320],[280,820],[780,720],[1280,820],[1780,720],[2280,820],[520,1420],[1020,1320],[1520,1420],[2020,1320],[520,220],[1020,120],[1520,220],[2020,120]].forEach(function(p) {
        if (!overlapsAny(p[0], p[1], 60, 45, 25)) obs.push({t:'bush', x:p[0], y:p[1], sw:60, sh:45, solid:false});
    });
    [[180,320],[580,180],[980,280],[1380,180],[1880,320],[2280,180],[280,720],[680,620],[1080,720],[1480,620],[1980,720],[180,1120],[580,1020],[1080,1120],[1580,1020],[2080,1120],[380,1520],[880,1420],[1380,1520],[1880,1420]].forEach(function(p) {
        if (!overlapsAny(p[0], p[1], 50, 40, 20)) obs.push({t:'tall_grass', x:p[0], y:p[1], sw:50, sh:40, solid:false});
    });
    [[280,420],[780,320],[1280,420],[1780,320],[2280,420],[380,820],[880,720],[1380,820],[1880,720],[2380,820],[280,1220],[680,1120],[1180,1220],[1680,1120],[2180,1220]].forEach(function(p) {
        if (!overlapsAny(p[0], p[1], 52, 35, 20)) obs.push({t:'flower_patch', x:p[0], y:p[1], sw:52, sh:35, solid:false});
    });
    [[280,280],[780,180],[1280,280],[1780,180],[2280,280],[380,680],[880,580],[1380,680],[1880,580],[2380,680],[280,1080],[680,980],[1180,1080],[1680,980],[2180,1080],[480,1380],[980,1280],[1480,1380],[1980,1280]].forEach(function(p) {
        if (!overlapsAny(p[0], p[1], 56, 45, 25)) obs.push({t:'rock_detailed', x:p[0], y:p[1], sw:56, sh:45, solid:true});
    });
    return obs;
}

function spawnPlayers() {
    var kSpawn = getKillerSpawnPoint();
    var sSpawns = getSurvivorSpawnPoints(kSpawn, 4);

    if (isKiller) {
        player = makePlayer(this, kSpawn.x, kSpawn.y, 'killer', true);
        this.physics.add.collider(player.sprite, staticGroup);
        if (!isMultiplayer) {
            var sTex = ['s1','s2','s4'];
            sTex.forEach(function(t, i) {
                var ai = makePlayer(this, sSpawns[i].x, sSpawns[i].y, t, false);
                ai.aiDir = {x:0,y:0}; ai.aiTimer = 0;
                this.physics.add.collider(ai.sprite, staticGroup);
                player.aiPlayers = player.aiPlayers || [];
                player.aiPlayers.push(ai);
            }, this);
        } else { player.aiPlayers = []; survivorsAlive = 0; }
    } else {
        player = makePlayer(this, sSpawns[0].x, sSpawns[0].y, 's1', true);
        this.physics.add.collider(player.sprite, staticGroup);
        if (!isMultiplayer) {
            var aiK = makePlayer(this, kSpawn.x, kSpawn.y, 'killer', false);
            aiK.isAIKiller = true; aiK.aiTimer = 0; aiK.aiHitCooldown = 0;
            this.physics.add.collider(aiK.sprite, staticGroup);
            this.physics.add.collider(player.sprite, aiK.sprite);
            player.aiPlayers = [aiK]; survivorsAlive = 1;
        } else { player.aiPlayers = []; survivorsAlive = 1; }
    }
}

function getKillerSpawnPoint() { return {x: 1200, y: 900}; }
function getSurvivorSpawnPoints(ksp, n) {
    var pts = [{x:200,y:200},{x:200,y:1600},{x:2200,y:200},{x:2200,y:1600}];
    return pts.slice(0, n);
}

function makePlayer(sc, x, y, tex, isMe) {
    var sp = sc.add.sprite(x, y, tex);
    sp.setDepth(1000 + y); sc.physics.add.existing(sp);
    sp.body.setCollideWorldBounds(true);
    var hs = (tex === 'killer') ? {w:30,h:35} : {w:24,h:28};
    sp.body.setSize(hs.w, hs.h, true);
    if (tex === 's4') sp.setScale(1.5, 1.5); else sp.setScale(1.0, 1.0);
    var glow = sc.add.graphics();
    var gc = (tex === 'killer') ? 0x333333 : 0x44aaff;
    glow.fillStyle(gc, 0.15); glow.fillCircle(0, 0, 25); glow.setDepth(999); glow.setAlpha(0.5);
    var p = { sprite:sp, tex:tex, role:(tex==='killer')?'killer':'survivor', state:'alive', health:100,
        hookTimer:0, carryTarget:null, progressAction:null, isMe:isMe, glowFx:glow, glowColor:gc,
        isRepairing:false, isVulnerable:false, repairAnimPhase:0, repairSparks:null, repairBobPhase:0 };
    sp._pRef = p; return p;
}

// ═══════ UPDATE ═══════
function update(time, dt) {
    if (!scene || !player || gameEnded) return;
    gameTime += dt;

    updateBloodSplatters(dt);

    // 3D model
    if (threeLoaded && !window.isLowEndDevice) updateKiller3DSprite(dt);

    // Hide 2D killer sprite
    if (isKiller && player && player.sprite && player.sprite.visible) player.sprite.setVisible(false);
    if (!isKiller && !isMultiplayer && player && player.aiPlayers) {
        player.aiPlayers.forEach(function(ai) {
            if (ai.isAIKiller && ai.sprite && ai.sprite.visible) ai.sprite.setVisible(false);
        });
    }

    updatePlayer(dt);
    if (isKiller) killerAction(dt);
    else survivorAction(dt);
    updateAI(dt);
    updateGenerators(dt);
    updateHooks(dt);
    updatePallets(dt);
    updateGates(dt);
    updateHatch(dt);
    updateCrows(dt);
    updateFog(dt);
    updateDustAndAsh(dt);
    updateAtmosphere(dt);
    updateGateGlow(dt);

    if (isMultiplayer) {
        interpolateRemotePlayers(dt);
        sendCrowUpdate();
    }

    updateHUD();
    checkWinLose();

    // Update ground tile to follow camera
    if (scene.ground) {
        scene.ground.setPosition(scene.cameras.main.scrollX + scene.cameras.main.width / 2, scene.cameras.main.scrollY + scene.cameras.main.height / 2);
    }

    // Action button
    var ab = document.getElementById('action-btn');
    if (ab) {
        var showAction = true;
        if (isKiller && player.carryTarget) {
            var nearHook = false;
            hooks.forEach(function(h) {
                if (!h.occupied && dist(player.sprite, h) < CONFIG.INTERACT_DISTANCE) nearHook = true;
            });
            showAction = nearHook;
        }
        if (!isKiller && !player.isRepairing) {
            // Show only near interactive objects for survivor
            var nearInteractive = false;
            generators.forEach(function(gen) {
                if (!gen.repaired && dist(player.sprite, gen) < CONFIG.INTERACT_DISTANCE) nearInteractive = true;
            });
            hooks.forEach(function(hook) {
                if (hook.occupied && dist(player.sprite, hook) < CONFIG.INTERACT_DISTANCE) nearInteractive = true;
            });
            if (exitOpen) {
                gates.forEach(function(gate) {
                    if (!gate.opened && dist(player.sprite, gate) < CONFIG.INTERACT_DISTANCE) nearInteractive = true;
                });
            }
            if (isNearHatch || isNearGate) nearInteractive = true;
            // Check for healing
            if (!isMultiplayer && player.aiPlayers) {
                player.aiPlayers.forEach(function(ai) {
                    if (ai.state === 'injured' && dist(player.sprite, ai.sprite) < CONFIG.INTERACT_DISTANCE) nearInteractive = true;
                });
            }
            showAction = nearInteractive;
        }
        ab.style.display = showAction ? 'flex' : 'none';
    }
}

function updateHUD() {
    var p = player;
    var genCount = generators.filter(function(g){return g.repaired;}).length;
    var aliveCount;
    if (isKiller) {
        if (isMultiplayer) aliveCount = Object.values(remotePlayers).filter(function(rp){return rp.role==='survivor'&&rp.state!=='dead'&&rp.state!=='escaped';}).length;
        else aliveCount = (player.aiPlayers||[]).filter(function(a){return a.state!=='dead'&&a.state!=='escaped';}).length;
    } else {
        if (isMultiplayer) aliveCount = (player.state!=='dead'&&player.state!=='escaped'?1:0) + Object.values(remotePlayers).filter(function(rp){return rp.role==='survivor'&&rp.state!=='dead'&&rp.state!=='escaped';}).length;
        else aliveCount = survivorsAlive;
    }
    UI.updateHUD(p.role, p.state, genCount, exitOpen, hatchOpen&&!hatchClosed, aliveCount);
}

function checkWinLose() {
    if (gameEnded) return;
    if (isKiller) {
        var allElim = false;
        if (isMultiplayer) {
            var survs = Object.values(remotePlayers).filter(function(rp){return rp.role==='survivor';});
            allElim = survs.length > 0 && survs.every(function(rp){return rp.state==='dead'||rp.state==='escaped';});
        } else allElim = (player.aiPlayers||[]).filter(function(a){return a.state!=='dead'&&a.state!=='escaped';}).length === 0;
        if (allElim) doEndGame(true, '\u0422\u044B \u043F\u043E\u0439\u043C\u0430\u043B \u0432\u0441\u0435\u0445!');
    } else {
        if (player.state === 'dead') doEndGame(false, '\u0422\u0435\u0431\u044F \u043F\u043E\u0439\u043C\u0430\u043B\u0438!');
        if ((player.state === 'alive' || player.state === 'injured') && exitOpen) {
            gates.forEach(function(gate) {
                if (gate.opened && dist(player.sprite, gate) < 80) doEndGame(true, '\u0422\u044B \u0441\u0431\u0435\u0436\u0430\u043B!');
            });
        }
        if ((player.state === 'alive' || player.state === 'injured') && hatchOpen && !hatchClosed && !isEscapingHatch) {
            if (dist(player.sprite, hatch) < 80 && !isEscapingHatch) {
                // Auto escape through hatch
                doEndGame(true, '\u0422\u044B \u0441\u0431\u0435\u0436\u0430\u043B \u0447\u0435\u0440\u0435\u0437 \u043B\u044E\u043A!');
            }
        }
    }
}

function doEndGame(won, msg) {
    if (gameEnded) return;
    gameEnded = true; isCarryingNearHook = false;
    if (player && player.carryTarget) {
        var c = player.carryTarget;
        if (c && c.sprite) { c.sprite.setScale(1,1); if (c.sprite.texture.key.includes('_carried')) c.sprite.setTexture(c.tex); }
        player.carryTarget = null;
    }
    if (isMultiplayer && roomCode) setGameResult(roomCode, won ? (isKiller?'killer':'survivors') : (isKiller?'survivors':'killer'), msg);
    setTimeout(function() { stopGame(); UI.showGameOver(won, msg); }, 600);
}

// ═══════ EXPORTS ═══════
window.Game = { start: startGame, stop: stopGame, CONFIG: CONFIG, UI: UI };
window.UI = UI;

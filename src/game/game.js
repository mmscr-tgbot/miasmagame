const CONFIG = {
    PLAYER_SPEED: 140,
    KILLER_SPEED: 160,
    GENERATOR_COUNT: 5,
    CATCH_DISTANCE: 45,
    CATCH_COOLDOWN: 2,
    EXIT_OPEN_TIME: 10
};

let game = null;
let player = null;
let generators = [];
let isKiller = false;
let gameTime = 0;
let exitOpen = false;
let survivorsLeft = 4;
let catchCooldown = 0;

function initApp() {
    UI.init();
    
    setTimeout(() => {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';
    }, 500);
    
    initTelegram();
}

function initTelegram() {
    if (window.Telegram && Telegram.WebApp) {
        try {
            Telegram.WebApp.ready();
            Telegram.WebApp.expand();
        } catch(e) {}
    }
}

const UI = {
    showScreen(name) {
        const screens = ['loading-screen', 'main-menu', 'role-select', 'game-screen', 'game-over'];
        screens.forEach(s => {
            document.getElementById(s).style.display = 'none';
        });
        document.getElementById(name).style.display = 'flex';
    },
    
    showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.remove('show');
        void t.offsetWidth;
        t.classList.add('show');
    },
    
    updateHUD(role, genCount, exit, alive) {
        document.getElementById('player-role').textContent = role === 'killer' ? 'Убийца' : 'Выживший';
        document.getElementById('gen-count').textContent = genCount + '/5';
        document.getElementById('exit-state').textContent = exit ? 'открыт' : 'закрыт';
        document.getElementById('alive-count').textContent = 'Выжившие: ' + alive;
    },
    
    showGameOver(won) {
        document.getElementById('game-result-title').textContent = won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
        document.getElementById('game-result-message').textContent = won 
            ? 'Ты сбежал!' 
            : isKiller ? 'Ты поймал всех!' : 'Тебя поймали!';
        this.showScreen('game-over');
    }
};

function startGame(killerMode) {
    isKiller = killerMode;
    gameTime = 0;
    exitOpen = false;
    catchCooldown = 0;
    survivorsLeft = 4;
    generators = [];
    
    UI.showScreen('game-screen');
    UI.showToast(isKiller ? 'Поймай всех!' : 'Найди генераторы!');
    
    initGame();
}

function stopGame() {
    if (game) {
        game.destroy(true);
        game = null;
    }
    Input.destroy();
}

function initGame() {
    const container = document.getElementById('game-container');
    container.innerHTML = '';
    
    game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundColor: '#2d5a27',
        physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
        scene: { preload, create, update }
    });
}

function preload() {
    const g = this.make.graphics();
    
    // Дерево
    g.fillStyle(0x4a3728);
    g.fillRect(10, 30, 20, 40);
    g.fillStyle(0x228b22);
    g.fillCircle(20, 25, 30);
    g.fillCircle(10, 20, 20);
    g.fillCircle(30, 20, 20);
    g.generateTexture('tree', 40, 70);
    g.clear();
    
    // Трава/куст
    g.fillStyle(0x228b22);
    g.fillCircle(15, 15, 15);
    g.fillCircle(25, 15, 12);
    g.fillCircle(20, 22, 12);
    g.generateTexture('bush', 40, 35);
    g.clear();
    
    // Человек - выживший
    g.fillStyle(0x8B4513);
    g.fillEllipse(16, 32, 12, 18);
    g.fillStyle(0xffdbac);
    g.fillCircle(16, 12, 10);
    g.fillStyle(0x333333);
    g.fillRect(10, 10, 12, 4);
    g.generateTexture('survivor_m', 32, 50);
    g.clear();
    
    // Человек - убийца
    g.fillStyle(0x1a1a1a);
    g.fillRect(12, 20, 16, 30);
    g.fillStyle(0xff0000);
    g.fillRect(12, 25, 16, 8);
    g.fillStyle(0xffdbac);
    g.fillCircle(20, 12, 12);
    g.fillStyle(0x000000);
    g.fillRect(14, 8, 5, 5);
    g.fillRect(21, 8, 5, 5);
    g.generateTexture('killer_m', 40, 55);
    g.clear();
    
    // Генератор
    g.fillStyle(0x444444);
    g.fillRect(0, 0, 35, 25);
    g.fillStyle(0x222222);
    g.fillRect(2, 2, 15, 21);
    g.fillStyle(0x00ff00);
    g.fillRect(4, 4, 3, 8);
    g.fillStyle(0xff0000);
    g.fillCircle(28, 12, 5);
    g.generateTexture('generator', 35, 25);
    g.clear();
    
    // Выход - ворота
    g.fillStyle(0x8B4513);
    g.fillRect(0, 0, 60, 50);
    g.fillStyle(0x654321);
    g.fillRect(5, 5, 20, 40);
    g.fillRect(35, 5, 20, 40);
    g.fillStyle(0xff0000);
    g.fillCircle(30, 25, 8);
    g.generateTexture('exit', 60, 50);
    g.clear();
    
    // Забор/стена
    g.fillStyle(0x555555);
    g.fillRect(0, 0, 40, 15);
    g.fillStyle(0x333333);
    g.fillRect(0, 0, 38, 3);
    g.fillRect(0, 6, 38, 3);
    g.fillRect(0, 12, 38, 3);
    g.generateTexture('wall', 40, 15);
    g.clear();
    
    // Земля
    g.fillStyle(0x3d6b1e);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x4a7c23);
    g.fillCircle(8, 8, 4);
    g.fillCircle(24, 20, 3);
    g.generateTexture('ground', 32, 32);
}

function create() {
    const mapW = 1200;
    const mapH = 900;
    
    // Фон травы
    for (let x = 0; x < mapW; x += 32) {
        for (let y = 0; y < mapH; y += 32) {
            const t = this.add.image(x + 16, y + 16, 'ground');
            t.setAlpha(0.5 + Math.random() * 0.5);
        }
    }
    
    // Деревья по краям
    const treePositions = [
        {x: 50, y: 50}, {x: 150, y: 80}, {x: 80, y: 150},
        {x: 1100, y: 50}, {x: 1050, y: 120}, {x: 1150, y: 150},
        {x: 50, y: 800}, {x: 120, y: 850}, {x: 80, y: 750},
        {x: 1100, y: 800}, {x: 1050, y: 850}, {x: 1150, y: 750},
        {x: 600, y: 50}, {x: 300, y: 300}, {x: 900, y: 300},
        {x: 300, y: 600}, {x: 900, y: 600}
    ];
    
    treePositions.forEach(p => {
        const tree = this.add.image(p.x, p.y, 'tree');
        tree.setDepth(p.y);
    });
    
    // Кусты
    const bushPositions = [
        {x: 200, y: 200}, {x: 400, y: 150}, {x: 800, y: 200},
        {x: 200, y: 700}, {x: 1000, y: 400}, {x: 600, y: 700}
    ];
    
    bushPositions.forEach(p => {
        const bush = this.add.image(p.x, p.y, 'bush');
        bush.setDepth(p.y);
    });
    
    // Стены/заборы
    const walls = [
        {x: 600, y: 200, r: 0},
        {x: 300, y: 450, r: 0},
        {x: 900, y: 450, r: 0},
        {x: 600, y: 700, r: 0}
    ];
    
    walls.forEach(w => {
        const wall = this.add.image(w.x, w.y, 'wall');
        wall.angle = w.r;
    });
    
    // Генераторы
    const genPositions = [
        {x: 150, y: 150},
        {x: 1050, y: 150},
        {x: 600, y: 350},
        {x: 150, y: 750},
        {x: 1050, y: 750}
    ];
    
    genPositions.forEach((p, i) => {
        const gen = this.add.sprite(p.x, p.y, 'generator');
        gen.progress = 0;
        gen.repaired = false;
        gen.id = i + 1;
        
        const bar = this.add.graphics();
        bar.x = p.x - 20;
        bar.y = p.y - 20;
        gen.bar = bar;
        
        generators.push(gen);
    });
    
    // Выход
    this.exit = this.add.sprite(1150, 450, 'exit');
    this.exit.setTint(0x440000);
    
    // Игрок
    if (isKiller) {
        player = this.add.sprite(600, 450, 'killer_m');
    } else {
        player = this.add.sprite(150, 150, 'survivor_m');
    }
    
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    
    // Выжившие (боты)
    if (!isKiller) {
        this.survivors = [];
        const survivorPositions = [
            {x: 1050, y: 150},
            {x: 150, y: 750},
            {x: 1050, y: 750}
        ];
        
        survivorPositions.forEach(p => {
            const s = this.add.sprite(p.x, p.y, 'survivor_m');
            s.role = 'survivor';
            s.alive = true;
            this.physics.add.existing(s);
            s.body.setCollideWorldBounds(true);
            s.body.setVelocity(0);
            s.setDepth(p.y);
            this.survivors.push(s);
        });
    } else {
        this.survivors = [];
    }
    
    player.setDepth(1000);
    
    this.cameras.main.setBounds(0, 0, mapW, mapH);
    this.cameras.main.startFollow(player);
    this.cameras.main.setZoom(1);
    
    Input.init(this);
}

function update(time, delta) {
    if (!player) return;
    
    gameTime += delta / 1000;
    
    const vec = Input.getVector();
    const speed = isKiller ? CONFIG.KILLER_SPEED : CONFIG.PLAYER_SPEED;
    player.body.setVelocity(vec.x * speed, vec.y * speed);
    
    // Боты-выжившие
    if (!isKiller) {
        this.survivors.forEach(s => {
            if (s.alive) {
                if (Math.random() < 0.02) {
                    s.body.setVelocity((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
                }
                
                const distToKiller = Phaser.Math.Distance.Between(s.x, s.y, player.x, player.y);
                if (distToKiller < 150) {
                    const angle = Phaser.Math.Angle.Between(s.x, s.y, player.x, player.y);
                    s.body.setVelocity(Math.cos(angle) * 80, Math.sin(angle) * 80);
                }
            }
        });
        
        // Ремонт генераторов
        if (Input.isActionPressed()) {
            generators.forEach(gen => {
                if (!gen.repaired) {
                    const dist = Phaser.Math.Distance.Between(player.x, player.y, gen.x, gen.y);
                    if (dist < 50) {
                        gen.progress += delta / 100;
                        gen.bar.clear();
                        gen.bar.fillStyle(0x000000, 0.7);
                        gen.bar.fillRect(-20, -20, 40, 6);
                        gen.bar.fillStyle(0xffff00);
                        gen.bar.fillRect(-19, -19, 38 * (gen.progress / 100), 4);
                        
                        if (gen.progress >= 100) {
                            gen.repaired = true;
                            gen.setTint(0x00ff00);
                            gen.bar.clear();
                            UI.showToast('Генератор починен!');
                        }
                    }
                }
            });
        }
        
        // Проверка генераторов
        const repaired = generators.filter(g => g.repaired).length;
        if (repaired >= CONFIG.GENERATOR_COUNT && !exitOpen) {
            exitOpen = true;
            this.exit.setTint(0x00ff00);
            UI.showToast('ВЫХОД ОТКРЫТ!');
        }
        
        // Проверка выхода
        if (exitOpen) {
            const dist = Phaser.Math.Distance.Between(player.x, player.y, this.exit.x, this.exit.y);
            if (dist < 50) {
                UI.showGameOver(true);
                stopGame();
                return;
            }
        }
    }
    
    // Ловля
    if (isKiller && catchCooldown > 0) {
        catchCooldown -= delta / 1000;
    }
    
    if (isKiller) {
        this.survivors.forEach(s => {
            if (s.alive) {
                const dist = Phaser.Math.Distance.Between(player.x, player.y, s.x, s.y);
                if (dist < CONFIG.CATCH_DISTANCE && catchCooldown <= 0) {
                    s.alive = false;
                    s.setAlpha(0.3);
                    survivorsLeft--;
                    catchCooldown = CONFIG.CATCH_COOLDOWN;
                    UI.showToast('Пойман!');
                }
            }
        });
        
        if (survivorsLeft <= 0) {
            UI.showGameOver(false);
            stopGame();
            return;
        }
    }
    
    player.setDepth(player.y + 1000);
    
    let repaired = 0;
    generators.forEach(g => { if (g.repaired) repaired++; });
    UI.updateHUD(isKiller ? 'killer' : 'survivor', repaired, exitOpen, survivorsLeft);
}

document.getElementById('btn-single').onclick = () => UI.showScreen('role-select');
document.getElementById('btn-play-killer').onclick = () => startGame(true);
document.getElementById('btn-play-survivor').onclick = () => startGame(false);
document.getElementById('btn-back-menu').onclick = () => { stopGame(); UI.showScreen('main-menu'); };

document.addEventListener('DOMContentLoaded', initApp);
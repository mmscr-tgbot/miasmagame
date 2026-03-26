const CONFIG = {
    PLAYER_SPEED: 140,
    KILLER_SPEED: 160,
    GENERATOR_COUNT: 5,
    CATCH_DISTANCE: 45,
    CATCH_COOLDOWN: 2
};

const UI = {
    showScreen(name) {
        const screens = ['loading-screen', 'main-menu', 'role-select', 'game-screen', 'game-over'];
        screens.forEach(s => document.getElementById(s).style.display = 'none');
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
        document.getElementById('game-result-message').textContent = won ? 'Ты сбежал!' : isKiller ? 'Ты поймал всех!' : 'Тебя поймали!';
        this.showScreen('game-over');
    }
};

let game = null;
let player = null;
let generators = [];
let isKiller = false;
let exitOpen = false;
let survivorsLeft = 4;
let catchCooldown = 0;

function startGame(killerMode) {
    isKiller = killerMode;
    exitOpen = false;
    survivorsLeft = 4;
    catchCooldown = 0;
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
    document.getElementById('game-container').innerHTML = '';
    game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: 'game-container',
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
    
    // Куст
    g.fillStyle(0x228b22);
    g.fillCircle(15, 15, 15);
    g.fillCircle(25, 15, 12);
    g.fillCircle(20, 22, 12);
    g.generateTexture('bush', 40, 35);
    g.clear();
    
    // ============ ВЫЖИВШИЙ 1 - Мужчина в куртке ============
    g.fillStyle(0x2d4a3e); // Тёмно-зелёная куртка
    g.fillRect(10, 22, 20, 28);
    g.fillStyle(0x1a332a); // Воротник
    g.fillRect(12, 18, 16, 6);
    g.fillStyle(0x8B4513); // Джинсы
    g.fillRect(12, 45, 7, 18);
    g.fillRect(21, 45, 7, 18);
    g.fillStyle(0xffdbac); // Лицо
    g.fillCircle(20, 12, 10);
    g.fillStyle(0x4a3728); // Волосы
    g.fillCircle(20, 6, 9);
    g.fillStyle(0x222222); // Глаза
    g.fillRect(16, 10, 3, 3);
    g.fillRect(21, 10, 3, 3);
    g.fillStyle(0xff6b6b); // Рот
    g.fillRect(18, 16, 4, 2);
    g.generateTexture('survivor1', 40, 65);
    g.clear();
    
    // ============ ВЫЖИВШАЯ 2 - Девушка в платье ============
    g.fillStyle(0x8e44ad); // Фиолетовое платье
    g.fillRect(12, 22, 16, 30);
    g.fillStyle(0xffdbac); // Лицо
    g.fillCircle(20, 12, 9);
    g.fillStyle(0xd4a574); // Волосы длинные
    g.fillCircle(20, 6, 8);
    g.fillCircle(12, 10, 6);
    g.fillCircle(28, 10, 6);
    g.fillStyle(0x222222); // Глаза
    g.fillCircle(17, 11, 2);
    g.fillCircle(23, 11, 2);
    g.fillStyle(0xe74c3c); // Губы
    g.fillCircle(20, 16, 2);
    g.fillStyle(0xffdbac); // Ноги
    g.fillRect(14, 50, 4, 15);
    g.fillRect(22, 50, 4, 15);
    g.generateTexture('survivor2', 40, 65);
    g.clear();
    
    // ============ ВЫЖИВШИЙ 3 - Мужчина в футболке ============
    g.fillStyle(0xc0392b); // Красная футболка
    g.fillRect(10, 22, 20, 25);
    g.fillStyle(0x2980b9); // Синие штаны
    g.fillRect(12, 42, 7, 22);
    g.fillRect(21, 42, 7, 22);
    g.fillStyle(0xffdbac); // Лицо
    g.fillCircle(20, 12, 10);
    g.fillStyle(0x1a1a1a); // Чёрные волосы
    g.fillCircle(20, 5, 9);
    g.fillStyle(0x222222); // Глаза
    g.fillRect(16, 10, 3, 3);
    g.fillRect(21, 10, 3, 3);
    g.fillStyle(0x95a5a6); // Серьга
    g.fillCircle(25, 14, 2);
    g.generateTexture('survivor3', 40, 65);
    g.clear();
    
    // ============ ВЫЖИВШАЯ 4 - Девушка с хвостиком ============
    g.fillStyle(0xf39c12); // Жёлтая кофта
    g.fillRect(12, 22, 16, 24);
    g.fillStyle(0x3498db); // Синяя юбка
    g.fillRect(14, 42, 12, 12);
    g.fillStyle(0xffdbac); // Лицо
    g.fillCircle(20, 12, 9);
    g.fillStyle(0x8B4513); // Каштановые волосы
    g.fillCircle(20, 5, 8);
    g.fillCircle(28, 8, 5); // Хвостик
    g.fillStyle(0x222222); // Глаза
    g.fillCircle(17, 11, 2);
    g.fillCircle(23, 11, 2);
    g.fillStyle(0xffdbac); // Ноги
    g.fillRect(15, 54, 3, 12);
    g.fillRect(22, 54, 3, 12);
    g.generateTexture('survivor4', 40, 65);
    g.clear();
    
    // ============ УБИЙЦА - Монстр ============
    g.fillStyle(0x1a1a1a); // Чёрное тело
    g.fillRect(8, 20, 24, 35);
    g.fillStyle(0x8B0000); // Красная грудь
    g.fillRect(10, 22, 20, 15);
    g.fillStyle(0x4a0000); // Пятна крови
    g.fillCircle(15, 30, 4);
    g.fillCircle(25, 35, 3);
    g.fillStyle(0xffdbac); // Лицо
    g.fillCircle(20, 12, 12);
    g.fillStyle(0x1a1a1a); // Маска
    g.fillRect(10, 6, 20, 14);
    g.fillStyle(0xff0000); // Глаза-маски
    g.fillCircle(15, 12, 4);
    g.fillCircle(25, 12, 4);
    g.fillStyle(0x330000); // Рот-маска
    g.fillRect(15, 18, 10, 4);
    g.fillStyle(0x1a1a1a); // Ноги
    g.fillRect(10, 52, 8, 15);
    g.fillRect(22, 52, 8, 15);
    g.generateTexture('killer_m', 40, 70);
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
    
    // Выход
    g.fillStyle(0x8B4513);
    g.fillRect(0, 0, 60, 50);
    g.fillStyle(0x654321);
    g.fillRect(5, 5, 20, 40);
    g.fillRect(35, 5, 20, 40);
    g.fillStyle(0xff0000);
    g.fillCircle(30, 25, 8);
    g.generateTexture('exit', 60, 50);
    g.clear();
    
    // Стена
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
    const mapW = 1200, mapH = 900;
    
    for (let x = 0; x < mapW; x += 32) {
        for (let y = 0; y < mapH; y += 32) {
            const t = this.add.image(x + 16, y + 16, 'ground');
            t.setAlpha(0.5 + Math.random() * 0.5);
        }
    }
    
    const treePositions = [
        {x: 50, y: 50}, {x: 150, y: 80}, {x: 80, y: 150},
        {x: 1100, y: 50}, {x: 1050, y: 120}, {x: 1150, y: 150},
        {x: 50, y: 800}, {x: 120, y: 850}, {x: 80, y: 750},
        {x: 1100, y: 800}, {x: 1050, y: 850}, {x: 1150, y: 750},
        {x: 600, y: 50}, {x: 300, y: 300}, {x: 900, y: 300},
        {x: 300, y: 600}, {x: 900, y: 600}
    ];
    treePositions.forEach(p => this.add.image(p.x, p.y, 'tree').setDepth(p.y));
    
    const bushPositions = [
        {x: 200, y: 200}, {x: 400, y: 150}, {x: 800, y: 200},
        {x: 200, y: 700}, {x: 1000, y: 400}, {x: 600, y: 700}
    ];
    bushPositions.forEach(p => this.add.image(p.x, p.y, 'bush').setDepth(p.y));
    
    const walls = [{x: 600, y: 200}, {x: 300, y: 450}, {x: 900, y: 450}, {x: 600, y: 700}];
    walls.forEach(w => this.add.image(w.x, w.y, 'wall'));
    
    const genPositions = [{x: 150, y: 150}, {x: 1050, y: 150}, {x: 600, y: 350}, {x: 150, y: 750}, {x: 1050, y: 750}];
    genPositions.forEach((p, i) => {
        const gen = this.add.sprite(p.x, p.y, 'generator');
        gen.progress = 0;
        gen.repaired = false;
        const bar = this.add.graphics();
        bar.x = p.x - 20; bar.y = p.y - 20;
        gen.bar = bar;
        generators.push(gen);
    });
    
    this.exit = this.add.sprite(1150, 450, 'exit');
    this.exit.setTint(0x440000);
    
    player = isKiller ? this.add.sprite(600, 450, 'killer_m') : this.add.sprite(150, 150, 'survivor1');
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    player.setDepth(1000);
    
    if (!isKiller) {
        this.survivors = [];
        const survivorPositions = [{x: 1050, y: 150}, {x: 150, y: 750}, {x: 1050, y: 750}];
        const survivorTextures = ['survivor2', 'survivor3', 'survivor4'];
        survivorPositions.forEach((p, i) => {
            const s = this.add.sprite(p.x, p.y, survivorTextures[i]);
            s.alive = true;
            this.physics.add.existing(s);
            s.body.setCollideWorldBounds(true);
            s.setDepth(p.y);
            this.survivors.push(s);
        });
    } else {
        this.survivors = [];
    }
    
    this.cameras.main.setBounds(0, 0, mapW, mapH);
    this.cameras.main.startFollow(player);
    
    Input.init(this);
}

function update(time, delta) {
    if (!player) return;
    
    const vec = Input.getVector();
    const speed = isKiller ? CONFIG.KILLER_SPEED : CONFIG.PLAYER_SPEED;
    player.body.setVelocity(vec.x * speed, vec.y * speed);
    
    if (!isKiller) {
        this.survivors.forEach(s => {
            if (s.alive) {
                if (Math.random() < 0.02) s.body.setVelocity((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
                const dist = Phaser.Math.Distance.Between(s.x, s.y, player.x, player.y);
                if (dist < 150) {
                    const angle = Phaser.Math.Angle.Between(s.x, s.y, player.x, player.y);
                    s.body.setVelocity(Math.cos(angle) * 80, Math.sin(angle) * 80);
                }
            }
        });
        
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
                            UI.showToast('Генератор починен!');
                        }
                    }
                }
            });
        }
        
        const repaired = generators.filter(g => g.repaired).length;
        if (repaired >= CONFIG.GENERATOR_COUNT && !exitOpen) {
            exitOpen = true;
            this.exit.setTint(0x00ff00);
            UI.showToast('ВЫХОД ОТКРЫТ!');
        }
        
        if (exitOpen) {
            const dist = Phaser.Math.Distance.Between(player.x, player.y, this.exit.x, this.exit.y);
            if (dist < 50) {
                UI.showGameOver(true);
                stopGame();
                return;
            }
        }
    }
    
    if (isKiller && catchCooldown > 0) catchCooldown -= delta / 1000;
    
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
    UI.updateHUD(isKiller ? 'killer' : 'survivor', generators.filter(g => g.repaired).length, exitOpen, survivorsLeft);
}

document.getElementById('btn-single').onclick = () => UI.showScreen('role-select');
document.getElementById('btn-play-killer').onclick = () => startGame(true);
document.getElementById('btn-play-survivor').onclick = () => startGame(false);
document.getElementById('btn-back-menu').onclick = () => { stopGame(); UI.showScreen('main-menu'); };
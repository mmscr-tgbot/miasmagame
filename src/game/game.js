const CONFIG = {
    PLAYER_SPEED: 150,
    KILLER_SPEED: 175,
    GENERATOR_COUNT: 5,
    CATCH_DISTANCE: 50,
    CATCH_COOLDOWN: 2,
    EXIT_OPEN_TIME: 10
};

let game = null;
let player = null;
let killer = null;
let generators = [];
let isKiller = false;
let gameTime = 0;
let exitOpen = false;
let survivorsLeft = 4;
let catchCooldown = 0;

function initApp() {
    console.log('Miasma Massacre start');
    
    UI.init();
    UI.showScreen('loading');
    
    setTimeout(() => {
        UI.showScreen('mainMenu');
    }, 500);
    
    initTelegram();
}

function initTelegram() {
    if (window.Telegram && Telegram.WebApp) {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
    }
}

const UI = {
    screens: {},
    
    init() {
        this.screens = {
            loading: document.getElementById('loading-screen'),
            mainMenu: document.getElementById('main-menu'),
            roleSelect: document.getElementById('role-select'),
            gameScreen: document.getElementById('game-screen'),
            gameOver: document.getElementById('game-over')
        };
        
        document.getElementById('btn-single').onclick = () => this.showScreen('roleSelect');
        document.getElementById('btn-play-killer').onclick = () => startGame(true);
        document.getElementById('btn-play-survivor').onclick = () => startGame(false);
        document.getElementById('btn-back-menu').onclick = () => {
            stopGame();
            this.showScreen('mainMenu');
        };
    },
    
    showScreen(name) {
        Object.values(this.screens).forEach(s => s.classList.remove('active'));
        if (this.screens[name]) this.screens[name].classList.add('active');
    },
    
    showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        setTimeout(() => t.classList.add('hidden'), 2000);
    },
    
    updateHUD(role, genCount, exit, alive) {
        document.getElementById('player-role').textContent = role === 'killer' ? 'Убийца' : 'Выживший';
        document.getElementById('gen-count').textContent = genCount;
        document.getElementById('exit-state').textContent = exit ? 'открыт' : 'закрыт';
        document.getElementById('alive-count').textContent = 'Выжившие: ' + alive;
    },
    
    showGameOver(won) {
        document.getElementById('game-result-title').textContent = won ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ';
        document.getElementById('game-result-message').textContent = won 
            ? 'Ты сбежал!' 
            : isKiller ? 'Ты поймал всех!' : 'Тебя поймали!';
        this.showScreen('gameOver');
    }
};

function startGame(killerMode) {
    isKiller = killerMode;
    gameTime = 0;
    exitOpen = false;
    catchCooldown = 0;
    survivorsLeft = 4;
    generators = [];
    
    UI.showScreen('gameScreen');
    UI.showToast(isKiller ? 'Ты Убийца!' : 'Найди генераторы!');
    
    initGame();
}

function stopGame() {
    if (game) {
        game.destroy();
        game = null;
    }
}

function initGame() {
    const container = document.getElementById('game-container');
    container.innerHTML = '';
    
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: w,
        height: h,
        backgroundColor: '#1a1a2e',
        physics: { default: 'arcade', arcade: { gravity: { y: 0 } } },
        scene: { preload, create, update }
    });
}

function preload() {
    const g = this.make.graphics();
    
    g.fillStyle(0xff3333);
    g.fillCircle(20, 20, 20);
    g.generateTexture('killer', 40, 40);
    g.clear();
    
    g.fillStyle(0x33ff33);
    g.fillCircle(15, 15, 15);
    g.generateTexture('survivor', 30, 30);
    g.clear();
    
    g.fillStyle(0x4444ff);
    g.fillRect(0, 0, 30, 30);
    g.generateTexture('gen', 30, 30);
    g.clear();
    
    g.fillStyle(0x00ff00);
    g.fillRect(0, 0, 50, 20);
    g.generateTexture('exit', 50, 20);
    g.clear();
    
    g.fillStyle(0x333344);
    g.fillRect(0, 0, 40, 40);
    g.generateTexture('wall', 40, 40);
}

function create() {
    const mapW = 800;
    const mapH = 600;
    
    this.add.rectangle(0, 0, mapW, mapH, 0x1a1a2e).setOrigin(0);
    this.add.grid(mapW/2, mapH/2, mapW, mapH, 40, 40, 0x222233).setAlpha(0.3);
    
    const walls = [
        {x: 150, y: 150, w: 20, h: 100},
        {x: 150, y: 150, w: 100, h: 20},
        {x: 650, y: 150, w: 20, h: 100},
        {x: 600, y: 150, w: 100, h: 20},
        {x: 400, y: 300, w: 20, h: 150},
        {x: 150, y: 450, w: 100, h: 20},
        {x: 650, y: 450, w: 100, h: 20},
        {x: 300, y: 500, w: 20, h: 80},
    ];
    
    walls.forEach(w => {
        this.add.rectangle(w.x, w.y, w.w, w.h, 0x333344).setOrigin(0);
    });
    
    const genPositions = [
        {x: 120, y: 100}, {x: 680, y: 100},
        {x: 400, y: 200}, {x: 120, y: 500},
        {x: 680, y: 500}
    ];
    
    genPositions.forEach((p, i) => {
        const gen = this.add.sprite(p.x, p.y, 'gen');
        gen.progress = 0;
        gen.repaired = false;
        gen.id = i + 1;
        generators.push(gen);
    });
    
    this.exit = this.add.sprite(750, 300, 'exit');
    this.exit.setTint(0x444444);
    
    if (isKiller) {
        player = this.add.circle(400, 300, 20, 0xff3333);
        player.role = 'killer';
    } else {
        player = this.add.circle(100, 500, 15, 0x33ff33);
        player.role = 'survivor';
    }
    
    this.physics.add.existing(player);
    player.body.setCollideWorldBounds(true);
    
    if (!isKiller) {
        const survivors = [];
        for (let i = 0; i < 3; i++) {
            const s = this.add.circle(200 + i * 150, 500, 15, 0x33ff33);
            s.role = 'survivor';
            s.alive = true;
            this.physics.add.existing(s);
            s.body.setCollideWorldBounds(true);
            s.body.setVelocity(0);
            survivors.push(s);
        }
        this.survivors = survivors;
    } else {
        this.survivors = [];
    }
    
    this.cameras.main.setBounds(0, 0, mapW, mapH);
    this.cameras.main.startFollow(player);
    
    Input.init();
}

function update(time, delta) {
    if (!player) return;
    
    gameTime += delta / 1000;
    
    const vec = Input.getVector();
    const speed = isKiller ? CONFIG.KILLER_SPEED : CONFIG.PLAYER_SPEED;
    player.body.setVelocity(vec.x * speed, vec.y * speed);
    
    if (!isKiller) {
        this.survivors.forEach(s => {
            if (s.alive) {
                const dist = Phaser.Math.Distance.Between(s.x, s.y, player.x, player.y);
                if (dist > 80) {
                    s.x += (Math.random() - 0.5) * 2;
                    s.y += (Math.random() - 0.5) * 2;
                }
            }
        });
        
        if (Input.isActionPressed()) {
            generators.forEach(gen => {
                if (!gen.repaired) {
                    const dist = Phaser.Math.Distance.Between(player.x, player.y, gen.x, gen.y);
                    if (dist < 50) {
                        gen.progress += delta / 100;
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
            this.exit.clearTint();
            UI.showToast('ВЫХОД ОТКРЫТ!');
        }
        
        if (exitOpen) {
            const dist = Phaser.Math.Distance.Between(player.x, player.y, this.exit.x, this.exit.y);
            if (dist < 40) {
                UI.showGameOver(true);
                stopGame();
                return;
            }
        }
    }
    
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
    
    let repaired = 0;
    generators.forEach(g => { if (g.repaired) repaired++; });
    UI.updateHUD(isKiller ? 'killer' : 'survivor', repaired + '/5', exitOpen, survivorsLeft);
}

document.addEventListener('DOMContentLoaded', initApp);
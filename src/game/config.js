var CONFIG = {
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

var MAP_W = 2400;
var MAP_H = 1800;

var UI = {
    showScreen: function(name) {
        var screens = ['loading-screen', 'main-menu', 'role-select', 'lobby-create', 'lobby-join', 'game-screen', 'game-over'];
        screens.forEach(function(s) {
            var el = document.getElementById(s);
            if (el) el.classList.remove('active');
        });
        var target = document.getElementById(name);
        if (target) target.classList.add('active');
    },

    showToast: function(msg, duration) {
        if (duration === undefined) duration = 2500;
        var t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.remove('show');
        void t.offsetWidth;
        t.classList.add('show');
        if (duration > 0) setTimeout(function() { t.classList.remove('show'); }, duration);
    },

    updateHUD: function(role, state, genCount, exit, hatch, alive) {
        var roleEl = document.getElementById('player-role');
        var genEl = document.getElementById('gen-count');
        var exitEl = document.getElementById('exit-state');
        var aliveEl = document.getElementById('alive-count');

        if (roleEl) {
            if (role === 'killer') {
                roleEl.textContent = 'Убийца';
            } else {
                var stateText = state === 'injured' ? '🩸Ранен' : state === 'dying' ? '💀Упал' : state === 'hooked' ? '🪝Крюк' : 'жив';
                roleEl.textContent = stateText;
            }
        }
        if (genEl) genEl.textContent = genCount + '/5';
        if (exitEl) exitEl.textContent = exit ? (hatch ? 'люк🔒' : 'открыт!') : 'закрыт';
        if (aliveEl) aliveEl.textContent = '🏃 ' + alive;
    },

    showGameOver: function(won, message) {
        var title = document.getElementById('game-result-title');
        var msg = document.getElementById('game-result-message');
        if (title) title.textContent = won ? '🎉 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ';
        if (msg) msg.textContent = message || '';
        this.showScreen('game-over');
    }
};

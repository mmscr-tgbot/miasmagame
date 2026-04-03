// ═══════ UTILITY FUNCTIONS ═══════

function dist(a, b) {
    var ax = a.x||0, ay = a.y||0, bx = b.x||0, by = b.y||0;
    return Math.sqrt((ax-bx)*(ax-bx)+(ay-by)*(ay-by));
}

function seededRandom(seed) {
    var s = seed;
    return function() {
        s = Math.sin(s * 9999) * 10000;
        return s - Math.floor(s);
    };
}

function hashCode(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        var char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function getTexWithFallback(tex, suffix) {
    return tex + suffix;
}

function normalize(v) {
    var l = Math.sqrt(v.x*v.x+v.y*v.y);
    if (l < 0.01) return {x:0,y:0};
    return {x:v.x/l, y:v.y/l};
}

function moveTo(sp, tx, ty, spd) {
    var dx = tx-sp.x, dy = ty-sp.y, d = Math.sqrt(dx*dx+dy*dy);
    if (d < 2) { sp.body.setVelocity(0,0); return; }
    sp.body.setVelocity((dx/d)*spd, (dy/d)*spd);
}

function nearestAliveTarget(sp, maxD) {
    var best = null, bd = maxD;
    var pool = [];
    if (isMultiplayer && isKiller) {
        pool = Object.values(remotePlayers).filter(function(rp) { return rp.role === 'survivor' && rp.state !== 'dead'; });
    } else if (isKiller) {
        pool = (player.aiPlayers || []).filter(function(a) { return a.state !== 'dead'; });
    } else {
        pool = (player.aiPlayers || []).filter(function(a) { return a.isAIKiller; });
    }
    pool.forEach(function(target) {
        if (!target || target.state === 'dead') return;
        var d = dist(sp, target.sprite);
        if (d < bd) { bd = d; best = target.sprite; }
    });
    return best;
}

function nearestFreeHook(sp) {
    var best = null, bd = 9999;
    hooks.forEach(function(h) {
        if (!h.occupied) { var d = dist(sp, h); if (d < bd) { bd = d; best = h; } }
    });
    return best;
}

function nearestFreeHookById(id) {
    if (id === undefined || id === null) return nearestFreeHook({x:0,y:0});
    return hooks.find(function(h) { return h.hookId === id; }) || null;
}

function hangSurvivor(p, hook) {
    hook.occupied = true; hook.hookedSurvivor = p; p.hookTimer = 0; p.state = 'hooked';
    p.sprite.setTint(0xaaaaaa);
    if (p.sprite.texture.key.includes('_carried')) {
        p.sprite.setTexture(p.tex); p.sprite.setScale(1,1); p.sprite.setRotation(0);
        p._carryAnimTimer = 0; p._carryAnimPhase = 'idle'; p._carryAnimDuration = 0; p._carryIdlePhase = 0;
    } else {
        p.sprite.setTexture(p.tex);
    }
    p.sprite.setPosition(hook.x, hook.y - 12);
    if (!p.isMe) survivorsAlive = Math.max(0, survivorsAlive - 1);
}

function drawBar(gfx, bx, by, pct, color) {
    gfx.clear(); pct = Math.max(0, Math.min(100, pct));
    gfx.fillStyle(0x000000, 0.75); gfx.fillRect(bx-25, by-30, 50, 8);
    gfx.fillStyle(color, 1); gfx.fillRect(bx-24, by-29, 48*(pct/100), 6);
}

function flushFloatBars() {
    if (!floatBarGfx) return; floatBarGfx.clear();
    floatBars.forEach(function(b) {
        var pct = Math.max(0, Math.min(100, b.pct));
        floatBarGfx.fillStyle(0x000000, 0.75); floatBarGfx.fillRect(b.wx-25, b.wy, 50, 8);
        floatBarGfx.fillStyle(b.color, 1); floatBarGfx.fillRect(b.wx-24, b.wy+1, 48*(pct/100), 6);
    });
    floatBars = [];
}

function updateActionButton(forHook) {
    var ab = document.getElementById('action-btn');
    if (!ab) return;
    if (forHook) { ab.textContent = '\uD83E\uDE9D'; ab.style.background = 'linear-gradient(135deg,#ff3333,#aa0000)'; ab.style.boxShadow = '0 0 16px rgba(255,50,50,0.7)'; }
    else { ab.textContent = '\u26A1'; ab.style.background = 'linear-gradient(135deg,#ff6600,#cc2200)'; ab.style.boxShadow = '0 0 16px rgba(255,80,0,0.5)'; }
}

function updateActionButtonForHatch(forHatch) {
    var ab = document.getElementById('action-btn');
    if (!ab) return;
    if (forHatch) { ab.textContent = '\uD83D\uDEAA'; ab.style.background = 'linear-gradient(135deg,#ffaa00,#cc8800)'; ab.style.boxShadow = '0 0 16px rgba(255,170,0,0.7)'; }
}

function updateActionButtonForGate(forGate) {
    var ab = document.getElementById('action-btn');
    if (!ab) return;
    if (forGate) { ab.textContent = '\uD83D\uDEAA'; ab.style.background = 'linear-gradient(135deg,#44cc66,#22aa44)'; ab.style.boxShadow = '0 0 16px rgba(68,204,102,0.7)'; }
}

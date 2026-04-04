// ═══════ PALLETS - DbD Style ═══════

function createPallets(sc) {
    // Pallet positions - placed in logical chase areas
    // Between buildings, near walls, in open areas, NOT near generators/hooks
    var palletPositions = [
        // Between building clusters
        { x: 450, y: 450 },   // Between NW buildings
        { x: 1050, y: 450 },  // Between N buildings
        { x: 1650, y: 450 },  // Between NE buildings
        { x: 450, y: 750 },   // Between W buildings
        { x: 1050, y: 700 },  // Center area
        { x: 1650, y: 750 },  // Between E buildings
        { x: 450, y: 1050 },  // Between SW buildings
        { x: 1050, y: 1050 }, // Center-south
        { x: 1650, y: 1050 }, // Between SE buildings
        { x: 750, y: 1200 },  // South area
        { x: 1350, y: 1200 }, // South area
        { x: 750, y: 600 },   // Mid-west chase
        { x: 1350, y: 600 },  // Mid-east chase
        { x: 200, y: 600 },   // West edge chase
        { x: 2200, y: 600 },  // East edge chase
        { x: 200, y: 1200 },  // SW edge
        { x: 2200, y: 1200 }, // SE edge
        { x: 600, y: 300 },   // North chase
        { x: 1200, y: 300 },  // North center
        { x: 1800, y: 300 },  // NE chase
        { x: 600, y: 1500 },  // South chase
        { x: 1200, y: 1500 }, // South center
        { x: 1800, y: 1500 }, // SE chase
        // Extra chase route pallets
        { x: 350, y: 900 },   // West corridor
        { x: 900, y: 900 },   // Mid corridor
        { x: 1500, y: 900 },  // East corridor
        { x: 2100, y: 900 },  // Far east
    ];
    
    // Filter out positions too close to generators or hooks
    var genPositions = [];
    if (generators.length > 0) {
        generators.forEach(function(g) { genPositions.push({ x: g.bx, y: g.by }); });
    } else {
        // Default gen positions
        genPositions = [
            { x: 400, y: 350 }, { x: 1000, y: 300 }, { x: 1600, y: 400 },
            { x: 600, y: 1100 }, { x: 1400, y: 1200 }
        ];
    }
    
    var hookPositions = [
        { x: 500, y: 450 }, { x: 1900, y: 450 }, { x: 500, y: 1350 }, { x: 1900, y: 1350 },
        { x: 1200, y: 500 }, { x: 1200, y: 1300 }, { x: 800, y: 900 }, { x: 1600, y: 900 }
    ];
    
    var validPositions = [];
    palletPositions.forEach(function(pp) {
        var tooClose = false;
        
        // Check distance from generators (min 120px)
        for (var i = 0; i < genPositions.length; i++) {
            var d = Math.sqrt(Math.pow(pp.x - genPositions[i].x, 2) + Math.pow(pp.y - genPositions[i].y, 2));
            if (d < 120) { tooClose = true; break; }
        }
        
        // Check distance from hooks (min 100px)
        if (!tooClose) {
            for (var i = 0; i < hookPositions.length; i++) {
                var d = Math.sqrt(Math.pow(pp.x - hookPositions[i].x, 2) + Math.pow(pp.y - hookPositions[i].y, 2));
                if (d < 100) { tooClose = true; break; }
            }
        }
        
        if (!tooClose) {
            validPositions.push(pp);
        }
    });
    
    // Create pallets
    validPositions.forEach(function(p, i) {
        var isStanding = Math.random() > 0.3;
        
        var sp = sc.add.sprite(p.x, p.y, isStanding ? 'pallet' : 'pallet_falling');
        sp.setDepth(p.y + 2);
        sp.setScale(isStanding ? 1.2 : 1, isStanding ? 1 : 1);
        sp.setRotation(isStanding ? 0 : Math.PI / 2);
        
        sp.palletId = i;
        sp.state = isStanding ? 'standing' : 'fallen';
        sp.dropTimer = 0;
        sp.breakTimer = isStanding ? 0 : 10 + Math.random() * 10;
        sp.dropCooldown = 0;
        sp.stunTimer = 0;
        sp.bx = p.x;
        sp.by = p.y;
        sp.sprite = sp; // Reference to itself for consistency
        
        sp.shadow = sc.add.graphics();
        sp.shadow.fillStyle(0x000000, 0.3);
        if (isStanding) {
            sp.shadow.fillEllipse(p.x, p.y + 35, 30, 12);
        } else {
            sp.shadow.fillEllipse(p.x, p.y + 15, 50, 15);
        }
        sp.shadow.setDepth(p.y);
        
        pallets.push(sp);
    });
}

function updatePallets(dt) {
    var nearPallet = false;
    
    pallets.forEach(function(pallet) {
        var sp = pallet.sprite || pallet;
        if (!sp || !sp.setTexture) return;
        
        if (pallet.dropCooldown > 0) pallet.dropCooldown -= dt / 1000;
        if (pallet.stunTimer > 0) pallet.stunTimer -= dt / 1000;
        
        // Dropped pallet animation
        if (pallet.state === 'dropping') {
            pallet.dropTimer += dt / 1000;
            var fallProgress = pallet.dropTimer / 0.3;
            
            if (fallProgress >= 1) {
                pallet.state = 'fallen';
                sp.setTexture('pallet_falling');
                sp.setScale(1, 1);
                sp.setRotation(Math.PI / 2);
                
                var killerHit = checkPalletStun(pallet);
                
                if (killerHit) {
                    pallet.stunTimer = 0.5;
                    pallet.hitFx = scene.add.graphics();
                    pallet.hitFx.fillStyle(0xffff00, 0.5);
                    pallet.hitFx.fillCircle(pallet.bx, pallet.by - 20, 40);
                    pallet.hitFx.setDepth(500);
                    setTimeout(function() { if (pallet.hitFx) pallet.hitFx.destroy(); }, 300);
                    matchStats.palletsStunned++;
                    addBloodpoints('deviousness', 2000, 'Оглушение убийцы');
                }
                
                pallet.breakTimer = 15;
                
                if (isMultiplayer && roomCode && playerId) {
                    updatePalletState(roomCode, pallet.palletId, 'fallen', pallet.bx, pallet.by);
                }
            } else {
                var angle = fallProgress * Math.PI / 2;
                sp.setScale(1.2, 1 - fallProgress * 0.3);
                sp.setRotation(angle);
            }
        }
        
        // Fallen pallet breaks over time
        if (pallet.state === 'fallen') {
            pallet.breakTimer -= dt / 1000;
            if (pallet.breakTimer <= 0) {
                pallet.state = 'broken';
                sp.setAlpha(0.5);
                sp.setScale(1, 0.5);
            }
        }
        
        // Broken pallet fades out
        if (pallet.state === 'broken') {
            pallet.breakTimer -= dt / 1000;
            sp.setAlpha(Math.max(0, (pallet.breakTimer + 2) / 2));
            if (pallet.breakTimer <= -2) {
                sp.setVisible(false);
                if (pallet.shadow) pallet.shadow.setVisible(false);
            }
        }
        
        // Update shadow
        if (pallet.shadow && sp && sp.visible) {
            pallet.shadow.clear();
            if (pallet.state === 'standing') {
                pallet.shadow.fillStyle(0x000000, 0.3);
                pallet.shadow.fillEllipse(pallet.bx, pallet.by + 35, 30, 12);
            } else if (pallet.state === 'fallen' || pallet.state === 'dropping') {
                pallet.shadow.fillStyle(0x000000, 0.3);
                pallet.shadow.fillEllipse(pallet.bx, pallet.by + 15, 50, 15);
            }
        }
        
        // Check proximity for button display
        if (player && player.sprite) {
            var d = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
            if (d < 50) {
                if (!isKiller && pallet.state === 'standing' && pallet.dropCooldown <= 0) nearPallet = true;
                if (isKiller && (pallet.state === 'standing' || pallet.state === 'fallen')) nearPallet = true;
            }
        }
    });
    
    var pbtn = document.getElementById('pallet-btn');
    if (pbtn) {
        if (nearPallet) {
            pbtn.style.display = 'flex';
            pbtn.textContent = isKiller ? '\uD83D\uDD28' : '\uD83E\uDEB5';
        } else {
            pbtn.style.display = 'none';
        }
    }
    
    if (palletPressed) {
        palletPressed = false;
        
        if (!isKiller) {
            pallets.forEach(function(pallet) {
                if (pallet.state === 'standing' && pallet.dropCooldown <= 0 && player && player.sprite) {
                    var d = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
                    if (d < 50) dropPallet(pallet);
                }
            });
        } else {
            pallets.forEach(function(pallet) {
                if (pallet.state === 'fallen' && player && player.sprite) {
                    var d = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
                    if (d < 50) breakPallet(pallet);
                }
            });
        }
    }
}

function checkPalletStun(pallet) {
    var killerHit = false;
    
    // Check local killer
    if (isKiller && player && player.sprite) {
        var d = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
        if (d < 60) {
            killerHit = true;
            killerStun = CONFIG.STUN_TIME;
            UI.showToast('\uD83D\uDCA5 \u0423\u0431\u0438\u0439\u0446\u0430 \u043E\u0433\u043B\u0443\u0448\u0451\u043D!', 1500);
        }
    }
    
    // Check AI killer
    if (!killerHit && !isKiller && !isMultiplayer && player && player.aiPlayers) {
        player.aiPlayers.forEach(function(ai) {
            if (ai.isAIKiller && ai.sprite && !killerHit) {
                var d = Math.sqrt(Math.pow(ai.sprite.x - pallet.bx, 2) + Math.pow(ai.sprite.y - pallet.by, 2));
                if (d < 60) {
                    killerHit = true;
                    killerStun = CONFIG.STUN_TIME;
                    ai.slowdownTimer = CONFIG.STUN_TIME;
                    UI.showToast('\uD83D\uDCA5 \u0423\u0431\u0438\u0439\u0446\u0430 \u043E\u0433\u043B\u0443\u0448\u0451\u043D!', 1500);
                }
            }
        });
    }
    
    // Check remote killer
    if (isMultiplayer && !killerHit) {
        Object.values(remotePlayers).forEach(function(rp) {
            if (rp.role === 'killer' && rp.sprite && !killerHit) {
                var d = Math.sqrt(Math.pow(rp.sprite.x - pallet.bx, 2) + Math.pow(rp.sprite.y - pallet.by, 2));
                if (d < 60) {
                    killerHit = true;
                    if (isMultiplayer && roomCode && playerId) stunRemoteKiller(roomCode);
                    UI.showToast('\uD83D\uDCA5 \u0423\u0431\u0438\u0439\u0446\u0430 \u043E\u0433\u043B\u0443\u0448\u0451\u043D!', 1500);
                }
            }
        });
    }
    
    return killerHit;
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
    matchStats.palletsDropped++;
    addBloodpoints('objective', 1000, 'Доска сброшена');
    UI.showToast('\uD83D\uDCA8 \u0414\u043E\u0441\u043A\u0430 \u043F\u0430\u0434\u0430\u0435\u0442!', 800);
    if (isMultiplayer && roomCode && playerId) {
        updatePalletState(roomCode, pallet.palletId, 'dropping', pallet.bx, pallet.by);
    }
}

function breakPallet(pallet) {
    if (pallet.state !== 'fallen') return;
    pallet.state = 'broken';
    pallet.breakTimer = 0;
    pallet.sprite.setAlpha(0.5);
    pallet.sprite.setScale(1, 0.5);
    UI.showToast('\uD83D\uDCAA \u0423\u0431\u0438\u0439\u0446\u0430 \u043B\u043E\u043C\u0430\u0435\u0442 \u0434\u043E\u0441\u043A\u0443!', 1000);
    if (isMultiplayer && roomCode && playerId) {
        updatePalletState(roomCode, pallet.palletId, 'broken', pallet.bx, pallet.by);
    }
}

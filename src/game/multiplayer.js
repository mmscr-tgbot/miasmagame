// ═══════ MULTIPLAYER SYNC ═══════

function initMultiplayerSync() {
    console.log('[MP] initMultiplayerSync started');
    if (!roomCode || !playerId) {
        console.log('[MP] ABORT: no roomCode or playerId', roomCode, playerId);
        return;
    }

    try {
        initializeGenerators(roomCode);
        initializeCrows(roomCode, scene.crows ? scene.crows.length : 8);

        subscribeToGameSession(roomCode, {
            onPlayersUpdate: function(players) {
                console.log('[MP] onPlayersUpdate', Object.keys(players));
                updateRemotePlayers(players);
            },
            onGeneratorsUpdate: function(gens) {
                console.log('[MP] onGeneratorsUpdate', gens);
                updateGeneratorsFromServer(gens);
            },
            onCrowsUpdate: function(crowsData) {
                console.log('[MP] onCrowsUpdate');
                updateCrowsFromServer(crowsData);
            },
            onGateUpdate: function(gate) {
                console.log('[MP] onGateUpdate', gate);
                if (gate.opened && !exitOpen) {
                    exitOpen = true;
                    UI.showToast('\u26a1 \u0412\u043e\u0440\u043e\u0442\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u044b!', 2000);
                }
            },
            onHatchUpdate: function(hatchData) {
                console.log('[MP] onHatchUpdate', hatchData);
                if (hatchData.spawned && !hatch) {
                    var glow = scene.add.graphics();
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
            onKillerStun: function() {
                console.log('[MP] onKillerStun');
                if (!isKiller) {
                    killerStun = CONFIG.STUN_TIME;
                    UI.showToast('\uD83D\uDCA5 \u0423\u0431\u0438\u0439\u0446\u0430 \u043e\u0433\u043b\u0443\u0448\u0451\u043d \u0434\u043e\u0441\u043a\u043e\u0439!', 1500);
                }
            },
            onPalletsUpdate: function(palletsData) {
                console.log('[MP] onPalletsUpdate');
                updatePalletsFromServer(palletsData);
            },
            onGameResult: function(winner, message) {
                console.log('[MP] onGameResult', winner, message);
                var won = (winner === (isKiller ? 'killer' : 'survivors'));
                doEndGame(won, message);
            },
            onError: function(error) {
                console.error('[MP] Game session error:', error);
            }
        });

        console.log('[MP] Multiplayer sync initialized for room:', roomCode);
        
        startPingMeasurement();
    } catch (e) {
        console.error('[MP] ERROR in initMultiplayerSync:', e);
    }
}

// ═══════ PING MEASUREMENT ═══════
function startPingMeasurement() {
    if (!isMultiplayer || !roomCode) return;
    
    var pingIndicator = document.getElementById('ping-indicator');
    if (pingIndicator) {
        pingIndicator.style.display = 'block';
    }
    
    measurePing();
}

function measurePing() {
    if (!isMultiplayer || !roomCode || !db) return;
    
    var pingId = 'ping_' + Date.now();
    pingTimestamps[pingId] = Date.now();
    
    db.ref('rooms/' + roomCode + '/ping/' + playerId).set({
        id: pingId,
        time: Date.now()
    }).then(function() {
        setTimeout(function() {
            checkPingResponse(pingId);
        }, 1000);
    }).catch(function() {});
}

function checkPingResponse(pingId) {
    var sentTime = pingTimestamps[pingId];
    if (sentTime) {
        localPing = Date.now() - sentTime;
        delete pingTimestamps[pingId];
        updatePingDisplay();
    }
    
    setTimeout(function() {
        measurePing();
    }, 2000);
}

function updatePingDisplay() {
    var pingIcon = document.getElementById('ping-icon');
    var pingValue = document.getElementById('ping-value');
    
    if (!pingIcon || !pingValue) return;
    
    var ping = localPing;
    pingValue.textContent = ping + 'ms';
    
    if (ping < 100) {
        pingIcon.textContent = '🟢';
        pingValue.style.color = '#44ff44';
    } else if (ping < 200) {
        pingIcon.textContent = '🟡';
        pingValue.style.color = '#ffcc00';
    } else if (ping < 400) {
        pingIcon.textContent = '🟠';
        pingValue.style.color = '#ff8800';
    } else {
        pingIcon.textContent = '🔴';
        pingValue.style.color = '#ff4444';
    }
}

function updateRemotePlayers(players) {
    if (!scene) return;

    Object.keys(players).forEach(function(pid) {
        if (pid === playerId) return;

        var pdata = players[pid];

        if (remotePlayers[pid]) {
            var rp = remotePlayers[pid];
            rp.targetX = pdata.x;
            rp.targetY = pdata.y;
            rp.state = pdata.state || rp.state;
            rp.animation = pdata.animation || null;

            // Always hide 2D killer sprite - 3D model is used instead
            if (rp.role === 'killer') {
                rp.sprite.setVisible(false);
            }

            if (pdata.state === 'dead') {
                rp.sprite.setAlpha(0.3);
                rp.sprite.setVelocity(0, 0);
            } else if (pdata.state === 'alive') {
                rp.sprite.clearTint();
                if (rp.sprite.texture.key.includes('_dying') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                }
                if (rp.sprite.texture.key.includes('_carried') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                    rp.sprite.setScale(1, 1);
                    rp.sprite.setRotation(0);
                }
            } else if (pdata.state === 'injured') {
                rp.sprite.clearTint();
                if (rp.sprite.texture.key.includes('_dying') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                }
                if (rp.sprite.texture.key.includes('_carried') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                    rp.sprite.setScale(1, 1);
                    rp.sprite.setRotation(0);
                }
                rp.sprite.setTint(0xff8888);
            } else if (pdata.state === 'dying') {
                if (!rp.sprite.texture.key.includes('_dying') && rp.tex) {
                    rp.sprite.setTexture(getTexWithFallback(rp.tex, '_dying'));
                }
                rp.sprite.setTint(0xff4444);
            } else if (pdata.state === 'carried') {
                if (!rp.sprite.texture.key.includes('_carried') && rp.tex) {
                    rp.sprite.setTexture(getTexWithFallback(rp.tex, '_carried'));
                }
                rp.sprite.setVelocity(0, 0);
            } else if (pdata.state === 'hooked') {
                var hook = hooks.find(function(h) { return h.hookId === pdata.hookId; });
                if (hook) {
                    rp.sprite.setPosition(hook.x, hook.y - 12);
                    rp.targetX = hook.x;
                    rp.targetY = hook.y - 12;
                    rp.sprite.setVelocity(0, 0);
                }
                if (rp.sprite.texture.key.includes('_carried') && rp.tex) {
                    rp.sprite.setTexture(rp.tex);
                    rp.sprite.setScale(1, 1);
                    rp.sprite.setRotation(0);
                }
            }
        } else {
            // Create new remote player
            console.log('[MP] Creating remote player:', pid, 'role:', pdata.role);
            var tex = pdata.role === 'killer' ? 'killer' : 's1';
            if (pdata.state === 'dying' && tex !== 'killer') tex = tex + '_dying';
            else if (pdata.state === 'carried' && tex !== 'killer') tex = tex + '_carried';
            else if (pdata.state === 'repair' && pdata.animationTarget !== undefined && tex !== 'killer') tex = tex + '_repair';
            else if (pdata.role === 'killer' && pdata.isStriking) tex = 'killer_strike';

            var sp = scene.add.sprite(pdata.x || 1200, pdata.y || 900, tex);
            sp.setDepth(1000 + (pdata.y || 900));
            scene.physics.add.existing(sp);
            sp.body.setCollideWorldBounds(true);
            sp.body.setSize(24, 28, true);

            if (pdata.state === 'dead') sp.setAlpha(0.3);
            if (pdata.state === 'injured') sp.setTint(0xff8888);
            else if (pdata.state === 'dying') sp.setTint(0xff4444);

            var glow = scene.add.graphics();
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
    Object.keys(remotePlayers).forEach(function(pid) {
        if (!players[pid]) {
            var rp = remotePlayers[pid];
            if (rp && rp.sprite) rp.sprite.destroy();
            if (rp && rp.glowFx) rp.glowFx.destroy();
            delete remotePlayers[pid];
        }
    });

    if (isKiller) {
        survivorsAlive = Object.values(players).filter(function(p) { return p.role === 'survivor' && p.state !== 'dead'; }).length;
    }
}

function updateGeneratorsFromServer(gens) {
    if (!scene) return;

    Object.keys(gens).forEach(function(id) {
        var gdata = gens[id];
        var gen = generators.find(function(g) { return g.genId == id; });
        if (!gen) return;

        gen.progress = gdata.progress || 0;
        gen.repaired = gdata.repaired || false;

        if (gen.repaired) {
            gen.progress = 100;
            if (gen.glowGfx) gen.glowGfx.setAlpha(0);
            if (gen.lightGlowGfx) gen.lightGlowGfx.setAlpha(0);
            if (gen.lightGlowInnerGfx) gen.lightGlowInnerGfx.setAlpha(0);
            if (gen.lightSprite) gen.lightSprite.setAlpha(0.3);
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

    var lerpFactor = 1 - Math.pow(1 - POS_LERP_SPEED, dt / 16.67);

    Object.values(remotePlayers).forEach(function(rp) {
        if (rp.targetX === undefined || rp.targetY === undefined) return;
        if (rp.state === 'dead' || rp.state === 'hooked') return;

        var dx = rp.targetX - rp.sprite.x;
        var dy = rp.targetY - rp.sprite.y;
        var d = Math.sqrt(dx * dx + dy * dy);

        if (d < 1) {
            rp.sprite.x = rp.targetX;
            rp.sprite.y = rp.targetY;
        } else {
            rp.sprite.x += dx * lerpFactor;
            rp.sprite.y += dy * lerpFactor;
        }

        if (rp.glowFx) rp.glowFx.setPosition(rp.sprite.x, rp.sprite.y);
        rp.sprite.setDepth(1000 + rp.sprite.y);
    });
}

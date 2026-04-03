// ═══════ PLAYER LOGIC ═══════

function updatePlayer(dt) {
    var p = player;
    var sp = p.sprite;

    sp.setDepth(1000 + sp.y);

    // Fog hiding effect
    if (p.role === 'survivor' && scene && scene.fogPatches) {
        var fogDensity = 0;
        scene.fogPatches.forEach(function(patch) {
            var dx = sp.x - patch.x;
            var dy = sp.y - patch.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < patch.width * 0.6) {
                fogDensity += (1 - dist / (patch.width * 0.6)) * patch.alpha;
            }
        });

        if (fogDensity > 0.3) {
            var fogAlpha = Math.min(0.6, fogDensity * 0.8);
            sp.setAlpha(0.4 + (1 - fogAlpha));
            if (!sp.tintTopLeft || sp.tintTopLeft === 0xffffff) {
                sp.setTint(0x888899);
            }
        } else {
            sp.setAlpha(1);
            sp.clearTint();
        }
    }

    // Movement
    var speed = CONFIG.PLAYER_SPEED;
    if (p.role === 'killer') {
        speed = CONFIG.KILLER_SPEED;
        if (killerStun > 0) speed *= 0.4;
        if (killerSlowdown > 0) speed *= 0.7;
    } else {
        if (p.state === 'injured') speed = CONFIG.INJURED_SPEED;
        if (p.state === 'dying') speed = CONFIG.DYING_SPEED;
        if (boostTimer > 0) speed *= 1.3;
        if (survivorSpeedBoost > 0) speed *= 1.2;
    }

    if (p.role === 'killer' && killerStun > 0) {
        killerStun -= dt / 1000;
    }
    if (killerSlowdown > 0) killerSlowdown -= dt / 1000;
    if (killerAttackCooldown > 0) killerAttackCooldown -= dt / 1000;
    if (boostTimer > 0) boostTimer -= dt / 1000;
    if (survivorSpeedBoost > 0) survivorSpeedBoost -= dt / 1000;

    if (p.role === 'survivor' && p.state === 'dying') {
        if (inputVec.x !== 0 || inputVec.y !== 0) {
            sp.body.setVelocity(inputVec.x * speed, inputVec.y * speed);
            sp.setScale(1, 0.6);
        } else {
            sp.body.setVelocity(0, 0);
        }
    } else if (p.state !== 'hooked' && p.state !== 'carried' && p.state !== 'dead') {
        sp.body.setVelocity(inputVec.x * speed, inputVec.y * speed);
    } else {
        sp.body.setVelocity(0, 0);
    }

    // Killer strike timer
    if (p.role === 'killer' && killerStrikeTimer > 0) {
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

    // Repair animation
    if (p.isRepairing && p.progressAction) {
        var gen = p.progressAction;
        if (!sp.texture.key.includes('_repair')) {
            sp.setTexture(getTexWithFallback(p.tex, '_repair'));
        }
        sp.body.setVelocity(0, 0);
        p.repairBobPhase += dt * 0.005;
        sp.setScale(0.85 + Math.sin(p.repairBobPhase) * 0.02, 0.85 + Math.sin(p.repairBobPhase) * 0.02);
    }

    // Carry animation
    if (p.carryTarget) {
        var carried = p.carryTarget;
        if (carried && carried.sprite) {
            carried.sprite.setPosition(sp.x, sp.y + 15);
            carried.sprite.setDepth(sp.depth + 1);
            if (!carried.sprite.texture.key.includes('_carried')) {
                carried.sprite.setTexture(getTexWithFallback(carried.tex, '_carried'));
            }
            carried.sprite.setScale(1, 1);
        }
    }

    // Update glow
    if (p.glowFx) {
        p.glowFx.setPosition(sp.x, sp.y);
    }

    // Multiplayer position sync
    if (isMultiplayer && roomCode && playerId && p.isMe) {
        lastPosUpdate += dt;
        if (lastPosUpdate >= POS_UPDATE_INTERVAL) {
            lastPosUpdate = 0;
            sendPlayerPosition(roomCode, playerId, sp.x, sp.y);
            if (p.role === 'survivor') {
                updatePlayerState(roomCode, playerId, p.state);
                if (p.state !== 'dead') updatePlayerHealth(roomCode, playerId, p.health);
            }
        }
    }

    // HUD update
    if (p.isMe) {
        var genCount = generators.filter(function(g) { return g.repaired; }).length;
        UI.updateHUD(p.role, p.state, genCount, exitOpen, hatchOpen, survivorsAlive);
    }
}

function killerAction(dt) {
    if (!isKiller || !player || !player.sprite) return;

    var p = player;
    var sp = p.sprite;

    // Strike cooldown
    if (killerAttackCooldown > 0) {
        killerAttackCooldown -= dt / 1000;
        return;
    }

    if (!actionPressed) return;
    actionPressed = false;

    // Check for carried survivor drop near hook
    if (p.carryTarget) {
        var carried = p.carryTarget;
        var nearHook = false;
        hooks.forEach(function(hook) {
            if (!hook.occupied) {
                var d = Math.sqrt(Math.pow(sp.x - hook.x, 2) + Math.pow(sp.y - hook.y, 2));
                if (d < CONFIG.INTERACT_DISTANCE) nearHook = true;
            }
        });

        if (nearHook) {
            // Hook the carried survivor
            hooks.forEach(function(hook) {
                if (!hook.occupied) {
                    var d = Math.sqrt(Math.pow(sp.x - hook.x, 2) + Math.pow(sp.y - hook.y, 2));
                    if (d < CONFIG.INTERACT_DISTANCE) {
                        hook.occupied = true;
                        hook.hookedSurvivor = carried;
                        hook.hookTimer = 0;
                        carried.state = 'hooked';
                        carried.sprite.setPosition(hook.x, hook.y - 12);
                        carried.sprite.setTint(0xff4444);
                        carried.progressAction = null;
                        carried.isRepairing = false;
                        if (carried.repairSparks) carried.repairSparks.setVisible(false);
                        p.carryTarget = null;
                        carried.sprite.setScale(1, 1);
                        if (carried.sprite.texture.key.includes('_carried')) {
                            carried.sprite.setTexture(carried.tex);
                        }
                        UI.showToast('\uD83E\uDE9D \u0412\u044B\u0436\u0438\u0432\u0448\u0438\u0439 \u043D\u0430 \u043A\u0440\u044E\u043A\u0435!', 2000);
                        if (isMultiplayer && roomCode && carried.playerId) {
                            hookSurvivor(roomCode, carried.playerId, hook.hookId);
                        }
                    }
                }
            });
        } else {
            // Drop survivor
            if (carried && carried.sprite) {
                carried.state = 'dying';
                carried.sprite.setTint(0xff4444);
                carried.sprite.setScale(1, 1);
                if (carried.sprite.texture.key.includes('_carried')) {
                    carried.sprite.setTexture(carried.tex);
                }
                p.carryTarget = null;
                UI.showToast('\uD83D\uDC64 \u0412\u044B\u0436\u0438\u0432\u0448\u0438\u0439 \u0431\u0440\u043E\u0448\u0435\u043D!', 1500);
                if (isMultiplayer && roomCode && carried.playerId) {
                    setPlayerDying(roomCode, carried.playerId);
                }
            }
        }
        return;
    }

    // Check for picking up dying survivor
    var target = nearestAliveTarget(sp, player.aiPlayers || [], CONFIG.INTERACT_DISTANCE);
    if (!target && isMultiplayer) {
        Object.values(remotePlayers).forEach(function(rp) {
            if (rp.state === 'dying' && rp.sprite) {
                var d = Math.sqrt(Math.pow(sp.x - rp.sprite.x, 2) + Math.pow(sp.y - rp.sprite.y, 2));
                if (d < CONFIG.INTERACT_DISTANCE) target = rp;
            }
        });
    }

    if (target && target.state === 'dying') {
        p.carryTarget = target;
        target.state = 'carried';
        target.sprite.setScale(1, 1);
        if (target.sprite.texture.key.includes('_dying')) {
            target.sprite.setTexture(target.tex);
        }
        if (target.sprite.texture.key.includes('_carried') === false) {
            target.sprite.setTexture(getTexWithFallback(target.tex, '_carried'));
        }
        UI.showToast('\uD83D\uDC64 \u041F\u043E\u0434\u043E\u0431\u0440\u0430\u043B \u0432\u044B\u0436\u0438\u0432\u0448\u0435\u0433\u043E!', 1500);
        if (isMultiplayer && roomCode && target.playerId) {
            setPlayerCarrying(roomCode, playerId, target.playerId);
        }
        return;
    }

    // Strike attack
    var hitTargets = [];
    if (!isMultiplayer) {
        (player.aiPlayers || []).forEach(function(ai) {
            if (ai.state !== 'dead' && ai.state !== 'hooked' && ai.state !== 'carried') {
                var d = Math.sqrt(Math.pow(sp.x - ai.sprite.x, 2) + Math.pow(sp.y - ai.sprite.y, 2));
                if (d < CONFIG.CATCH_DISTANCE) hitTargets.push(ai);
            }
        });
    } else {
        Object.values(remotePlayers).forEach(function(rp) {
            if (rp.state !== 'dead' && rp.state !== 'hooked' && rp.state !== 'carried' && rp.sprite) {
                var d = Math.sqrt(Math.pow(sp.x - rp.sprite.x, 2) + Math.pow(sp.y - rp.sprite.y, 2));
                if (d < CONFIG.CATCH_DISTANCE) hitTargets.push(rp);
            }
        });
    }

    if (hitTargets.length > 0) {
        // Strike animation
        killerStrikeTimer = 0.5;
        killerAttackCooldown = CONFIG.CATCH_COOLDOWN;

        hitTargets.forEach(function(t) {
            if (t.state === 'alive') {
                t.state = 'injured';
                t.isVulnerable = false;
                t.sprite.setTint(0xff8888);
                killerSlowdown = 2.0;
                killerAttackCooldown = 1.5;
                if (t.isMe) {
                    boostTimer = 1.0;
                    survivorSpeedBoost = 1.0;
                    addBloodSplatter(t.sprite.x, t.sprite.y);
                }
                UI.showToast('\uD83D\uDCA5 \u0412\u044B\u0436\u0438\u0432\u0448\u0438\u0439 \u0440\u0430\u043D\u0435\u043D!', 2000);
                if (isMultiplayer && roomCode && playerId) {
                    setKillerStrikeAnimation(roomCode, playerId, true, t.playerId);
                    setPlayerInjured(roomCode, t.playerId);
                    clearPlayerAnimation(roomCode, t.playerId);
                }
            } else if (t.state === 'injured') {
                t.state = 'dying';
                t.isVulnerable = false;
                t.sprite.setTint(0xff4444);
                t.progressAction = null;
                t.isRepairing = false;
                if (t.repairSparks) t.repairSparks.setVisible(false);
                t.sprite.setScale(1, 1);
                t.sprite.setAlpha(1);
                if (t.sprite.texture.key.includes('_repair')) {
                    t.sprite.setTexture(t.tex);
                }
                killerSlowdown = 1.0;
                killerAttackCooldown = 1.0;
                addBloodSplatter(t.sprite.x, t.sprite.y);
                triggerScreenShake(8);
                UI.showToast('\u2B07\uFE0F \u0412\u044B\u0436\u0438\u0432\u0448\u0438\u0439 \u0443\u043F\u0430\u043B!', 2000);
                if (isMultiplayer && roomCode && playerId) {
                    setKillerStrikeAnimation(roomCode, playerId, true, t.playerId);
                    setPlayerDying(roomCode, t.playerId);
                    clearPlayerAnimation(roomCode, t.playerId);
                }
            } else if (t.state === 'dying') {
                p.carryTarget = t;
                t.state = 'carried';
                t.sprite.setScale(1, 1);
                if (t.sprite.texture.key.includes('_dying')) {
                    t.sprite.setTexture(t.tex);
                }
                if (!t.sprite.texture.key.includes('_carried')) {
                    t.sprite.setTexture(getTexWithFallback(t.tex, '_carried'));
                }
                UI.showToast('\uD83D\uDC64 \u041F\u043E\u0434\u043E\u0431\u0440\u0430\u043B!', 1500);
                if (isMultiplayer && roomCode && t.playerId) {
                    setPlayerCarrying(roomCode, playerId, t.playerId);
                }
            }
        });
    }
}

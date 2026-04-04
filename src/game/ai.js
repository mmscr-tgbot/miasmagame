// ═══════ AI LOGIC ═══════

function updateAI(dt) {
    if (!player || !player.aiPlayers) return;

    player.aiPlayers.forEach(function(ai) {
        if (!ai || !ai.sprite) return;
        var sp = ai.sprite;

        // AI Killer behavior - smart hunting
        if (ai.isAIKiller) {
            if (ai.slowdownTimer > 0) {
                ai.slowdownTimer -= dt / 1000;
                sp.body.setVelocity(0, 0);
                return;
            }
            
            if (ai.aiHitCooldown > 0) {
                ai.aiHitCooldown -= dt / 1000;
                sp.body.setVelocity(0, 0);
                return;
            }
            
            if (ai.carryTarget) {
                // Carrying survivor to hook
                var hook = nearestFreeHook(sp);
                if (hook && dist(sp, hook) < CONFIG.INTERACT_DISTANCE + 20) {
                    if (!ai._hookDelay) ai._hookDelay = 0;
                    ai._hookDelay += dt / 1000;
                    if (ai._hookDelay >= 0.5) {
                        hangSurvivor(ai.carryTarget, hook);
                        ai.carryTarget = null;
                        ai._hookDelay = 0;
                    }
                } else if (hook) {
                    aiMoveToKiller(sp, hook.x, hook.y, dt, ai);
                }
                return;
            }
            
            // Find nearest target (player survivor OR AI survivors)
            var target = findNearestSurvivorForKiller(sp);
            if (!target) {
                sp.body.setVelocity(0, 0);
                return;
            }
            
            var d = dist(sp, target);
            if (d < CONFIG.CATCH_DISTANCE) {
                // Hit survivor
                ai.aiHitCooldown = ai.aiAttackInterval || 2;
                if (target.state === 'alive') {
                    target.state = 'injured';
                    target.isVulnerable = false;
                    target.sprite.setTint(0xff8888);
                    boostTimer = 1.0;
                    survivorSpeedBoost = 1.0;
                    ai.slowdownTimer = 2.0;
                    ai.aiAttackCooldown = 1.5;
                    ai.aiAttackInterval = 1.5 + Math.random() * 0.5;
                    addBloodSplatter(target.sprite.x, target.sprite.y);
                } else if (target.state === 'injured') {
                    target.state = 'dying';
                    target.isVulnerable = false;
                    target.sprite.setTint(0xff4444);
                    target.progressAction = null;
                    target.isRepairing = false;
                    if (target.repairSparks) target.repairSparks.setVisible(false);
                    target.sprite.setScale(1, 1);
                    target.sprite.setAlpha(1);
                    ai.slowdownTimer = 1.0;
                    ai.aiAttackCooldown = 1.0;
                    ai.aiAttackInterval = 1.0 + Math.random() * 0.3;
                    addBloodSplatter(target.sprite.x, target.sprite.y);
                    triggerScreenShake(8);
                } else if (target.state === 'dying') {
                    ai.carryTarget = target;
                    target.state = 'carried';
                    target.sprite.setScale(1, 1);
                    if (target.sprite.texture.key.includes('_dying')) {
                        target.sprite.setTexture(target.tex);
                    }
                    if (!target.sprite.texture.key.includes('_carried')) {
                        target.sprite.setTexture(getTexWithFallback(target.tex, '_carried'));
                    }
                }
            } else {
                // Chase with obstacle avoidance
                aiMoveToKiller(sp, target.x, target.y, dt, ai);
            }
        } else {
            // Smart AI Survivor behavior
            updateSmartSurvivorAI(ai, dt);
        }

        if (ai.glowFx) ai.glowFx.setPosition(sp.x, sp.y);
    });
}

// Smart killer movement with obstacle avoidance
function aiMoveToKiller(sp, targetX, targetY, dt, aiRef) {
    var dx = targetX - sp.x;
    var dy = targetY - sp.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d < 5) {
        sp.body.setVelocity(0, 0);
        return;
    }
    
    // Base direction
    var baseDirX = dx / d;
    var baseDirY = dy / d;
    
    // Check for obstacles ahead
    var checkDist = 80;
    var obstacleX = 0;
    var obstacleY = 0;
    var hasObstacle = false;
    
    // Check static group obstacles
    if (staticGroup) {
        staticGroup.getChildren().forEach(function(obs) {
            if (!obs.visible) return;
            var ox = obs.x;
            var oy = obs.y;
            var od = Math.sqrt(Math.pow(ox - sp.x, 2) + Math.pow(oy - sp.y, 2));
            if (od < checkDist && od > 10) {
                // Check if obstacle is in the path
                var angleToObs = Math.atan2(oy - sp.y, ox - sp.x);
                var angleToTarget = Math.atan2(dy, dx);
                var angleDiff = Math.abs(angleToObs - angleToTarget);
                if (angleDiff < 0.8 || angleDiff > Math.PI * 2 - 0.8) {
                    hasObstacle = true;
                    obstacleX = ox;
                    obstacleY = oy;
                }
            }
        });
    }
    
    var speed = CONFIG.KILLER_SPEED;
    if (aiRef && aiRef.slowdownTimer > 0) speed *= 0.5;
    
    if (hasObstacle) {
        // Steer around obstacle
        var avoidAngle = Math.atan2(obstacleY - sp.y, obstacleX - sp.x);
        var targetAngle = Math.atan2(dy, dx);
        // Choose left or right avoidance
        var steerDir = (targetAngle - avoidAngle + Math.PI * 2) % (Math.PI * 2) > Math.PI ? -1 : 1;
        var avoidAngle2 = avoidAngle + steerDir * Math.PI / 3;
        var finalX = Math.cos(avoidAngle2) * speed;
        var finalY = Math.sin(avoidAngle2) * speed;
        sp.body.setVelocity(finalX, finalY);
    } else {
        sp.body.setVelocity(baseDirX * speed, baseDirY * speed);
    }
}

// Find nearest survivor for AI killer (includes player)
function findNearestSurvivorForKiller(sp) {
    var best = null;
    var bestDist = 9999;
    
    // Check player survivor
    if (!isKiller && player && player.sprite && player.state !== 'dead' && player.state !== 'hooked' && player.state !== 'carried') {
        var d = dist(sp, player.sprite);
        if (d < bestDist) {
            bestDist = d;
            best = player;
        }
    }
    
    // Check AI survivors
    if (player && player.aiPlayers) {
        player.aiPlayers.forEach(function(ai) {
            if (ai.isAIKiller || !ai.sprite) return;
            if (ai.state === 'dead' || ai.state === 'hooked' || ai.state === 'carried') return;
            var d = dist(sp, ai.sprite);
            if (d < bestDist) {
                bestDist = d;
                best = ai;
            }
        });
    }
    
    return best;
}

function updateSmartSurvivorAI(ai, dt) {
    var sp = ai.sprite;
    
    // Handle states
    if (ai.state === 'dead' || ai.state === 'carried') {
        sp.body.setVelocity(0, 0);
        return;
    }
    
    if (ai.state === 'hooked') {
        sp.body.setVelocity(0, 0);
        return;
    }
    
    if (ai.state === 'dying') {
        sp.body.setVelocity(0, 0);
        return;
    }
    
    // Priority 1: Unhook hooked survivors
    var hookedSurvivor = findHookedSurvivor(ai);
    if (hookedSurvivor && ai.state === 'alive') {
        var hook = hooks.find(function(h) { return h.occupied && h.hookedSurvivor === hookedSurvivor; });
        if (hook) {
            var d = dist(sp, hook);
            if (d < CONFIG.INTERACT_DISTANCE) {
                // Unhook
                hook.occupied = false;
                hook.hookedSurvivor = null;
                hook.hookTimer = 0;
                hookedSurvivor.state = 'injured';
                hookedSurvivor.sprite.clearTint();
                hookedSurvivor.sprite.setPosition(hook.x + 30, hook.y);
                ai.aiActionCooldown = 2;
                return;
            } else {
                moveTo(sp, hook.x, hook.y, CONFIG.PLAYER_SPEED);
                return;
            }
        }
    }
    
    // Priority 2: Heal injured survivors
    var injuredAlly = findInjuredAlly(ai);
    if (injuredAlly && ai.state === 'alive' && (!ai.aiActionCooldown || ai.aiActionCooldown <= 0)) {
        var d = dist(sp, injuredAlly.sprite);
        if (d < CONFIG.INTERACT_DISTANCE) {
            injuredAlly.state = 'alive';
            injuredAlly.sprite.clearTint();
            matchStats.survivorsHealed++;
            addBloodpoints('altruism', 1500, 'AI лечение');
            ai.aiActionCooldown = 3;
            return;
        } else {
            moveTo(sp, injuredAlly.sprite.x, injuredAlly.sprite.y, CONFIG.PLAYER_SPEED);
            return;
        }
    }
    
    // Priority 3: Repair generators
    var unrepairedGen = generators.find(function(g) { return !g.repaired; });
    if (unrepairedGen) {
        var d = dist(sp, unrepairedGen);
        if (d < CONFIG.INTERACT_DISTANCE && (!ai.isRepairing)) {
            // Start repairing
            ai.isRepairing = true;
            ai.progressAction = unrepairedGen;
            if (!sp.texture.key.includes('_repair')) {
                sp.setTexture(getTexWithFallback(ai.tex, '_repair'));
            }
        }
        
        if (ai.isRepairing && ai.progressAction === unrepairedGen && !unrepairedGen.repaired) {
            unrepairedGen.progress += CONFIG.GENERATOR_REPAIR_RATE * dt / 1000;
            
            // Sparks
            if (unrepairedGen.repairSparks) {
                unrepairedGen.repairSparks.setVisible(true);
                unrepairedGen.repairSparks.clear();
                for (var i = 0; i < 3; i++) {
                    var sx = unrepairedGen.bx + (Math.random() - 0.5) * 30;
                    var sy = unrepairedGen.by + (Math.random() - 0.5) * 20;
                    unrepairedGen.repairSparks.fillStyle(0xffff00, 0.6 + Math.random() * 0.4);
                    unrepairedGen.repairSparks.fillCircle(sx, sy, 1 + Math.random() * 2);
                }
            }
            
            // Progress bar
            if (unrepairedGen.barGfx) {
                unrepairedGen.barGfx.clear();
                unrepairedGen.barGfx.fillStyle(0x000000, 0.7);
                unrepairedGen.barGfx.fillRect(unrepairedGen.bx - 25, unrepairedGen.by - 45, 50, 8);
                unrepairedGen.barGfx.fillStyle(0xffee00, 0.9);
                unrepairedGen.barGfx.fillRect(unrepairedGen.bx - 24, unrepairedGen.by - 44, 48 * (unrepairedGen.progress / 100), 6);
            }
            
            if (unrepairedGen.progress >= 100) {
                unrepairedGen.progress = 100;
                unrepairedGen.repaired = true;
                ai.isRepairing = false;
                ai.progressAction = null;
                if (sp.texture.key.includes('_repair')) sp.setTexture(ai.tex);
                if (unrepairedGen.repairSparks) unrepairedGen.repairSparks.setVisible(false);
                
                matchStats.generatorsRepaired++;
                addBloodpoints('objective', 2000, 'AI починил генератор');
                
                var repairedCount = generators.filter(function(g) { return g.repaired; }).length;
                if (repairedCount >= CONFIG.GENS_REQUIRED_FOR_EXIT && !exitOpen) {
                    exitOpen = true;
                }
                if (repairedCount >= 5 && !hatchOpen && !hatchClosed) {
                    hatchOpen = true;
                    hatch.sprite.setVisible(true);
                    hatch.sprite.setDepth(hatch.sprite.y + 1);
                }
            }
            return;
        }
        
        if (!ai.isRepairing && d > CONFIG.INTERACT_DISTANCE + 10) {
            moveTo(sp, unrepairedGen.x, unrepairedGen.y, CONFIG.PLAYER_SPEED);
            return;
        }
    }
    
    // Priority 4: Open gates if all generators done
    if (exitOpen) {
        var closedGate = gates.find(function(g) { return !g.opened; });
        if (closedGate) {
            var d = dist(sp, closedGate);
            if (d < CONFIG.INTERACT_DISTANCE) {
                closedGate.isOpening = true;
                closedGate.progress = 0;
                ai.aiActionCooldown = 5;
                return;
            } else {
                moveTo(sp, closedGate.bx, closedGate.by, CONFIG.PLAYER_SPEED);
                return;
            }
        }
    }
    
    // Priority 5: Run away from killer
    var killer = null;
    if (player && player.role === 'killer') {
        killer = player.sprite;
    } else if (!isMultiplayer && player.aiPlayers) {
        player.aiPlayers.forEach(function(a) {
            if (a.isAIKiller && a.sprite) killer = a.sprite;
        });
    }
    
    if (killer) {
        var dk = dist(sp, killer);
        if (dk < 200) {
            var ak = Math.atan2(sp.y - killer.y, sp.x - killer.x);
            var dir = { x: Math.cos(ak), y: Math.sin(ak) };
            var speed = ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED;
            sp.body.setVelocity(dir.x * speed, dir.y * speed);
            return;
        }
    }
    
    // Default: wander
    ai.aiTimer = (ai.aiTimer || 0) - dt / 1000;
    if (ai.aiTimer <= 0) {
        ai.aiTimer = 1 + Math.random() * 3;
        var ang = Math.random() * Math.PI * 2;
        ai.aiDir = { x: Math.cos(ang), y: Math.sin(ang) };
    }
    
    var speed = ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED;
    if (ai.aiDir) {
        sp.body.setVelocity(ai.aiDir.x * speed, ai.aiDir.y * speed);
    }
    
    if (ai.aiActionCooldown > 0) ai.aiActionCooldown -= dt / 1000;
}

function findHookedSurvivor(ai) {
    for (var i = 0; i < hooks.length; i++) {
        if (hooks[i].occupied && hooks[i].hookedSurvivor && hooks[i].hookedSurvivor !== ai) {
            return hooks[i].hookedSurvivor;
        }
    }
    return null;
}

function findInjuredAlly(ai) {
    // Check other AI survivors
    if (player && player.aiPlayers) {
        for (var i = 0; i < player.aiPlayers.length; i++) {
            var other = player.aiPlayers[i];
            if (other !== ai && other.state === 'injured' && other.sprite) {
                return other;
            }
        }
    }
    // Check player
    if (!isKiller && player && player.state === 'injured') {
        return player;
    }
    return null;
}

// ═══════ AI LOGIC ═══════

var aiDebugCounter = 0;

// Dynamic difficulty system
var aiDifficultyLevel = 1.0; // 1.0 = normal, increases as survivors do better
var aiDifficultyTimer = 0;

function updateAIDifficulty(dt) {
    if (!player || isMultiplayer) return;
    
    aiDifficultyTimer += dt / 1000;
    if (aiDifficultyTimer < 5) return; // Update every 5 seconds
    aiDifficultyTimer = 0;
    
    // Calculate how well survivors are doing
    var repairedGens = generators.filter(function(g) { return g.repaired; }).length;
    var totalGens = generators.length;
    var repairProgress = 0;
    generators.forEach(function(g) { repairProgress += g.progress; });
    var avgProgress = repairProgress / totalGens;
    
    // Difficulty increases based on:
    // 1. Fast generator repair (>50% avg progress = harder)
    // 2. Multiple generators repaired (2+ repaired = harder)
    // 3. Time since game start (later in game = harder)
    var targetDifficulty = 1.0;
    
    if (avgProgress > 50) targetDifficulty += 0.2;
    if (avgProgress > 75) targetDifficulty += 0.2;
    if (repairedGens >= 2) targetDifficulty += 0.3;
    if (repairedGens >= 4) targetDifficulty += 0.3;
    
    // Clamp difficulty between 0.7 and 2.0
    aiDifficultyLevel = Math.max(0.7, Math.min(2.0, targetDifficulty));
    
    // Update AI killer stats based on difficulty
    if (player.aiPlayers) {
        player.aiPlayers.forEach(function(ai) {
            if (ai && ai.isAIKiller) {
                // Increase speed based on difficulty
                if (!ai.baseSpeed) ai.baseSpeed = CONFIG.KILLER_SPEED;
                ai.speedMultiplier = aiDifficultyLevel;
                
                // Increase patrol frequency (reduce patrol wait time)
                if (!ai.patrolWait) ai.patrolWait = 3;
                ai.patrolWait = Math.max(0.5, 3 - (aiDifficultyLevel - 1) * 2);
            }
        });
    }
}

function updateAI(dt) {
    // Update dynamic difficulty
    updateAIDifficulty(dt);
    
    if (!player || !player.aiPlayers) return;

    player.aiPlayers.forEach(function(ai) {
        if (!ai || !ai.sprite) return;
        var sp = ai.sprite;

        // AI Killer behavior - smart hunting
        if (ai.isAIKiller) {
            // Add delay at game start before AI starts hunting
            if (!ai.aiStartDelay) ai.aiStartDelay = 5.0;
            if (ai.aiStartDelay > 0) {
                ai.aiStartDelay -= dt / 1000;
                sp.body.setVelocity(0, 0);
                return;
            }
            
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
            
            // Check for generators to sabotage
            var nearGen = null;
            generators.forEach(function(gen) {
                if (!gen.repaired) {
                    var dg = dist(sp, gen);
                    if (dg < CONFIG.INTERACT_DISTANCE + 20) {
                        nearGen = gen;
                    }
                }
            });
            
            if (nearGen && ai.aiHitCooldown <= 0) {
                // Sabotage generator - rollback progress
                nearGen.beingSabotaged = true;
                ai.aiHitCooldown = 1.5;
                nearGen.rollbackProgress = 0;
                UI.showToast('\uD83D\uDD27 AI \u043B\u043E\u043C\u0430\u0435\u0442 \u0433\u0435\u043D\u0435\u0440\u0430\u0442\u043E\u0440!', 1000);
                // Continue to chase after sabotaging
            }
            
            // Find nearest target (player survivor OR AI survivors)
            var target = findNearestSurvivorForKiller(sp);
            if (!target) {
                // No survivors found - patrol or go to generator
                var unrepairedGen = generators.find(function(g) { return !g.repaired; });
                if (unrepairedGen) {
                    aiMoveToKiller(sp, unrepairedGen.x, unrepairedGen.y, dt, ai);
                } else {
                    sp.body.setVelocity(0, 0);
                }
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
    
    // Use Phaser's built-in velocity toward target - physics handles collisions
    var baseSpeed = CONFIG.KILLER_SPEED;
    if (aiRef && aiRef.speedMultiplier) baseSpeed *= aiRef.speedMultiplier;
    if (aiRef && aiRef.slowdownTimer > 0) baseSpeed *= 0.5;
    
    // Calculate angle to target
    var angle = Math.atan2(dy, dx);
    var velX = Math.cos(angle) * baseSpeed;
    var velY = Math.sin(angle) * baseSpeed;
    
    // Check for obstacles directly ahead using physics
    var checkDist = 50;
    var hasObstacle = false;
    
    if (staticGroup) {
        staticGroup.getChildren().forEach(function(obs) {
            if (!obs.visible) return;
            var ox = obs.x;
            var oy = obs.y;
            var od = Math.sqrt(Math.pow(ox - sp.x, 2) + Math.pow(oy - sp.y, 2));
            if (od < checkDist && od > 5) {
                // Check if obstacle is in the path
                var angleToObs = Math.atan2(oy - sp.y, ox - sp.x);
                var angleDiff = Math.abs(angleToObs - angle);
                if (angleDiff < 0.6 || angleDiff > Math.PI * 2 - 0.6) {
                    hasObstacle = true;
                    // Add perpendicular offset to avoid
                    velX += (ox > sp.x ? -1 : 1) * speed * 0.5;
                    velY += (oy > sp.y ? -1 : 1) * speed * 0.5;
                }
            }
        });
    }
    
    // Apply velocity - Arcade physics will handle actual collision
    sp.body.setVelocity(velX, velY);
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
    
    if (!ai || !sp || !sp.body) return;
    
    // Handle states
    if (ai.state === 'dead' || ai.state === 'carried') {
        sp.body.setVelocity(0, 0);
        return;
    }
    
    // Debug every 5 seconds
    if (!ai._debugTimer) ai._debugTimer = 0;
    ai._debugTimer += dt / 1000;
    if (ai._debugTimer > 5) {
        ai._debugTimer = 0;
        var genCount = generators ? generators.length : 0;
        console.log('[AI Survivor] State:', ai.state, 'Pos:', Math.round(sp.x), Math.round(sp.y), 'Gens:', genCount, 'Repairing:', ai.isRepairing);
    }
    
    if (ai.state === 'hooked') {
        sp.body.setVelocity(0, 0);
        return;
    }
    
    if (ai.state === 'dying') {
        sp.body.setVelocity(0, 0);
        return;
    }
    
    // Find killer
    var killer = null;
    if (player && player.role === 'killer') {
        killer = player.sprite;
    } else if (!isMultiplayer && player.aiPlayers) {
        player.aiPlayers.forEach(function(a) {
            if (a.isAIKiller && a.sprite) killer = a.sprite;
        });
    }
    
    // Check if another survivor is already opening gate
    var isOtherSurvivorOpeningGate = false;
    if (player && player.aiPlayers) {
        player.aiPlayers.forEach(function(other) {
            if (other !== ai && !other.isAIKiller && other.isOpeningGate) {
                isOtherSurvivorOpeningGate = true;
            }
        });
    }
    
    // Priority 1: Drop pallet if killer is close and in front of pallet
    var nearPallet = findPalletToDrop(ai, killer);
    if (nearPallet && killer && dist(sp, killer) < 150) {
        var dPallet = dist(sp, nearPallet);
        if (dPallet < CONFIG.INTERACT_DISTANCE) {
            dropPallet(ai, nearPallet);
            return;
        } else {
            moveTo(sp, nearPallet.x, nearPallet.y, ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED);
            return;
        }
    }
    
    // Priority 2: Run away from killer (if approaching fast)
    if (killer) {
        var dk = dist(sp, killer);
        if (dk < 120) {
            var ak = Math.atan2(sp.y - killer.y, sp.x - killer.x);
            var dir = { x: Math.cos(ak), y: Math.sin(ak) };
            var speed = ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED;
            sp.body.setVelocity(dir.x * speed, dir.y * speed);
            ai.fleeingFromKiller = true;
            return;
        }
    }
    ai.fleeingFromKiller = false;
    
    // Priority 2.5: Heal injured ally if close
    var injuredAlly = null;
    if (player && player.aiPlayers) {
        player.aiPlayers.forEach(function(other) {
            if (other !== ai && !other.isAIKiller && other.state === 'injured') {
                var d = dist(sp, other.sprite);
                if (d < 200) {
                    injuredAlly = other;
                }
            }
        });
    }
    
    if (injuredAlly) {
        var dAlly = dist(sp, injuredAlly.sprite);
        if (dAlly < CONFIG.INTERACT_DISTANCE) {
            // Heal the ally
            injuredAlly.state = 'alive';
            injuredAlly.health = 100;
            if (injuredAlly.sprite) {
                injuredAlly.sprite.setTint(0xffffff);
                injuredAlly.sprite.setAlpha(1);
            }
            matchStats.survivorsHealed++;
            addBloodpoints('support', 500, 'Лечение союзника');
            UI.showToast('\u2764\uFE0F \u0421\u043E\u044E\u0437\u043D\u0438\u043A \u0438\u0437\u043B\u0435\u0447\u0435\u043D!', 1500);
        } else {
            moveTo(sp, injuredAlly.sprite.x, injuredAlly.sprite.y, ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED);
        }
        return;
    }
    
    // Priority 3: Open gates if all generators done (only one survivor should do this)
    var repairedCount = generators.filter(function(g) { return g.repaired; }).length;
    if (repairedCount >= CONFIG.GENS_REQUIRED_FOR_EXIT && !exitOpen) {
        exitOpen = true;
    }
    
    if (exitOpen && !isOtherSurvivorOpeningGate && !ai.isOpeningGate) {
        var closedGate = gates.find(function(g) { return !g.opened; });
        if (closedGate) {
            var dGate = dist(sp, closedGate);
            if (dGate < CONFIG.INTERACT_DISTANCE) {
                closedGate.isOpening = true;
                closedGate.progress = 0;
                ai.isOpeningGate = true;
                return;
            } else {
                moveTo(sp, closedGate.bx, closedGate.by, CONFIG.PLAYER_SPEED);
                return;
            }
        }
    }
    
    // If another survivor is opening gate, wait nearby
    if (isOtherSurvivorOpeningGate && !exitOpen) {
        var gateBeingOpened = gates.find(function(g) { return !g.opened; });
        if (gateBeingOpened) {
            var dGate = dist(sp, gateBeingOpened);
            if (dGate < CONFIG.INTERACT_DISTANCE + 50) {
                // Wait near the gate
                sp.body.setVelocity(0, 0);
                return;
            } else {
                moveTo(sp, gateBeingOpened.bx, gateBeingOpened.by, CONFIG.PLAYER_SPEED);
                return;
            }
        }
    }
    
    // Priority 4: Repair generators (continue or start new)
    if (!generators || generators.length === 0) {
        // Wander
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
        return;
    }
    
    var unrepairedGens = generators.filter(function(g) { return !g.repaired; });
    
    // Reset repairing state if not near generator or killer is too close
    if (ai.isRepairing) {
        var genStillValid = false;
        if (ai.progressAction && !ai.progressAction.repaired) {
            var currentDist = dist(sp, ai.progressAction);
            var killerCloseToGen = killer && dist(killer, ai.progressAction) < 150;
            if (currentDist < CONFIG.INTERACT_DISTANCE + 30 && !killerCloseToGen) {
                genStillValid = true;
            }
        }
        if (!genStillValid) {
            ai.isRepairing = false;
            ai.progressAction = null;
            ai.isOpeningGate = false;
            if (sp.texture.key.includes('_repair')) sp.setTexture(ai.tex);
            if (ai.progressAction && ai.progressAction.repairSparks) ai.progressAction.repairSparks.setVisible(false);
        }
    }
    
    // Find best generator to repair (prefer zero progress, then nearest)
    var bestGen = null;
    var bestGenDist = Infinity;
    var zeroProgressGens = unrepairedGens.filter(function(g) { return g.progress === 0; });
    var otherGens = unrepairedGens.filter(function(g) { return g.progress > 0; });
    
    // Prefer zero progress generators
    if (zeroProgressGens.length > 0) {
        zeroProgressGens.forEach(function(g) {
            var d = dist(sp, g);
            if (d < bestGenDist) {
                bestGenDist = d;
                bestGen = g;
            }
        });
    } else if (otherGens.length > 0) {
        otherGens.forEach(function(g) {
            var d = dist(sp, g);
            if (d < bestGenDist) {
                bestGenDist = d;
                bestGen = g;
            }
        });
    }
    
    if (bestGen) {
        var dGen = dist(sp, bestGen);
        var killerCloseToGen = killer && dist(killer, bestGen) < 150;
        
        // Move towards generator if too far
        if (dGen > CONFIG.INTERACT_DISTANCE + 10) {
            moveTo(sp, bestGen.x, bestGen.y, ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED);
            return;
        }
        
        // Start repairing if close enough and killer not too close
        if (!ai.isRepairing && !killerCloseToGen) {
            ai.isRepairing = true;
            ai.progressAction = bestGen;
            ai.isOpeningGate = false;
            if (!sp.texture.key.includes('_repair')) {
                sp.setTexture(getTexWithFallback(ai.tex, '_repair'));
            }
        }
        
        // Continue repairing
        if (ai.isRepairing && ai.progressAction === bestGen && !bestGen.repaired) {
            // Check if killer got too close
            if (killer && dist(killer, bestGen) < 100) {
                ai.isRepairing = false;
                ai.progressAction = null;
                if (sp.texture.key.includes('_repair')) sp.setTexture(ai.tex);
                if (bestGen.repairSparks) bestGen.repairSparks.setVisible(false);
            } else {
                bestGen.progress += CONFIG.GENERATOR_REPAIR_RATE * dt / 1000;
                
                // Sparks
                if (bestGen.repairSparks) {
                    bestGen.repairSparks.setVisible(true);
                    bestGen.repairSparks.clear();
                    for (var i = 0; i < 3; i++) {
                        var sx = bestGen.bx + (Math.random() - 0.5) * 30;
                        var sy = bestGen.by + (Math.random() - 0.5) * 20;
                        bestGen.repairSparks.fillStyle(0xffff00, 0.6 + Math.random() * 0.4);
                        bestGen.repairSparks.fillCircle(sx, sy, 1 + Math.random() * 2);
                    }
                }
                
                // Progress bar
                if (bestGen.barGfx) {
                    bestGen.barGfx.clear();
                    bestGen.barGfx.fillStyle(0x000000, 0.7);
                    bestGen.barGfx.fillRect(bestGen.bx - 25, bestGen.by - 45, 50, 8);
                    bestGen.barGfx.fillStyle(0xffee00, 0.9);
                    bestGen.barGfx.fillRect(bestGen.bx - 24, bestGen.by - 44, 48 * (bestGen.progress / 100), 6);
                }
                
                if (bestGen.progress >= 100) {
                    bestGen.progress = 100;
                    bestGen.repaired = true;
                    ai.isRepairing = false;
                    ai.progressAction = null;
                    if (sp.texture.key.includes('_repair')) sp.setTexture(ai.tex);
                    if (bestGen.repairSparks) bestGen.repairSparks.setVisible(false);
                    
                    matchStats.generatorsRepaired++;
                    addBloodpoints('objective', 2000, 'AI починил генератор');
                    
                    var repairedNow = generators.filter(function(g) { return g.repaired; }).length;
                    if (repairedNow >= CONFIG.GENS_REQUIRED_FOR_EXIT && !exitOpen) {
                        exitOpen = true;
                    }
                    if (repairedNow >= 5 && !hatchOpen && !hatchClosed) {
                        hatchOpen = true;
                        hatch.sprite.setVisible(true);
                        hatch.sprite.setDepth(hatch.sprite.y + 1);
                    }
                }
            }
            return;
        }
        
        // Move to generator if too far
        if (!ai.isRepairing && dGen > CONFIG.INTERACT_DISTANCE + 20) {
            moveTo(sp, bestGen.x, bestGen.y, ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED);
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
    
    // Force movement if stuck
    var currentSpeed = Math.sqrt(sp.body.velocity.x * sp.body.velocity.x + sp.body.velocity.y * sp.body.velocity.y);
    if (currentSpeed < 5) {
        // Move towards nearest unrepaired generator
        if (unrepairedGens.length > 0) {
            var nearestGen = null;
            var minD = Infinity;
            unrepairedGens.forEach(function(g) {
                var d = dist(sp, g);
                if (d < minD) {
                    minD = d;
                    nearestGen = g;
                }
            });
            if (nearestGen) {
                moveTo(sp, nearestGen.x, nearestGen.y, CONFIG.PLAYER_SPEED);
                return;
            }
        }
    }
    
    var speed = ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED;
    if (ai.aiDir) {
        sp.body.setVelocity(ai.aiDir.x * speed, ai.aiDir.y * speed);
    }
    
    if (ai.aiActionCooldown > 0) ai.aiActionCooldown -= dt / 1000;
}

// Find pallet that survivor can drop on killer
function findPalletToDrop(ai, killer) {
    if (!pallets || pallets.length === 0) return null;
    
    var sp = ai.sprite;
    var bestPallet = null;
    var bestDist = CONFIG.INTERACT_DISTANCE * 2;
    
    pallets.forEach(function(p) {
        if (p.dropped) return; // Already dropped
        
        var d = dist(sp, p);
        if (d > bestDist) return;
        
        // Check if killer is in front of pallet
        if (killer) {
            var angleToKiller = Math.atan2(killer.y - p.y, killer.x - p.x);
            var angleToSurvivor = Math.atan2(sp.y - p.y, sp.x - p.x);
            var angleDiff = Math.abs(angleToKiller - angleToSurvivor);
            
            // Killer should be on opposite side of survivor relative to pallet
            if (angleDiff < Math.PI * 0.7) return; // Too close in angle, killer not in front
        }
        
        bestDist = d;
        bestPallet = p;
    });
    
    return bestPallet;
}

// Drop pallet
function dropPallet(ai, pallet) {
    if (!pallet || pallet.dropped) return;
    
    pallet.dropped = true;
    if (pallet.sprite) {
        pallet.sprite.setFrame(1); // Dropped frame
    }
    
    addBloodpoints('boldness', 500, 'AI сбросил доску');
    ai.aiActionCooldown = 3;
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
    if (player && player.aiPlayers) {
        for (var i = 0; i < player.aiPlayers.length; i++) {
            var other = player.aiPlayers[i];
            if (other !== ai && other.state === 'injured' && other.sprite) {
                return other;
            }
        }
    }
    if (!isKiller && player && player.state === 'injured') {
        return player;
    }
    return null;
}

// ═══════ AI LOGIC ═══════

function updateAI(dt) {
    if (!player || !player.aiPlayers) return;

    player.aiPlayers.forEach(function(ai) {
        if (!ai || !ai.sprite) return;
        var sp = ai.sprite;

        // AI Killer behavior
        if (ai.isAIKiller) {
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
                        UI.showToast('\uD83E\uDE9D \u0412\u044B\u0436\u0438\u0432\u0448\u0438\u0439 \u043D\u0430 \u043A\u0440\u044E\u043A\u0435!', 2000);
                    }
                } else if (hook) {
                    moveTo(sp, hook.x, hook.y, CONFIG.KILLER_SPEED * 0.7);
                }
            } else if (ai.aiHitCooldown > 0) {
                ai.aiHitCooldown -= dt / 1000;
                sp.body.setVelocity(0, 0);
            } else {
                // Find nearest survivor
                var target = nearestAliveTarget(sp, 9999);
                if (target) {
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
                            UI.showToast('\uD83D\uDCA5 \u0422\u044B \u0440\u0430\u043D\u0435\u043D!', 2000);
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
                            UI.showToast('\u2B07\uFE0F \u0422\u044B \u0443\u043F\u0430\u043B!', 2000);
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
                            UI.showToast('\uD83D\uDC64 \u041F\u043E\u0434\u043E\u0431\u0440\u0430\u043B!', 1500);
                        }
                    } else {
                        moveTo(sp, target.x, target.y, CONFIG.KILLER_SPEED);
                    }
                }
            }

            if (ai.slowdownTimer > 0) ai.slowdownTimer -= dt / 1000;
        } else {
            // AI Survivor behavior
            ai.aiTimer = (ai.aiTimer || 0) - dt / 1000;
            if (ai.aiTimer <= 0) {
                ai.aiTimer = 0.8 + Math.random() * 2;
                var ang = Math.random() * Math.PI * 2;
                ai.aiDir = { x: Math.cos(ang), y: Math.sin(ang) };
            }

            // Run away from killer
            if (player && player.role === 'killer') {
                var dk = dist(sp, player.sprite);
                if (dk < 180) {
                    var ak = Math.atan2(sp.y - player.sprite.y, sp.x - player.sprite.x);
                    ai.aiDir = { x: Math.cos(ak), y: Math.sin(ak) };
                    ai.aiTimer = 1.2;
                }
            }

            var as = ai.state === 'dying' ? CONFIG.DYING_SPEED :
                ai.state === 'injured' ? CONFIG.INJURED_SPEED : CONFIG.PLAYER_SPEED;
            sp.body.setVelocity(ai.aiDir.x * as, ai.aiDir.y * as);

            // Dying texture
            if (ai.state === 'dying') {
                if (!sp.texture.key.includes('_dying')) {
                    sp.setTexture(getTexWithFallback(ai.tex, '_dying'));
                }
                sp.setScale(1, 1);
            } else if (sp.texture.key.includes('_dying')) {
                sp.setTexture(ai.tex);
                sp.setScale(1, 1);
            } else if (sp.texture.key.includes('_carried')) {
                sp.setTexture(ai.tex);
                sp.setScale(1, 1);
            }
        }

        // Update glow position
        if (ai.glowFx) ai.glowFx.setPosition(sp.x, sp.y);
    });
}

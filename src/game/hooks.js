// ═══════ HOOKS ═══════

function updateHooks(dt) {
    hooks.forEach(function(hook) {
        // Skip broken hooks
        if (hook.broken) {
            if (hook.hookGlow) {
                hook.hookGlow.clear();
                hook.hookGlow.fillStyle(0x333333, 0.05);
                hook.hookGlow.fillCircle(hook.x, hook.y, 35);
            }
            return;
        }
        
        // Animate hook glow
        if (hook.hookGlow) {
            hook.glowPhase += dt * 0.003;
            var pulse = 0.06 + Math.sin(hook.glowPhase) * 0.03;
            var glowColor = hook.occupied ? 0xff0000 : 0xff2200;
            hook.hookGlow.clear();
            hook.hookGlow.fillStyle(glowColor, pulse);
            hook.hookGlow.fillCircle(hook.x, hook.y, hook.occupied ? 40 : 35);
            hook.hookGlow.setDepth(hook.y);
        }

        if (!hook.occupied || !hook.hookedSurvivor) return;

        var p = hook.hookedSurvivor;
        p.sprite.setPosition(hook.x, hook.y - 12);

        hook.hookTimer += dt / 1000;

        // Hook timer countdown
if (hook.hookTimer >= CONFIG.HOOK_TIME) {
            // Survivor dies on hook
            p.state = 'dead';
            p.sprite.setAlpha(0.3);
            p.sprite.setTint(0x888888);
            p.progressAction = null;
            p.isRepairing = false;
            if (p.repairSparks) p.repairSparks.setVisible(false);
            hook.occupied = false;
            hook.hookedSurvivor = null;
            hook.hookTimer = 0;
            hook.broken = true; // Hook becomes permanently broken
            survivorsAlive--;
            
            UI.showToast('\uD83D\uDC80 \u0412\u044B\u0436\u0438\u0432\u0448\u0438\u0439 \u043F\u043E\u0433\u0438\u0431 \u043D\u0430 \u043A\u0440\u043E\u043A\u0435!', 2000);
            
            // Enter observer mode if this is local player
            if (!isKiller && p.isMe) {
                enableObserverMode();
            }
            
            if (isMultiplayer && roomCode && p.playerId) {
                setPlayerDead(roomCode, p.playerId);
            }

            // Check if all survivors dead
            if (survivorsAlive <= 0 && isKiller) {
                endGame(true, '\u0412\u0441\u0435 \u0432\u044B\u0436\u0438\u0432\u0448\u0438\u0435 \u043F\u043E\u0433\u0438\u0431\u043B\u0438!');
            }
        }

        // Progress bar on hook
        if (hook.hookBarGfx) {
            hook.hookBarGfx.clear();
            var progress = hook.hookTimer / CONFIG.HOOK_TIME;
            hook.hookBarGfx.fillStyle(0x000000, 0.7);
            hook.hookBarGfx.fillRect(hook.x - 20, hook.y - 50, 40, 6);
            hook.hookBarGfx.fillStyle(progress > 0.7 ? 0xff4400 : 0xffaa00, 0.9);
            hook.hookBarGfx.fillRect(hook.x - 19, hook.y - 49, 38 * progress, 4);
        }
    });
}

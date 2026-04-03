// ═══════ ATMOSPHERE EFFECTS ═══════

function addBloodSplatter(x, y) {
    if (!scene || !scene.atmosphere) return;
    var atmo = scene.atmosphere;

    if (atmo.bloodSplatters.length > 50) {
        atmo.bloodSplatters.splice(0, atmo.bloodSplatters.length - 50);
    }

    for (var i = 0; i < 8; i++) {
        var angle = Math.random() * Math.PI * 2;
        var speed = 1 + Math.random() * 3;
        atmo.bloodSplatters.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            size: 2 + Math.random() * 4,
            alpha: 0.8,
            life: 0.5 + Math.random() * 0.5
        });
    }

    triggerScreenShake(5);
}

function updateBloodSplatters(dt) {
    if (!scene || !scene.atmosphere) return;
    var atmo = scene.atmosphere;
    var dtSec = dt / 1000;

    for (var i = atmo.bloodSplatters.length - 1; i >= 0; i--) {
        var b = atmo.bloodSplatters[i];
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.15;
        b.life -= dtSec;
        b.alpha = Math.max(0, b.life * 1.5);

        if (b.life <= 0) {
            atmo.bloodSplatters.splice(i, 1);
        }
    }
}

function triggerScreenShake(amount) {
    if (!scene || !scene.atmosphere) return;
    scene.atmosphere.screenShakeAmount = Math.max(scene.atmosphere.screenShakeAmount, amount);
}

function updateAtmosphere(dt) {
    if (!scene || !scene.atmosphere || window.isLowEndDevice) return;

    var atmo = scene.atmosphere;
    var cam = scene.cameras.main;
    if (!cam) return;

    // Heartbeat effect
    if (atmo.heartbeatGfx && !isKiller && player && player.sprite) {
        atmo.heartbeatGfx.clear();

        var nearestKillerDist = 9999;
        if (isMultiplayer) {
            Object.values(remotePlayers).forEach(function(rp) {
                if (rp.role === 'killer') {
                    var d = dist(player.sprite, rp.sprite);
                    if (d < nearestKillerDist) nearestKillerDist = d;
                }
            });
        } else {
            (player.aiPlayers || []).forEach(function(ai) {
                if (ai.isAIKiller) {
                    var d = dist(player.sprite, ai.sprite);
                    if (d < nearestKillerDist) nearestKillerDist = d;
                }
            });
        }

        var maxDist = 300;
        var intensity = Math.max(0, 1 - nearestKillerDist / maxDist);
        atmo.heartbeatIntensity += (intensity - atmo.heartbeatIntensity) * 0.1;

        if (atmo.heartbeatIntensity > 0.1) {
            atmo.breathPhase += dt * 0.003 * atmo.heartbeatIntensity;
            var pulse = Math.pow(Math.sin(atmo.breathPhase), 2) * atmo.heartbeatIntensity;

            atmo.heartbeatGfx.fillStyle(0x880000, pulse * 0.08);
            atmo.heartbeatGfx.fillRect(0, 0, cam.width, cam.height);

            atmo.heartbeatGfx.fillStyle(0xff0000, pulse * 0.15);
            atmo.heartbeatGfx.fillRect(0, 0, cam.width, 8);
            atmo.heartbeatGfx.fillRect(0, cam.height - 8, cam.width, 8);
            atmo.heartbeatGfx.fillRect(0, 0, 8, cam.height);
            atmo.heartbeatGfx.fillRect(cam.width - 8, 0, 8, cam.height);
        }
    }

    // Killer aura
    if (atmo.killerAuraGfx && isKiller && player && player.sprite) {
        atmo.killerAuraGfx.clear();
        var px = player.sprite.x - cam.scrollX;
        var py = player.sprite.y - cam.scrollY;

        var auraPulse = 0.5 + Math.sin(gameTime * 0.004) * 0.3;
        atmo.killerAuraGfx.fillStyle(0xff2200, auraPulse * 0.06);
        atmo.killerAuraGfx.fillCircle(px, py, 80);
        atmo.killerAuraGfx.fillStyle(0xff4400, auraPulse * 0.03);
        atmo.killerAuraGfx.fillCircle(px, py, 120);
    }

    // Ambient particles
    if (atmo.ambientGfx && atmo.ambientParticles) {
        atmo.ambientGfx.clear();

        atmo.ambientParticles.forEach(function(p) {
            p.flicker += dt * 0.005;
            p.x += p.speedX + Math.sin(p.flicker) * 0.15;
            p.y += p.speedY;

            if (p.x < -10) p.x = cam.width + 10;
            if (p.x > cam.width + 10) p.x = -10;
            if (p.y < -10) p.y = cam.height + 10;
            if (p.y > cam.height + 10) p.y = -10;

            var flickerAlpha = p.alpha * (0.7 + Math.sin(p.flicker * 2) * 0.3);

            atmo.ambientGfx.fillStyle(p.color, flickerAlpha * 0.5);
            atmo.ambientGfx.fillCircle(p.x, p.y, p.size + 1);
            atmo.ambientGfx.fillStyle(p.color, flickerAlpha);
            atmo.ambientGfx.fillCircle(p.x, p.y, p.size);
        });
    }

    // Screen shake
    if (atmo.screenShakeAmount > 0.5) {
        cam.shake(50, atmo.screenShakeAmount * 0.003);
        atmo.screenShakeAmount *= 0.9;
    }

    // Blood splatters
    if (atmo.bloodGfx && atmo.bloodSplatters.length > 0) {
        atmo.bloodGfx.clear();
        atmo.bloodSplatters.forEach(function(b) {
            var sx = b.x - cam.scrollX;
            var sy = b.y - cam.scrollY;
            atmo.bloodGfx.fillStyle(0x880000, b.alpha * 0.8);
            atmo.bloodGfx.fillCircle(sx, sy, b.size);
            atmo.bloodGfx.fillStyle(0xaa0000, b.alpha * 0.4);
            atmo.bloodGfx.fillCircle(sx, sy, b.size * 1.5);
        });
    } else if (atmo.bloodGfx) {
        atmo.bloodGfx.clear();
    }
}

function updateDustAndAsh(dt) {
    if (!scene || window.isLowEndDevice) return;

    if (scene.dustGfx && scene.dustParticles) {
        scene.dustGfx.clear();
        var cam = scene.cameras.main;
        if (!cam) return;

        scene.dustParticles.forEach(function(p) {
            p.wobble += 0.015;
            p.x += p.speedX + Math.sin(p.wobble) * 0.15;
            p.y += p.speedY;

            if (p.x < 0) p.x = MAP_W;
            if (p.x > MAP_W) p.x = 0;
            if (p.y < 0) p.y = MAP_H;
            if (p.y > MAP_H) p.y = 0;

            var sx = p.x - cam.scrollX;
            var sy = p.y - cam.scrollY;

            if (sx > -20 && sx < cam.width + 20 && sy > -20 && sy < cam.height + 20) {
                scene.dustGfx.fillStyle(p.color, p.alpha);
                scene.dustGfx.fillCircle(sx, sy, p.size);
            }
        });
    }

    if (scene.ashGfx && scene.ashParticles) {
        scene.ashGfx.clear();
        var cam2 = scene.cameras.main;
        if (!cam2) return;

        scene.ashParticles.forEach(function(p) {
            p.flicker += 0.03;
            p.x += p.speedX + Math.sin(p.flicker) * 0.1;
            p.y += p.speedY;

            if (p.y < -20) {
                p.y = MAP_H + 20;
                p.x = Math.random() * MAP_W;
            }
            if (p.x < 0) p.x = MAP_W;
            if (p.x > MAP_W) p.x = 0;

            var sx = p.x - cam2.scrollX;
            var sy = p.y - cam2.scrollY;

            if (sx > -20 && sx < cam2.width + 20 && sy > -20 && sy < cam2.height + 20) {
                var flickerAlpha = p.alpha * (0.6 + Math.sin(p.flicker * 2) * 0.4);
                scene.ashGfx.fillStyle(0xff6622, flickerAlpha * 0.3);
                scene.ashGfx.fillCircle(sx, sy, p.glowSize);
                scene.ashGfx.fillStyle(0xff8844, flickerAlpha);
                scene.ashGfx.fillCircle(sx, sy, p.size);
            }
        });
    }
}

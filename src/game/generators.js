// ═══════ GENERATORS ═══════

function updateGenerators(dt) {
    generators.forEach(gen => {
        // Flickering light effect
        if (gen.lightGlowGfx && !gen.repaired) {
            var flicker = 0.5 + Math.sin(gameTime * 0.002 + gen.lightFlickerPhase) * 0.3;
            gen.lightGlowGfx.setAlpha(flicker);
            gen.lightGlowInnerGfx.setAlpha(flicker * 1.3);
            gen.lightSprite.setAlpha(0.7 + flicker * 0.3);
        }

        // Repair progress
        if (gen.repairingBy && !gen.repaired) {
            gen.progress += CONFIG.GENERATOR_REPAIR_RATE * dt / 1000;

            if (gen.progress >= 100) {
                gen.progress = 100;
                gen.repaired = true;
                gen.repairingBy = null;
                gen.repairBarGfx.clear();
                if (gen.repairSparks) gen.repairSparks.setVisible(false);
                if (gen.lightGlowGfx) gen.lightGlowGfx.setAlpha(1);
                if (gen.lightGlowInnerGfx) gen.lightGlowInnerGfx.setAlpha(1);
                if (gen.lightSprite) gen.lightSprite.setAlpha(1);

                var repairedCount = generators.filter(function(g) { return g.repaired; }).length;
                UI.showToast('\u26a1\uFE0F \u0413\u0435\u043D\u0435\u0440\u0430\u0442\u043E\u0440 \u043F\u043E\u0447\u0438\u043D\u0435\u043D! (' + repairedCount + '/5)', 2000);

                if (isMultiplayer && roomCode && playerId) {
                    updateGeneratorProgress(roomCode, gen.genId, 100, true);
                }

                // Check if enough generators repaired
                if (repairedCount >= CONFIG.GENS_REQUIRED_FOR_EXIT && !exitOpen) {
                    exitOpen = true;
                    UI.showToast('\uD83D\uDEAA \u0412\u044B\u0445\u043E\u0434 \u043E\u0442\u043A\u0440\u044B\u0442!', 3000);
                    if (isMultiplayer && roomCode) setGateOpened(roomCode, true);
                }

                // Hatch spawns when all generators repaired
                if (repairedCount >= 5 && !hatchOpen && !hatchClosed) {
                    hatchOpen = true;
                    hatch.sprite.setVisible(true);
                    hatch.sprite.setDepth(hatch.sprite.y + 1);
                    UI.showToast('\uD83D\uDD73\uFE0F \u041B\u044E\u043A \u043F\u043E\u044F\u0432\u0438\u043B\u0441\u044F!', 3000);
                    if (isMultiplayer && roomCode) setHatchSpawned(roomCode, hatch.x, hatch.y);
                }
            }

            // Update repair bar
            if (gen.repairBarGfx) {
                gen.repairBarGfx.clear();
                gen.repairBarGfx.fillStyle(0x000000, 0.7);
                gen.repairBarGfx.fillRect(gen.bx - 25, gen.by - 45, 50, 8);
                gen.repairBarGfx.fillStyle(0x00ff44, 0.9);
                gen.repairBarGfx.fillRect(gen.bx - 24, gen.by - 44, 48 * (gen.progress / 100), 6);
            }
        }

        // Repair sparks animation
        if (gen.repairSparks && gen.repairingBy && !gen.repaired) {
            gen.repairSparks.setVisible(true);
            gen.repairSparks.clear();
            for (var i = 0; i < 3; i++) {
                var sparkX = gen.bx + (Math.random() - 0.5) * 30;
                var sparkY = gen.by + (Math.random() - 0.5) * 20;
                gen.repairSparks.fillStyle(0xffff00, 0.6 + Math.random() * 0.4);
                gen.repairSparks.fillCircle(sparkX, sparkY, 1 + Math.random() * 2);
            }
        } else if (gen.repairSparks) {
            gen.repairSparks.setVisible(false);
        }
    });
}

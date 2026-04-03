// ═══════ GENERATORS ═══════

function updateGenerators(dt) {
    generators.forEach(function(gen) {
        // Flickering light effect
        if (gen.lightGlowGfx && !gen.repaired) {
            var flicker = 0.5 + Math.sin(gameTime * 0.002 + gen.lightFlickerPhase) * 0.3;
            gen.lightGlowGfx.setAlpha(flicker);
            gen.lightGlowInnerGfx.setAlpha(flicker * 1.3);
            gen.lightSprite.setAlpha(0.7 + flicker * 0.3);
        }

        // Hide sparks when not repairing
        if (gen.repairSparks && !player.isRepairing) {
            gen.repairSparks.setVisible(false);
        }
    });
}

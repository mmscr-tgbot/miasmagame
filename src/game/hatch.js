// ═══════ HATCH ═══════

function updateHatch(dt) {
    if (!hatch || !player || !player.sprite) return;

    var d = Math.sqrt(Math.pow(player.sprite.x - hatch.x, 2) + Math.pow(player.sprite.y - hatch.y, 2));

    if (!isKiller && hatchOpen && !hatchClosed && d < CONFIG.INTERACT_DISTANCE) {
        isNearHatch = true;
        if (actionPressed && !isEscapingHatch) {
            isEscapingHatch = true;
            hatchEscapeProgress = 0;
        }
    } else {
        isNearHatch = false;
    }

    if (isEscapingHatch) {
        hatchEscapeProgress += dt / 1000;
        if (hatchEscapeProgress >= HATCH_ESCAPE_TIME) {
            endGame(true, '\u0412\u044B \u0441\u0431\u0435\u0436\u0430\u043B\u0438 \u0447\u0435\u0440\u0435\u0437 \u043B\u044E\u043A!');
            return;
        }
    }

    // Killer can close hatch
    if (isKiller && hatchOpen && !hatchClosed && d < CONFIG.INTERACT_DISTANCE) {
        if (actionPressed) {
            hatchClosed = true;
            hatch.sprite.setVisible(false);
            UI.showToast('\uD83D\uDD73\uFE0F \u041B\u044E\u043A \u0437\u0430\u043A\u0440\u044B\u0442!', 2000);
            if (isMultiplayer && roomCode) closeHatch(roomCode);
        }
    }
}

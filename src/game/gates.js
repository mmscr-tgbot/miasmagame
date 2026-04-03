// ═══════ GATES ═══════

function updateGateGlow(dt) {
    gates.forEach(function(gate) {
        if (gate.gateGlow) {
            gate.glowPhase += dt * 0.002;
            var pulse = 0.04 + Math.sin(gate.glowPhase) * 0.02;
            var glowColor = gate.opened ? 0x00ff44 : 0xff6600;
            gate.gateGlow.clear();
            gate.gateGlow.fillStyle(glowColor, pulse);
            gate.gateGlow.fillCircle(gate.bx, gate.by, gate.opened ? 55 : 45);
            gate.gateGlow.setDepth(gate.by);
        }
    });
}

function updateGates(dt) {
    gates.forEach(function(gate) {
        if (gate.isOpening && !gate.opened) {
            gate.progress += CONFIG.GATE_RATE * dt / 1000;
            if (gate.progress >= 100) {
                gate.progress = 100;
                gate.opened = true;
                gate.isOpening = false;
                UI.showToast('\uD83D\uDEAA \u0412\u044B\u0445\u043E\u0434 \u043E\u0442\u043A\u0440\u044B\u0442!', 2000);
            }
        }

        if (gate.barGfx) {
            gate.barGfx.clear();
            gate.barGfx.fillStyle(0x000000, 0.7);
            gate.barGfx.fillRect(gate.bx - 25, gate.by - 45, 50, 8);
            gate.barGfx.fillStyle(0x00ff44, 0.9);
            gate.barGfx.fillRect(gate.bx - 24, gate.by - 44, 48 * (gate.progress / 100), 6);
        }
    });
}

// ═══════ FOG SYSTEM ═══════

function updateFog(dt) {
    if (!scene || !scene.fogGfx || !scene.fogPatches || window.isLowEndDevice) return;

    var fogGfx = scene.fogGfx;
    // fogGfx can be an array or single graphics object
    if (Array.isArray(fogGfx)) {
        fogGfx.forEach(function(g) { g.clear(); });
    } else {
        fogGfx.clear();
    }

    var cam = scene.cameras.main;
    if (!cam) return;

    // Only render fog patches near the camera (optimization)
    var camCenterX = cam.scrollX + cam.width / 2;
    var camCenterY = cam.scrollY + cam.height / 2;
    var maxDist = cam.width * 0.8;

    scene.fogPatches.forEach(function(patch) {
        var dx = camCenterX - patch.x;
        var dy = camCenterY - patch.y;
        var d = Math.sqrt(dx * dx + dy * dy);

        if (d < maxDist) {
            var alpha = patch.alpha * (1 - d / maxDist);
            var flicker = 0.9 + Math.sin(gameTime * 0.001 + patch.x) * 0.1;
            var layer = patch.layer || 0;
            var gfx = Array.isArray(fogGfx) ? fogGfx[Math.min(layer, fogGfx.length - 1)] : fogGfx;
            gfx.fillStyle(0x445566, alpha * flicker);
            gfx.fillCircle(patch.x - cam.scrollX, patch.y - cam.scrollY, patch.width / 2);
        }
    });
}

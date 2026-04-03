// ═══════ CROWS ═══════

function updateCrows(dt) {
    if (!scene || !scene.crows) return;

    scene.crows.forEach(function(crow) {
        var baseScale = crow.baseScale || 0.8;

        // Check if player is nearby - fly away!
        if (player && player.sprite && (crow.state === 'sitting' || crow.state === 'idle')) {
            var d = dist(crow.sprite, player.sprite);
            if (d < 50 && !crow.fleeing) {
                crow.fleeing = true;
                crow.state = 'flying';
                crow.flyTimer = 0;
                crow.startX = crow.sprite.x;
                crow.startY = crow.sprite.y;
                crow.flyDuration = 0.8 + Math.random() * 0.4;
                crow.flyHeight = 40 + Math.random() * 30;

                // Fly away from player with some randomness
                var awayAngle = Math.atan2(crow.sprite.y - player.sprite.y, crow.sprite.x - player.sprite.x);
                var spread = (Math.random() - 0.5) * 0.8;
                awayAngle += spread;

                var flyDist = 100 + Math.random() * 150;
                crow.targetX = crow.sprite.x + Math.cos(awayAngle) * flyDist;
                crow.targetY = crow.sprite.y + Math.sin(awayAngle) * flyDist;
                crow.targetX = Math.max(50, Math.min(MAP_W - 50, crow.targetX));
                crow.targetY = Math.max(50, Math.min(MAP_H - 50, crow.targetY));

                crow.sprite.flipX = crow.targetX < crow.sprite.x;
                crow.sprite.setTexture('crow');
            }
        }

        if (crow.state === 'flying') {
            crow.flyTimer += dt / 1000;
            var progress = Math.min(1, crow.flyTimer / crow.flyDuration);

            // Smooth ease-in-out
            var eased = progress < 0.5
                ? 2 * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 2) / 2;

            // Arc trajectory - goes up then down
            var arcHeight = Math.sin(progress * Math.PI) * (crow.flyHeight || 50);

            crow.sprite.x = crow.startX + (crow.targetX - crow.startX) * eased;
            crow.sprite.y = crow.startY + (crow.targetY - crow.startY) * eased - arcHeight;
            crow.sprite.setDepth(crow.sprite.y);

            // Flap animation
            crow.flapPhase += crow.flapSpeed * 2;
            var flapAmount = Math.sin(crow.flapPhase) * 0.12;
            crow.sprite.setScale(baseScale, baseScale + flapAmount);

            if (progress >= 1) {
                crow.state = 'sitting';
                crow.fleeing = false;
                crow.sitTimer = 0;
                crow.maxSitTime = 5 + Math.random() * 10;
                crow.sprite.setTexture('crow_sitting');
                crow.sprite.setScale(baseScale, baseScale);
            }
        } else if (crow.state === 'sitting' || crow.state === 'idle') {
            crow.sitTimer += dt / 1000;
            if (crow.sitTimer >= crow.maxSitTime) {
                crow.state = 'flying';
                crow.flyTimer = 0;
                crow.startX = crow.sprite.x;
                crow.startY = crow.sprite.y;
                crow.flyDuration = 0.6 + Math.random() * 0.4;
                crow.flyHeight = 20 + Math.random() * 20;
                crow.baseScale = crow.sprite.scaleX || 0.8;

                var angle = Math.random() * Math.PI * 2;
                var flyDist = 60 + Math.random() * 120;
                crow.targetX = crow.sprite.x + Math.cos(angle) * flyDist;
                crow.targetY = crow.sprite.y + Math.sin(angle) * flyDist;
                crow.targetX = Math.max(50, Math.min(MAP_W - 50, crow.targetX));
                crow.targetY = Math.max(50, Math.min(MAP_H - 50, crow.targetY));

                crow.sprite.flipX = crow.targetX < crow.sprite.x;
                crow.sprite.setTexture('crow');
            }
        }
    });
}

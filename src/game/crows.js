// ═══════ CROWS ═══════

function updateCrows(dt) {
    if (!scene || !scene.crows) return;

    scene.crows.forEach(function(crow) {
        var baseScale = crow.baseScale || 0.8;

        // Check if player is nearby - scare crows!
        if (player && player.sprite) {
            var d = dist(crow.sprite, player.sprite);
            var scareDist = crow.scared ? 150 : 80;
            
            if (d < scareDist && (crow.state === 'sitting' || crow.state === 'landing')) {
                crow.scared = true;
                crow.state = 'flying';
                crow.flyTimer = 0;
                crow.startX = crow.sprite.x;
                crow.startY = crow.sprite.y;
                crow.flyDuration = 1.0 + Math.random() * 0.8;
                crow.flyHeight = 60 + Math.random() * 40;

                // Fly away from player
                var awayAngle = Math.atan2(crow.sprite.y - player.sprite.y, crow.sprite.x - player.sprite.x);
                awayAngle += (Math.random() - 0.5) * 1.2;

                var flyDist = 200 + Math.random() * 300;
                crow.targetX = crow.sprite.x + Math.cos(awayAngle) * flyDist;
                crow.targetY = crow.sprite.y + Math.sin(awayAngle) * flyDist;
                crow.targetX = Math.max(100, Math.min(MAP_W - 100, crow.targetX));
                crow.targetY = Math.max(100, Math.min(MAP_H - 100, crow.targetY));

                crow.sprite.flipX = crow.targetX < crow.sprite.x;
                crow.sprite.setTexture('crow');
            }
        }

        if (crow.state === 'flying') {
            crow.flyTimer += dt / 1000;
            var progress = Math.min(1, crow.flyTimer / crow.flyDuration);

            // Arc trajectory
            var arcHeight = Math.sin(progress * Math.PI) * (crow.flyHeight || 50);

            crow.sprite.x = crow.startX + (crow.targetX - crow.startX) * progress;
            crow.sprite.y = crow.startY + (crow.targetY - crow.startY) * progress - arcHeight;
            crow.sprite.setDepth(crow.sprite.y - arcHeight);

            // Wing flap animation
            crow.flapPhase += crow.flapSpeed * 3;
            var flapScale = Math.sin(crow.flapPhase) * 0.15;
            crow.sprite.setScale(baseScale, baseScale + flapScale);

            if (progress >= 1) {
                // Decide: land or keep flying
                if (crow.scared && Math.random() > 0.4) {
                    // Keep flying - circle around
                    crow.scared = false;
                    crow.flyTimer = 0;
                    crow.startX = crow.sprite.x;
                    crow.startY = crow.sprite.y;
                    crow.flyDuration = 2 + Math.random() * 3;
                    crow.flyHeight = 30 + Math.random() * 30;
                    
                    var circleAngle = Math.random() * Math.PI * 2;
                    var circleDist = 100 + Math.random() * 200;
                    crow.targetX = crow.sprite.x + Math.cos(circleAngle) * circleDist;
                    crow.targetY = crow.sprite.y + Math.sin(circleAngle) * circleDist;
                    crow.targetX = Math.max(100, Math.min(MAP_W - 100, crow.targetX));
                    crow.targetY = Math.max(100, Math.min(MAP_H - 100, crow.targetY));
                } else {
                    // Land
                    crow.state = 'landing';
                    crow.landTimer = 0;
                    crow.sprite.setTexture('crow_sitting');
                    crow.sprite.setScale(baseScale, baseScale);
                    crow.sprite.setDepth(crow.sprite.y);
                }
            }
        } else if (crow.state === 'landing') {
            crow.landTimer += dt / 1000;
            if (crow.landTimer > 0.3) {
                crow.state = 'sitting';
                crow.sitTimer = 0;
                crow.maxSitTime = 8 + Math.random() * 15;
                crow.scared = false;
            }
        } else if (crow.state === 'sitting') {
            // Occasionally look around
            crow.sitTimer += dt / 1000;
            
            // Random idle behavior - look left/right
            if (!crow.lookTimer || crow.lookTimer <= 0) {
                crow.lookTimer = 2 + Math.random() * 5;
                crow.sprite.flipX = Math.random() > 0.5;
            }
            crow.lookTimer -= dt / 1000;
            
            // After sitting too long, fly to nearby spot
            if (crow.sitTimer >= crow.maxSitTime) {
                crow.state = 'flying';
                crow.flyTimer = 0;
                crow.startX = crow.sprite.x;
                crow.startY = crow.sprite.y;
                crow.flyDuration = 0.5 + Math.random() * 0.5;
                crow.flyHeight = 20 + Math.random() * 20;
                crow.baseScale = crow.sprite.scaleX || 0.8;

                var angle = Math.random() * Math.PI * 2;
                var flyDist = 50 + Math.random() * 100;
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

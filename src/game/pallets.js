// ═══════ PALLETS ═══════

function updatePallets(dt) {
    var nearPallet = false;
    pallets.forEach(function(pallet) {
        if (pallet.dropCooldown > 0) pallet.dropCooldown -= dt / 1000;
        if (pallet.stunTimer > 0) pallet.stunTimer -= dt / 1000;

        if (pallet.state === 'dropping') {
            pallet.dropTimer += dt / 1000;
            var fallProgress = pallet.dropTimer / 0.3;

            if (fallProgress >= 1) {
                pallet.state = 'fallen';
                pallet.sprite.setTexture('pallet_falling');
                pallet.sprite.setScale(1, 1);

                var killerHit = false;

                if (isKiller && player && player.sprite) {
                    var d = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
                    if (d < 60) {
                        killerHit = true;
                        killerStun = CONFIG.STUN_TIME;
                        UI.showToast('\uD83D\uDCA5 \u0423\u0431\u0438\u0439\u0446\u0430 \u043E\u0433\u043B\u0443\u0448\u0451\u043D!', 1500);
                    }
                }

                if (!killerHit && !isKiller && !isMultiplayer && player && player.aiPlayers) {
                    player.aiPlayers.forEach(function(ai) {
                        if (ai.isAIKiller && ai.sprite && !killerHit) {
                            var d = Math.sqrt(Math.pow(ai.sprite.x - pallet.bx, 2) + Math.pow(ai.sprite.y - pallet.by, 2));
                            if (d < 60) {
                                killerHit = true;
                                killerStun = CONFIG.STUN_TIME;
                                ai.slowdownTimer = CONFIG.STUN_TIME;
                                UI.showToast('\uD83D\uDCA5 \u0423\u0431\u0438\u0439\u0446\u0430 \u043E\u0433\u043B\u0443\u0448\u0451\u043D!', 1500);
                            }
                        }
                    });
                }

                if (isMultiplayer && !killerHit) {
                    Object.values(remotePlayers).forEach(function(rp) {
                        if (rp.role === 'killer' && rp.sprite && !killerHit) {
                            var d = Math.sqrt(Math.pow(rp.sprite.x - pallet.bx, 2) + Math.pow(rp.sprite.y - pallet.by, 2));
                            if (d < 60) {
                                killerHit = true;
                                if (isMultiplayer && roomCode && playerId) stunRemoteKiller(roomCode);
                                UI.showToast('\uD83D\uDCA5 \u0423\u0431\u0438\u0439\u0446\u0430 \u043E\u0433\u043B\u0443\u0448\u0451\u043D!', 1500);
                            }
                        }
                    });
                }

                if (killerHit) {
                    pallet.stunTimer = 0.5;
                    pallet.hitFx = scene.add.graphics();
                    pallet.hitFx.fillStyle(0xffff00, 0.5);
                    pallet.hitFx.fillCircle(pallet.bx, pallet.by - 20, 40);
                    pallet.hitFx.setDepth(500);
                    setTimeout(function() { if (pallet.hitFx) pallet.hitFx.destroy(); }, 300);
                    matchStats.palletsStunned++;
                    addBloodpoints('deviousness', 2000, 'Оглушение убийцы');
                }

                pallet.breakTimer = 15;

                if (isMultiplayer && roomCode && playerId) {
                    updatePalletState(roomCode, pallet.palletId, 'fallen', pallet.bx, pallet.by);
                }
            } else {
                var angle = fallProgress * Math.PI / 2;
                pallet.sprite.setScale(1.2, 1 - fallProgress * 0.3);
                pallet.sprite.setRotation(angle);
            }
        }

        if (pallet.state === 'broken') {
            pallet.breakTimer -= dt / 1000;
            pallet.sprite.setAlpha(pallet.breakTimer / 2);
            if (pallet.breakTimer <= 0) {
                pallet.sprite.setVisible(false);
                if (pallet.shadow) pallet.shadow.setVisible(false);
            }
        }

        if (pallet.state === 'fallen' && pallet.breakTimer > 0) {
            pallet.breakTimer -= dt / 1000;
        }

        if (pallet.shadow && pallet.sprite && pallet.sprite.visible) {
            pallet.shadow.clear();
            if (pallet.state === 'standing') {
                pallet.shadow.fillStyle(0x000000, 0.3);
                pallet.shadow.fillEllipse(pallet.bx, pallet.by + 35, 30, 12);
            } else if (pallet.state === 'fallen' || pallet.state === 'broken') {
                pallet.shadow.fillStyle(0x000000, 0.3);
                pallet.shadow.fillEllipse(pallet.bx, pallet.by + 15, 50, 15);
            }
        }

        if (!isKiller && pallet.state === 'standing' && pallet.dropCooldown <= 0 && player && player.sprite) {
            var d = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
            if (d < 50) nearPallet = true;
        } else if (isKiller && pallet.state === 'standing' && player && player.sprite) {
            var d2 = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
            if (d2 < 50) nearPallet = true;
        } else if (isKiller && pallet.state === 'fallen' && player && player.sprite) {
            var d3 = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
            if (d3 < 50) nearPallet = true;
        }
    });

    var pbtn = document.getElementById('pallet-btn');
    if (pbtn) {
        if (nearPallet) {
            pbtn.style.display = 'flex';
            pbtn.textContent = isKiller ? '\uD83D\uDD28' : '\uD83E\uDEB5';
        } else {
            pbtn.style.display = 'none';
        }
    }

    if (palletPressed) {
        palletPressed = false;

        if (!isKiller) {
            pallets.forEach(function(pallet) {
                if (pallet.state === 'standing' && pallet.dropCooldown <= 0 && player && player.sprite) {
                    var d = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
                    if (d < 50) dropPallet(pallet);
                }
            });
        } else {
            pallets.forEach(function(pallet) {
                if ((pallet.state === 'standing' || pallet.state === 'fallen') && player && player.sprite) {
                    var d = Math.sqrt(Math.pow(player.sprite.x - pallet.bx, 2) + Math.pow(player.sprite.y - pallet.by, 2));
                    if (d < 50) breakPallet(pallet);
                }
            });
        }
    }
}

function dropPallet(pallet) {
    if (pallet.state !== 'standing') return;
    pallet.state = 'dropping';
    pallet.dropTimer = 0;
    pallet.sprite.setTexture('pallet');
    pallet.sprite.setScale(1.2, 1);
    pallet.sprite.setRotation(0);
    pallet.dropCooldown = 0.5;
    pallet.breakTimer = 15;
    if (pallet.interactHint) pallet.interactHint.setVisible(false);
    matchStats.palletsDropped++;
    addBloodpoints('objective', 1000, 'Доска сброшена');
    UI.showToast('\uD83D\uDCA8 \u0414\u043E\u0441\u043A\u0430 \u043F\u0430\u0434\u0430\u0435\u0442!', 800);
    if (isMultiplayer && roomCode && playerId) {
        updatePalletState(roomCode, pallet.palletId, 'dropping', pallet.bx, pallet.by);
    }
}

function breakPallet(pallet) {
    if (pallet.state !== 'fallen') return;
    pallet.state = 'broken';
    pallet.breakTimer = 2;
    pallet.sprite.setAlpha(0.5);
    pallet.sprite.setScale(1, 0.5);
    UI.showToast('\uD83D\uDCAA \u0423\u0431\u0438\u0439\u0446\u0430 \u043B\u043E\u043C\u0430\u0435\u0442 \u0434\u043E\u0441\u043A\u0443!', 1000);
    if (isMultiplayer && roomCode && playerId) {
        updatePalletState(roomCode, pallet.palletId, 'broken', pallet.bx, pallet.by);
    }
}

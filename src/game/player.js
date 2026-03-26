class Player {
    constructor(scene, x, y, role, playerId) {
        this.scene = scene;
        this.playerId = playerId;
        this.role = role;
        this.isKiller = role === 'killer';
        
        const radius = this.isKiller ? 20 : 15;
        const color = this.isKiller ? 0xff3333 : 0x33ff33;
        
        this.sprite = scene.add.circle(x, y, radius, color);
        
        if (scene.physics) {
            scene.physics.add.existing(this.sprite);
            this.sprite.body.setCollideWorldBounds(true);
        }
        
        this.speed = this.isKiller ? CONFIG.KILLER_SPEED : CONFIG.PLAYER_SPEED;
        this.isCaught = false;
    }
    
    setPosition(x, y) {
        if (this.sprite && this.sprite.body) {
            this.sprite.x = x;
            this.sprite.y = y;
        }
    }
    
    getPosition() {
        return {
            x: this.sprite?.x || 0,
            y: this.sprite?.y || 0
        };
    }
    
    setVelocity(vx, vy) {
        if (this.sprite && this.sprite.body) {
            this.sprite.body.setVelocity(vx, vy);
        }
    }
    
    getVelocity() {
        return {
            x: this.sprite?.body?.velocity?.x || 0,
            y: this.sprite?.body?.velocity?.y || 0
        };
    }
    
    setCaught(caught) {
        this.isCaught = caught;
        if (this.sprite) {
            this.sprite.setAlpha(caught ? 0.3 : 1);
        }
    }
    
    setVisible(visible) {
        if (this.sprite) {
            this.sprite.setVisible(visible);
        }
    }
    
    destroy() {
        if (this.sprite) {
            this.sprite.destroy();
        }
    }
}
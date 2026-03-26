class Generator {
    constructor(scene, x, y, generatorId) {
        this.scene = scene;
        this.generatorId = generatorId;
        this.progress = 0;
        this.isRepaired = false;
        this.repairingBy = null;
        
        this.sprite = scene.add.rectangle(x, y, 30, 30, 0x4444ff);
        
        this.progressBar = scene.add.graphics();
        
        this.updateProgressBar();
    }
    
    updateProgress(progress, repaired, repairingBy) {
        this.progress = progress;
        this.isRepaired = repaired;
        this.repairingBy = repairingBy;
        
        this.updateProgressBar();
        
        if (this.isRepaired) {
            this.sprite.setFillStyle(0x00ff00);
        }
    }
    
    updateProgressBar() {
        this.progressBar.clear();
        
        if (!this.isRepaired && this.progress > 0) {
            this.progressBar.fillStyle(0x000000, 0.5);
            this.progressBar.fillRect(this.sprite.x - 20, this.sprite.y - 25, 40, 6);
            
            this.progressBar.fillStyle(0xffff00);
            this.progressBar.fillRect(this.sprite.x - 19, this.sprite.y - 24, 38 * (this.progress / 100), 4);
        }
    }
    
    getPosition() {
        return {
            x: this.sprite?.x || 0,
            y: this.sprite?.y || 0
        };
    }
    
    isNearPlayer(player, distance = 50) {
        if (!player || !player.sprite) return false;
        
        const dx = this.sprite.x - player.sprite.x;
        const dy = this.sprite.y - player.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        return dist < distance;
    }
    
    destroy() {
        if (this.sprite) {
            this.sprite.destroy();
        }
        if (this.progressBar) {
            this.progressBar.destroy();
        }
    }
}
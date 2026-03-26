const Input = {
    vector: { x: 0, y: 0 },
    actionPressed: false,
    joystick: null,
    actionBtn: null,
    gameScene: null,
    
    init(scene) {
        this.gameScene = scene;
        this.createJoystick();
        this.createActionButton();
    },
    
    createJoystick() {
        if (this.joystick) return;
        
        const zone = document.createElement('div');
        zone.id = 'joystick-zone';
        zone.style.cssText = 'position: fixed; bottom: 30px; left: 30px; width: 110px; height: 110px; z-index: 200; touch-action: none;';
        
        const base = document.createElement('div');
        base.style.cssText = 'width: 100%; height: 100%; background: rgba(255,255,255,0.15); border: 3px solid rgba(255,255,255,0.4); border-radius: 50%; position: relative;';
        
        const stick = document.createElement('div');
        stick.style.cssText = 'width: 45px; height: 45px; background: rgba(255,50,50,0.9); border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);';
        
        base.appendChild(stick);
        zone.appendChild(base);
        document.body.appendChild(zone);
        this.joystick = { zone, base, stick };
        
        let touching = false;
        const maxDist = 45;
        
        const updateJoystick = (cx, cy) => {
            const rect = base.getBoundingClientRect();
            const cx2 = rect.left + rect.width / 2;
            const cy2 = rect.top + rect.height / 2;
            let dx = cx - cx2;
            let dy = cy - cy2;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const limitedDist = Math.min(dist, maxDist);
            const angle = Math.atan2(dy, dx);
            const nx = (limitedDist / maxDist) * Math.cos(angle);
            const ny = (limitedDist / maxDist) * Math.sin(angle);
            stick.style.transform = 'translate(calc(-50% + ' + (nx * maxDist) + 'px), calc(-50% + ' + (ny * maxDist) + 'px))';
            this.vector.x = nx;
            this.vector.y = ny;
        };
        
        const resetJoystick = () => {
            touching = false;
            stick.style.transform = 'translate(-50%, -50%)';
            this.vector.x = 0;
            this.vector.y = 0;
        };
        
        zone.addEventListener('touchstart', e => { e.preventDefault(); touching = true; updateJoystick(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
        zone.addEventListener('touchmove', e => { e.preventDefault(); if (touching) updateJoystick(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
        zone.addEventListener('touchend', resetJoystick);
        zone.addEventListener('mousedown', e => { touching = true; updateJoystick(e.clientX, e.clientY); });
        document.addEventListener('mousemove', e => { if (touching) updateJoystick(e.clientX, e.clientY); });
        document.addEventListener('mouseup', resetJoystick);
    },
    
    createActionButton() {
        if (this.actionBtn) return;
        
        const btn = document.createElement('div');
        btn.textContent = 'ДЕЙСТВИЕ';
        btn.style.cssText = 'position: fixed; bottom: 50px; right: 30px; width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #ff6600, #ff3300); border: 3px solid rgba(255,255,255,0.5); color: #fff; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; z-index: 200; touch-action: none;';
        
        const press = () => { this.actionPressed = true; btn.style.transform = 'scale(0.95)'; };
        const release = () => { this.actionPressed = false; btn.style.transform = 'scale(1)'; };
        
        btn.addEventListener('touchstart', e => { e.preventDefault(); press(); }, { passive: false });
        btn.addEventListener('touchend', release);
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        
        document.body.appendChild(btn);
        this.actionBtn = btn;
    },
    
    getVector() { return this.vector; },
    isActionPressed() { return this.actionPressed; },
    
    destroy() {
        if (this.joystick && this.joystick.zone) { this.joystick.zone.remove(); this.joystick = null; }
        if (this.actionBtn) { this.actionBtn.remove(); this.actionBtn = null; }
    }
};
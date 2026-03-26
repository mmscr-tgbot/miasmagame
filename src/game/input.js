const Input = {
    vector: { x: 0, y: 0 },
    actionPressed: false,
    joystick: null,
    actionBtn: null,
    
    init() {
        this.createJoystick();
        this.createActionButton();
    },
    
    createJoystick() {
        if (this.joystick) return;
        
        const zone = document.createElement('div');
        zone.id = 'joystick-zone';
        zone.style.cssText = 'position: fixed; bottom: 30px; left: 30px; width: 100px; height: 100px; z-index: 100;';
        
        const base = document.createElement('div');
        base.id = 'joystick-base';
        base.style.cssText = 'width: 100%; height: 100%; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; position: relative;';
        
        const stick = document.createElement('div');
        stick.id = 'joystick-stick';
        stick.style.cssText = 'width: 40px; height: 40px; background: rgba(255,50,50,0.8); border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);';
        
        base.appendChild(stick);
        zone.appendChild(base);
        document.body.appendChild(zone);
        this.joystick = { zone, base, stick };
        
        let touching = false;
        const maxDist = 40;
        
        const updateJoystick = (cx, cy) => {
            const rect = base.getBoundingClientRect();
            const dx = cx - (rect.left + rect.width/2);
            const dy = cy - (rect.top + rect.height/2);
            
            const dist = Math.sqrt(dx*dx + dy*dy);
            const limitedDist = Math.min(dist, maxDist);
            const angle = Math.atan2(dy, dx);
            
            const nx = (limitedDist / maxDist) * Math.cos(angle);
            const ny = (limitedDist / maxDist) * Math.sin(angle);
            
            stick.style.transform = `translate(calc(-50% + ${nx * maxDist}px), calc(-50% + ${ny * maxDist}px))`;
            
            this.vector.x = nx;
            this.vector.y = ny;
        };
        
        zone.addEventListener('touchstart', e => {
            e.preventDefault();
            touching = true;
            updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
        }, {passive: false});
        
        zone.addEventListener('touchmove', e => {
            e.preventDefault();
            if (touching) {
                updateJoystick(e.touches[0].clientX, e.touches[0].clientY);
            }
        }, {passive: false});
        
        zone.addEventListener('touchend', () => {
            touching = false;
            stick.style.transform = 'translate(-50%, -50%)';
            this.vector.x = 0;
            this.vector.y = 0;
        });
        
        zone.addEventListener('mousedown', e => {
            touching = true;
            updateJoystick(e.clientX, e.clientY);
        });
        
        document.addEventListener('mousemove', e => {
            if (touching) updateJoystick(e.clientX, e.clientY);
        });
        
        document.addEventListener('mouseup', () => {
            touching = false;
            stick.style.transform = 'translate(-50%, -50%)';
            this.vector.x = 0;
            this.vector.y = 0;
        });
    },
    
    createActionButton() {
        if (this.actionBtn) return;
        
        const btn = document.createElement('div');
        btn.id = 'action-btn';
        btn.textContent = 'ДЕЙСТВИЕ';
        btn.style.cssText = 'position: fixed; bottom: 50px; right: 30px; width: 70px; height: 70px; border-radius: 50%; background: rgba(255,50,50,0.8); border: 2px solid rgba(255,255,255,0.5); color: #fff; font-size: 11px; font-weight: bold; display: flex; align-items: center; justify-content: center; z-index: 100; text-align: center; padding: 5px;';
        
        btn.addEventListener('touchstart', e => {
            e.preventDefault();
            this.actionPressed = true;
            btn.style.background = 'rgba(255,50,50,1)';
        }, {passive: false});
        
        btn.addEventListener('touchend', e => {
            e.preventDefault();
            this.actionPressed = false;
            btn.style.background = 'rgba(255,50,50,0.8)';
        });
        
        btn.addEventListener('mousedown', () => {
            this.actionPressed = true;
            btn.style.background = 'rgba(255,50,50,1)';
        });
        
        btn.addEventListener('mouseup', () => {
            this.actionPressed = false;
            btn.style.background = 'rgba(255,50,50,0.8)';
        });
        
        document.body.appendChild(btn);
        this.actionBtn = btn;
    },
    
    getVector() {
        return this.vector;
    },
    
    isActionPressed() {
        return this.actionPressed;
    }
};
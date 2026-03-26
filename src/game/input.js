const Input = {
    joystick: null,
    joystickBase: null,
    joystickStick: null,
    joystickZone: null,
    actionButton: null,
    isActionPressed: false,
    vector: { x: 0, y: 0 },
    angle: 0,
    active: false,
    gameScene: null,
    
    init(gameScene) {
        this.gameScene = gameScene;
        this.createJoystick();
        this.createActionButton();
    },
    
    createJoystick() {
        this.joystickZone = document.createElement('div');
        this.joystickZone.className = 'joystick-zone';
        this.joystickZone.style.cssText = 'position: fixed; bottom: 30px; left: 30px; width: 100px; height: 100px; z-index: 200;';
        
        this.joystickBase = document.createElement('div');
        this.joystickBase.className = 'joystick-base';
        this.joystickBase.style.cssText = 'width: 100%; height: 100%; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; position: relative;';
        
        this.joystickStick = document.createElement('div');
        this.joystickStick.className = 'joystick-stick';
        this.joystickStick.style.cssText = 'width: 40px; height: 40px; background: rgba(255,50,50,0.8); border-radius: 50%; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);';
        
        this.joystickBase.appendChild(this.joystickStick);
        this.joystickZone.appendChild(this.joystickBase);
        document.body.appendChild(this.joystickZone);
        
        this.setupJoystickEvents();
    },
    
    createActionButton() {
        this.actionButton = document.createElement('div');
        this.actionButton.className = 'action-btn';
        this.actionButton.textContent = 'ДЕЙСТВИЕ';
        this.actionButton.style.cssText = 'position: fixed; bottom: 50px; right: 30px; width: 70px; height: 70px; border-radius: 50%; background: rgba(255,50,50,0.8); border: 2px solid rgba(255,255,255,0.5); color: #fff; font-size: 12px; font-weight: bold; display: flex; align-items: center; justify-content: center; z-index: 200;';
        
        document.body.appendChild(this.actionButton);
        
        this.actionButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isActionPressed = true;
            this.actionButton.style.background = 'rgba(255,50,50,1)';
        });
        
        this.actionButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isActionPressed = false;
            this.actionButton.style.background = 'rgba(255,50,50,0.8)';
        });
    },
    
    setupJoystickEvents() {
        let startX, startY, centerX, centerY;
        const maxDistance = 40;
        
        const handleStart = (e) => {
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            const rect = this.joystickBase.getBoundingClientRect();
            
            centerX = rect.left + rect.width / 2;
            centerY = rect.top + rect.height / 2;
            
            startX = touch.clientX;
            startY = touch.clientY;
            
            this.active = true;
        };
        
        const handleMove = (e) => {
            if (!this.active) return;
            e.preventDefault();
            
            const touch = e.touches ? e.touches[0] : e;
            let deltaX = touch.clientX - startX;
            let deltaY = touch.clientY - startY;
            
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            if (distance > maxDistance) {
                const ratio = maxDistance / distance;
                deltaX *= ratio;
                deltaY *= ratio;
            }
            
            this.joystickStick.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
            
            this.vector.x = deltaX / maxDistance;
            this.vector.y = deltaY / maxDistance;
            this.angle = Math.atan2(deltaY, deltaX);
        };
        
        const handleEnd = () => {
            this.active = false;
            this.vector.x = 0;
            this.vector.y = 0;
            this.joystickStick.style.transform = 'translate(-50%, -50%)';
        };
        
        this.joystickZone.addEventListener('touchstart', handleStart, { passive: false });
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd);
        
        this.joystickZone.addEventListener('mousedown', handleStart);
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
    },
    
    getJoystickVector() {
        return { x: this.vector.x, y: this.vector.y, angle: this.angle };
    },
    
    isActionPressed() {
        return this.isActionPressed;
    },
    
    destroy() {
        if (this.joystickZone) {
            this.joystickZone.remove();
        }
        if (this.actionButton) {
            this.actionButton.remove();
        }
        this.joystickZone = null;
        this.actionButton = null;
    }
};
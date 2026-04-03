// ═══════ INPUT CONTROLS ═══════

function createControls() {
    var joy = document.createElement('div');
    joy.id = 'joystick-zone';
    joy.style.cssText = 'position:fixed;bottom:20px;left:20px;width:130px;height:130px;z-index:99999;touch-action:none;';
    joy.innerHTML = '<div id="joy-base" style="width:100%;height:100%;background:rgba(255,255,255,0.1);border:3px solid rgba(255,255,255,0.25);border-radius:50%;position:relative;"><div id="joy-knob" style="width:50px;height:50px;background:rgba(220,50,50,0.85);border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);box-shadow:0 0 12px rgba(220,50,50,0.4);"></div></div>';
    document.body.appendChild(joy);

    var ab = document.createElement('div');
    ab.id = 'action-btn';
    ab.textContent = '\u26a1';
    ab.style.cssText = 'position:fixed;bottom:30px;right:20px;width:88px;height:88px;border-radius:50%;background:linear-gradient(135deg,#ff6600,#cc2200);border:3px solid rgba(255,255,255,0.35);color:#fff;font-size:32px;font-weight:bold;display:flex;align-items:center;justify-content:center;z-index:99999;touch-action:none;box-shadow:0 0 18px rgba(255,80,0,0.5);transition:transform 0.1s;';
    document.body.appendChild(ab);

    var pb = document.createElement('div');
    pb.id = 'pallet-btn';
    pb.textContent = '\ud83e\udeb5';
    pb.style.cssText = 'position:fixed;bottom:130px;right:35px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#8B4513,#654321);border:2px solid rgba(255,255,255,0.25);color:#fff;font-size:24px;display:none;align-items:center;justify-content:center;z-index:99999;touch-action:none;box-shadow:0 0 14px rgba(139,69,19,0.5);transition:transform 0.1s;';
    document.body.appendChild(pb);

    var joyBase = document.getElementById('joy-base');
    var joyKnob = document.getElementById('joy-knob');

    function handleJoy(e) {
        e.preventDefault();
        var touch = e.touches ? e.touches[0] : e;
        var rect = joyBase.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = touch.clientX - cx;
        var dy = touch.clientY - cy;
        var len = Math.sqrt(dx * dx + dy * dy);
        var maxR = rect.width / 2 - 25;
        if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; len = maxR; }
        joyKnob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
        inputVec.x = dx / maxR;
        inputVec.y = dy / maxR;
    }

    function resetJoy() {
        joyKnob.style.transform = 'translate(-50%, -50%)';
        inputVec.x = 0;
        inputVec.y = 0;
    }

    joy.addEventListener('touchstart', handleJoy, { passive: false });
    joy.addEventListener('touchmove', handleJoy, { passive: false });
    joy.addEventListener('touchend', resetJoy);
    joy.addEventListener('touchcancel', resetJoy);
    joy.addEventListener('mousedown', handleJoy);
    joy.addEventListener('mousemove', function(e) { if (e.buttons) handleJoy(e); });
    joy.addEventListener('mouseup', resetJoy);

    ab.addEventListener('touchstart', function(e) {
        e.preventDefault();
        actionPressed = true;
        ab.style.transform = 'scale(0.92)';
    }, { passive: false });
    ab.addEventListener('touchend', function(e) {
        e.preventDefault();
        actionPressed = false;
        ab.style.transform = 'scale(1)';
    });
    ab.addEventListener('touchcancel', function() {
        actionPressed = false;
        ab.style.transform = 'scale(1)';
    });
    ab.addEventListener('mousedown', function() {
        actionPressed = true;
        ab.style.transform = 'scale(0.92)';
    });
    ab.addEventListener('mouseup', function() {
        actionPressed = false;
        ab.style.transform = 'scale(1)';
    });

    pb.addEventListener('touchstart', function(e) {
        palletPressed = true;
        pb.style.transform = 'scale(0.9)';
    }, { passive: true });
    pb.addEventListener('touchend', function() {
        palletPressed = false;
        pb.style.transform = 'scale(1)';
    });
    pb.addEventListener('touchcancel', function() {
        palletPressed = false;
        pb.style.transform = 'scale(1)';
    });
    pb.addEventListener('pointerdown', function() {
        palletPressed = true;
        pb.style.transform = 'scale(0.9)';
    });
    pb.addEventListener('pointerup', function() {
        palletPressed = false;
        pb.style.transform = 'scale(1)';
    });

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
}

function onKey(e) {
    keys[e.code] = (e.type === 'keydown');
    inputVec.x = ((keys.ArrowRight || keys.KeyD) ? 1 : 0) - ((keys.ArrowLeft || keys.KeyA) ? 1 : 0);
    inputVec.y = ((keys.ArrowDown || keys.KeyS) ? 1 : 0) - ((keys.ArrowUp || keys.KeyW) ? 1 : 0);
    var len = Math.sqrt(inputVec.x * inputVec.x + inputVec.y * inputVec.y);
    if (len > 1) {
        inputVec.x /= len;
        inputVec.y /= len;
    }
    if (e.code === 'Space' || e.code === 'KeyE') actionPressed = (e.type === 'keydown');
    if (e.code === 'KeyQ') palletPressed = (e.type === 'keydown');
}

function removeControls() {
    var j = document.getElementById('joystick-zone');
    if (j) j.remove();
    var a = document.getElementById('action-btn');
    if (a) a.remove();
    var p = document.getElementById('pallet-btn');
    if (p) p.remove();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKey);
}

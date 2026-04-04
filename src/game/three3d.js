// ═══════ THREE.JS 3D MODEL ═══════
// State variables are defined in state.js

var killerModelRun = null;
var killerMixerRun = null;
var killerAnimationsRun = {};
var totalModels = 3;

function initThreeJS() {
    if (threeLoaded || threeError) return;
    if (typeof THREE === 'undefined') {
        console.warn('[3D] Three.js not loaded');
        threeError = true;
        return;
    }

    try {
        threeCanvas = document.createElement('canvas');
        var canvasSize = 110;
        var canvasHeight = 155;
        threeCanvas.width = canvasSize;
        threeCanvas.height = canvasHeight;
        document.body.appendChild(threeCanvas);
        threeCanvas.setAttribute('style', 'position:fixed!important;top:0!important;left:0!important;z-index:20!important;pointer-events:none!important;display:none!important;width:' + canvasSize + 'px!important;height:' + canvasHeight + 'px!important;');

        // Optimized renderer for mobile
        threeRenderer = new THREE.WebGLRenderer({
            canvas: threeCanvas,
            alpha: true,
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });
        threeRenderer.setSize(canvasSize, canvasHeight);
        threeRenderer.setPixelRatio(1); // Force 1x pixel ratio for performance
        threeRenderer.setClearColor(0x000000, 0);
        threeRenderer.outputEncoding = THREE.sRGBEncoding;
        // Disable expensive features
        threeRenderer.shadowMap.enabled = false;
        threeRenderer.toneMapping = THREE.NoToneMapping;

        threeScene = new THREE.Scene();

        // Camera - very close so model fills canvas completely, centered vertically
        threeCamera = new THREE.PerspectiveCamera(60, canvasSize / canvasHeight, 0.01, 50);
        threeCamera.position.set(0, 0.08, 0.15);
        threeCamera.lookAt(0, 0.05, 0);

        // Optimized lighting - fewer lights, no shadows
        threeScene.add(new THREE.AmbientLight(0xffffff, 1.5));
        var dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(2, 4, 2);
        threeScene.add(dirLight);
        // Removed hemisphere and rim lights for performance
        // threeScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
        // var rimLight = new THREE.PointLight(0xff3300, 0.5, 8);
        // rimLight.position.set(-1.5, 2, -1.5);
        // threeScene.add(rimLight);

        loadKillerModel('idle', 'src/models/killers/scare/ScareKiller_Idle.glb');
        loadKillerModel('walking', 'src/models/killers/scare/ScareKiller_Walking.glb');
        loadKillerModel('running', 'src/models/killers/scare/ScareKiller_Run.glb');

        threeLoaded = true;
        console.log('[3D] Three.js initialized');
    } catch (e) {
        console.error('[3D] Three.js init error:', e);
        threeError = true;
    }
}

function loadKillerModel(type, modelPath) {
    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
        console.warn('[3D] GLTFLoader not available');
        threeError = true;
        return;
    }

    var loader = new THREE.GLTFLoader();
    console.log('[3D] Loading ' + type + ' model from:', modelPath);

    loader.load(
        modelPath,
        function (gltf) {
            var model = gltf.scene;

            // Keep original materials (skinning works correctly)
            model.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
            });

            var box = new THREE.Box3().setFromObject(model);
            var size = box.getSize(new THREE.Vector3());
            var height = size.y || 1;

            var targetScale = 1.0;
            model.scale.set(targetScale, targetScale, targetScale);

            var center = box.getCenter(new THREE.Vector3());
            model.position.set(-center.x * targetScale, -center.y * targetScale, -center.z * targetScale);

            model.visible = false;
            threeScene.add(model);

            var mixer = null;
            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(model);
                console.log('[3D] Found', gltf.animations.length, 'animation(s) for', type);

                gltf.animations.forEach(function (clip, index) {
                    console.log('[3D] Animation', index, ':', clip.name, 'for', type, '- Duration:', clip.duration.toFixed(2) + 's');
                    var action = mixer.clipAction(clip);
                    
                    // Normalize animation speed - adjust timeScale based on duration
                    // Shorter animations get slowed down to match ~1 second cycle
                    if (clip.duration < 1.0 && type === 'running') {
                        action.timeScale = clip.duration; // Slow down short run animations
                    } else {
                        action.timeScale = 1.0;
                    }
                    
                    if (type === 'idle') {
                        killerAnimationsIdle[clip.name.toLowerCase()] = action;
                    } else if (type === 'running') {
                        killerAnimationsRun[clip.name.toLowerCase()] = action;
                    } else {
                        killerAnimationsWalking[clip.name.toLowerCase()] = action;
                    }
                });

                // Play first animation for this model
                var anims = type === 'idle' ? killerAnimationsIdle : (type === 'running' ? killerAnimationsRun : killerAnimationsWalking);
                var firstAnim = Object.values(anims)[0];
                if (firstAnim) {
                    firstAnim.play();
                    console.log('[3D] Playing first animation for', type);
                }
            } else {
                console.warn('[3D] No animations found in', type, 'model');
            }

            if (type === 'idle') {
                killerModelIdle = model;
                killerMixerIdle = mixer;
            } else if (type === 'running') {
                killerModelRun = model;
                killerMixerRun = mixer;
            } else {
                killerModelWalking = model;
                killerMixerWalking = mixer;
            }

            modelsLoaded++;
            if (modelsLoaded >= totalModels) {
                killerModel = killerModelIdle;
                killerModel.visible = true;

                if (player && player.sprite) {
                    player.sprite.setVisible(false);
                }
                if (threeCanvas) {
                    threeCanvas.style.display = 'block';
                }
                threeLoaded = true;
                console.log('[3D] Both models loaded');
            }
        },
        function (progress) {
            console.log('[3D] Loading ' + type + ':', Math.round(progress.loaded / progress.total * 100) + '%');
        },
        function (error) {
            console.error('[3D] Model load error (' + type + '):', error);
            threeError = true;
        }
    );
}

function updateKiller3DSprite(dt) {
    if (!threeCanvas || !threeRenderer || !threeLoaded) return;

    var killerSprite = null;
    if (isKiller && player && player.sprite) {
        killerSprite = player.sprite;
    } else if (!isMultiplayer && player && player.aiPlayers) {
        for (var i = 0; i < player.aiPlayers.length; i++) {
            if (player.aiPlayers[i].isAIKiller && player.aiPlayers[i].sprite) {
                killerSprite = player.aiPlayers[i].sprite;
                break;
            }
        }
    } else if (isMultiplayer) {
        for (var id in remotePlayers) {
            if (remotePlayers[id].role === 'killer' && remotePlayers[id].sprite) {
                killerSprite = remotePlayers[id].sprite;
                break;
            }
        }
    }

    if (!killerSprite) return;

    var cam = scene.cameras.main;
    if (!cam) return;

    var screenX = killerSprite.x - cam.scrollX;
    var screenY = killerSprite.y - cam.scrollY;

    var w = parseInt(threeCanvas.style.width) || 80;
    var h = parseInt(threeCanvas.style.height) || 120;

    threeCanvas.style.left = (screenX - w / 2) + 'px';
    threeCanvas.style.top = (screenY - h / 2) + 'px';
    threeCanvas.style.display = 'block';

    var moving = false;
    var joystickIntensity = 0;
    if (isKiller) {
        moving = (inputVec.x !== 0 || inputVec.y !== 0);
        joystickIntensity = Math.sqrt(inputVec.x * inputVec.x + inputVec.y * inputVec.y);
    } else if (killerSprite.body) {
        moving = Math.abs(killerSprite.body.velocity.x) > 5 || Math.abs(killerSprite.body.velocity.y) > 5;
        joystickIntensity = 1;
    }

    if (moving) {
        var targetAngle = Math.atan2(inputVec.x || 0, inputVec.y || 0);
        var diff = targetAngle - killerRotation;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        killerRotation += diff * 0.15;
    }

    if (killerModelIdle) killerModelIdle.rotation.y = killerRotation;
    if (killerModelWalking) killerModelWalking.rotation.y = killerRotation;
    if (killerModelRun) killerModelRun.rotation.y = killerRotation;

    // Determine target animation based on joystick intensity
    var targetState = 'idle';
    if (joystickIntensity > 0.8) targetState = 'run';
    else if (moving) targetState = 'walk';

    // Switch animations instantly (cross-fade between different models causes T-pose)
    if (targetState !== currentKillerState) {
        var prevState = currentKillerState;

        // Get target actions
        var targetActions = targetState === 'run' ? killerAnimationsRun : (targetState === 'walk' ? killerAnimationsWalking : killerAnimationsIdle);
        var currentActions = prevState === 'run' ? killerAnimationsRun : (prevState === 'walk' ? killerAnimationsWalking : killerAnimationsIdle);

        // Stop current animation
        var currentAction = currentActions[Object.keys(currentActions)[0]];
        if (currentAction) {
            currentAction.stop();
        }

        // Hide all models
        if (killerModelIdle) killerModelIdle.visible = false;
        if (killerModelWalking) killerModelWalking.visible = false;
        if (killerModelRun) killerModelRun.visible = false;

        // Show target model and play animation
        var targetAction = targetActions[Object.keys(targetActions)[0]];
        if (targetAction) {
            targetAction.reset();
            targetAction.play();

            if (targetState === 'run' && killerModelRun) {
                killerModelRun.visible = true;
                killerModel = killerModelRun;
            } else if (targetState === 'walk' && killerModelWalking) {
                killerModelWalking.visible = true;
                killerModel = killerModelWalking;
            } else if (targetState === 'idle' && killerModelIdle) {
                killerModelIdle.visible = true;
                killerModel = killerModelIdle;
            }
        }

        currentKillerState = targetState;
    }

    // Update active mixer
    if (currentKillerState === 'idle' && killerMixerIdle) {
        killerMixerIdle.update(dt / 1000);
    } else if (currentKillerState === 'walk' && killerMixerWalking) {
        killerMixerWalking.update(dt / 1000);
    } else if (currentKillerState === 'run' && killerMixerRun) {
        killerMixerRun.update(dt / 1000);
    }
    if (killerMixerIdle) killerMixerIdle.update(dt / 1000);
    if (killerMixerRun) killerMixerRun.update(dt / 1000);

    threeRenderer.render(threeScene, threeCamera);
}

function cleanupThreeJS() {
    if (killerModelIdle) { threeScene.remove(killerModelIdle); killerModelIdle = null; }
    if (killerModelWalking) { threeScene.remove(killerModelWalking); killerModelWalking = null; }
    if (killerModelRun) { threeScene.remove(killerModelRun); killerModelRun = null; }
    if (killerMixerIdle) { killerMixerIdle.stopAllAction(); killerMixerIdle = null; }
    if (killerMixerWalking) { killerMixerWalking.stopAllAction(); killerMixerWalking = null; }
    if (killerMixerRun) { killerMixerRun.stopAllAction(); killerMixerRun = null; }
    killerAnimationsIdle = {};
    killerAnimationsWalking = {};
    killerAnimationsRun = {};
    killerModel = null;
    killerRotation = 0;
    if (threeCanvas && threeCanvas.parentNode) {
        threeCanvas.parentNode.removeChild(threeCanvas);
    }
    threeRenderer = null;
    threeScene = null;
    threeCamera = null;
    threeCanvas = null;
    threeLoaded = false;
}

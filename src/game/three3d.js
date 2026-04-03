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

            // Optimize materials - replace PBR with simpler materials for mobile
            model.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                    // Replace complex PBR materials with simple Lambert
                    if (child.material) {
                        var oldMat = child.material;
                        var simpleMat = new THREE.MeshLambertMaterial({
                            color: oldMat.color || 0xffffff,
                            map: oldMat.map || null,
                            transparent: oldMat.transparent || false,
                            opacity: oldMat.opacity !== undefined ? oldMat.opacity : 1.0,
                            side: THREE.FrontSide,
                            skinning: true // CRITICAL: enables skeletal animation
                        });
                        child.material = simpleMat;
                        // Dispose old material to free memory
                        if (oldMat.map) oldMat.map.dispose();
                        oldMat.dispose();
                    }
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
                    console.log('[3D] Animation', index, ':', clip.name);
                    var action = mixer.clipAction(clip);
                    if (type === 'idle') {
                        killerAnimationsIdle[clip.name.toLowerCase()] = action;
                    } else {
                        killerAnimationsWalking[clip.name.toLowerCase()] = action;
                    }
                });

                var firstAnim = Object.values(type === 'idle' ? killerAnimationsIdle : killerAnimationsWalking)[0];
                if (firstAnim) {
                    firstAnim.play();
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

    // Cross-fade between animations
    var fadeTime = 0.15;

    if (targetState === 'run' && killerMixerRun) {
        if (currentKillerState !== 'run') {
            if (currentKillerState === 'walk' && killerMixerWalking) {
                var walkAction = killerAnimationsWalking[Object.keys(killerAnimationsWalking)[0]];
                var runAction = killerAnimationsRun[Object.keys(killerAnimationsRun)[0]];
                if (walkAction && runAction) {
                    walkAction.fadeOut(fadeTime);
                    runAction.reset().fadeIn(fadeTime).play();
                }
            } else if (currentKillerState === 'idle' && killerMixerIdle) {
                var idleAction = killerAnimationsIdle[Object.keys(killerAnimationsIdle)[0]];
                var runAction = killerAnimationsRun[Object.keys(killerAnimationsRun)[0]];
                if (idleAction && runAction) {
                    idleAction.fadeOut(fadeTime);
                    runAction.reset().fadeIn(fadeTime).play();
                }
            }
            currentKillerState = 'run';
        }
    } else if (targetState === 'walk' && killerMixerWalking) {
        if (currentKillerState !== 'walk') {
            if (currentKillerState === 'run' && killerMixerRun) {
                var runAction = killerAnimationsRun[Object.keys(killerAnimationsRun)[0]];
                var walkAction = killerAnimationsWalking[Object.keys(killerAnimationsWalking)[0]];
                if (runAction && walkAction) {
                    runAction.fadeOut(fadeTime);
                    walkAction.reset().fadeIn(fadeTime).play();
                }
            } else if (currentKillerState === 'idle' && killerMixerIdle) {
                var idleAction = killerAnimationsIdle[Object.keys(killerAnimationsIdle)[0]];
                var walkAction = killerAnimationsWalking[Object.keys(killerAnimationsWalking)[0]];
                if (idleAction && walkAction) {
                    idleAction.fadeOut(fadeTime);
                    walkAction.reset().fadeIn(fadeTime).play();
                }
            }
            currentKillerState = 'walk';
        }
    } else if (targetState === 'idle' && killerMixerIdle) {
        if (currentKillerState !== 'idle') {
            if (currentKillerState === 'walk' && killerMixerWalking) {
                var walkAction = killerAnimationsWalking[Object.keys(killerAnimationsWalking)[0]];
                var idleAction = killerAnimationsIdle[Object.keys(killerAnimationsIdle)[0]];
                if (walkAction && idleAction) {
                    walkAction.fadeOut(fadeTime);
                    idleAction.reset().fadeIn(fadeTime).play();
                }
            } else if (currentKillerState === 'run' && killerMixerRun) {
                var runAction = killerAnimationsRun[Object.keys(killerAnimationsRun)[0]];
                var idleAction = killerAnimationsIdle[Object.keys(killerAnimationsIdle)[0]];
                if (runAction && idleAction) {
                    runAction.fadeOut(fadeTime);
                    idleAction.reset().fadeIn(fadeTime).play();
                }
            }
            currentKillerState = 'idle';
        }
    }

    // Update all mixers
    if (killerMixerWalking) killerMixerWalking.update(dt / 1000);
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

// ═══════ THREE.JS 3D MODELS ═══════

var killerModelRun = null;
var killerMixerRun = null;
var killerAnimationsRun = {};
var survivorModelIdle = null;
var survivorMixerIdle = null;
var survivorAnimationsIdle = {};
var survivorModelRun = null;
var survivorMixerRun = null;
var survivorAnimationsRun = {};
var survivorModelCrawl = null;
var survivorMixerCrawl = null;
var survivorAnimationsCrawl = {};
var survivorCurrentState = 'idle';
var survivorCanvas = null;
var survivorRenderer = null;
var survivorScene = null;
var survivorCamera = null;
var survivorModel = null;
var survivorMixer = null;
var survivorRotation = 0;
var survivorLoaded = false;
var totalKillerModels = 3;
var totalSurvivorModels = 3;

function initThreeJS() {
    if (threeLoaded || threeError) return;
    if (typeof THREE === 'undefined') {
        console.warn('[3D] Three.js not loaded');
        threeError = true;
        return;
    }

    try {
        // Shared canvas for killer
        threeCanvas = document.createElement('canvas');
        var canvasSize = 110;
        var canvasHeight = 155;
        threeCanvas.width = canvasSize;
        threeCanvas.height = canvasHeight;
        document.body.appendChild(threeCanvas);
        threeCanvas.setAttribute('style', 'position:fixed!important;top:0!important;left:0!important;z-index:20!important;pointer-events:none!important;display:none!important;width:' + canvasSize + 'px!important;height:' + canvasHeight + 'px!important;');

        // Shared renderer
        threeRenderer = new THREE.WebGLRenderer({
            canvas: threeCanvas,
            alpha: true,
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });
        threeRenderer.setSize(canvasSize, canvasHeight);
        threeRenderer.setPixelRatio(1);
        threeRenderer.setClearColor(0x000000, 0);
        threeRenderer.outputEncoding = THREE.sRGBEncoding;
        threeRenderer.shadowMap.enabled = false;
        threeRenderer.toneMapping = THREE.NoToneMapping;

        threeScene = new THREE.Scene();

        threeCamera = new THREE.PerspectiveCamera(60, canvasSize / canvasHeight, 0.01, 50);
        threeCamera.position.set(0, 0.08, 0.15);
        threeCamera.lookAt(0, 0.05, 0);

        threeScene.add(new THREE.AmbientLight(0xffffff, 1.5));
        var dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        dirLight.position.set(2, 4, 2);
        threeScene.add(dirLight);

        // Load models
        loadKillerModel('idle', 'src/models/killers/scare/ScareKiller_Idle.glb');
        loadKillerModel('walking', 'src/models/killers/scare/ScareKiller_Walking.glb');
        loadKillerModel('running', 'src/models/killers/scare/ScareKiller_Run.glb');
        loadSurvivorModel('idle', 'src/models/survivors/Jack/Jack_Idle.glb');
        loadSurvivorModel('run', 'src/models/survivors/Jack/Jack_Run.glb');
        loadSurvivorModel('crawl', 'src/models/survivors/Jack/Jack_Crawl.glb');

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
    console.log('[3D] Loading killer ' + type + ' from:', modelPath);

    loader.load(
        modelPath,
        function (gltf) {
            var model = gltf.scene;
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
                console.log('[3D] Killer', type, 'found', gltf.animations.length, 'animation(s)');
                gltf.animations.forEach(function (clip, index) {
                    console.log('[3D] Animation', index, ':', clip.name, '- Duration:', clip.duration.toFixed(2) + 's');
                    var action = mixer.clipAction(clip);
                    if (clip.duration < 1.0 && type === 'running') {
                        action.timeScale = clip.duration;
                    } else {
                        action.timeScale = 1.0;
                    }
                    if (type === 'idle') killerAnimationsIdle[clip.name.toLowerCase()] = action;
                    else if (type === 'running') killerAnimationsRun[clip.name.toLowerCase()] = action;
                    else killerAnimationsWalking[clip.name.toLowerCase()] = action;
                });
                var anims = type === 'idle' ? killerAnimationsIdle : (type === 'running' ? killerAnimationsRun : killerAnimationsWalking);
                var firstAnim = Object.values(anims)[0];
                if (firstAnim) { firstAnim.play(); console.log('[3D] Playing killer', type, 'animation'); }
            } else {
                console.warn('[3D] No animations found in killer', type);
            }

            if (type === 'idle') { killerModelIdle = model; killerMixerIdle = mixer; }
            else if (type === 'running') { killerModelRun = model; killerMixerRun = mixer; }
            else { killerModelWalking = model; killerMixerWalking = mixer; }

            modelsLoaded++;
            if (modelsLoaded >= totalKillerModels) {
                killerModel = killerModelIdle;
                killerModel.visible = true;
                if (player && player.sprite && isKiller) player.sprite.setVisible(false);
                if (threeCanvas) threeCanvas.style.display = 'block';
                console.log('[3D] All killer models loaded');
            }
        },
        function (progress) { console.log('[3D] Loading killer ' + type + ':', Math.round(progress.loaded / progress.total * 100) + '%'); },
        function (error) { console.error('[3D] Killer model load error (' + type + '):', error); threeError = true; }
    );
}

function loadSurvivorModel(type, modelPath) {
    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') return;

    var loader = new THREE.GLTFLoader();
    console.log('[3D] Loading survivor ' + type + ' from:', modelPath);

    loader.load(
        modelPath,
        function (gltf) {
            var model = gltf.scene;
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
                console.log('[3D] Survivor', type, 'found', gltf.animations.length, 'animation(s)');
                gltf.animations.forEach(function (clip, index) {
                    console.log('[3D] Survivor Animation', index, ':', clip.name, '- Duration:', clip.duration.toFixed(2) + 's');
                    var action = mixer.clipAction(clip);
                    action.timeScale = 1.0;
                    if (type === 'idle') survivorAnimationsIdle[clip.name.toLowerCase()] = action;
                    else if (type === 'run') survivorAnimationsRun[clip.name.toLowerCase()] = action;
                    else survivorAnimationsCrawl[clip.name.toLowerCase()] = action;
                });
                var anims = type === 'idle' ? survivorAnimationsIdle : (type === 'run' ? survivorAnimationsRun : survivorAnimationsCrawl);
                var firstAnim = Object.values(anims)[0];
                if (firstAnim) { firstAnim.play(); console.log('[3D] Playing survivor', type, 'animation'); }
            } else {
                console.warn('[3D] No animations found in survivor', type);
            }

            if (type === 'idle') { survivorModelIdle = model; survivorMixerIdle = mixer; }
            else if (type === 'run') { survivorModelRun = model; survivorMixerRun = mixer; }
            else { survivorModelCrawl = model; survivorMixerCrawl = mixer; }

            survivorModelsLoaded++;
            if (survivorModelsLoaded >= totalSurvivorModels) {
                survivorModel = survivorModelIdle;
                survivorLoaded = true;
                console.log('[3D] All survivor models loaded');
            }
        },
        function (progress) { console.log('[3D] Loading survivor ' + type + ':', Math.round(progress.loaded / progress.total * 100) + '%'); },
        function (error) { console.error('[3D] Survivor model load error (' + type + '):', error); }
    );
}

var survivorModelsLoaded = 0;

function updateSurvivor3DSprite(dt) {
    if (!threeCanvas || !threeRenderer || !threeLoaded) return;
    if (!player || !player.sprite || isKiller) return;
    if (!survivorLoaded) {
        if (!player.sprite.visible) player.sprite.setVisible(true);
        threeCanvas.style.display = 'none';
        return;
    }

    // Hide killer models
    if (killerModelIdle) killerModelIdle.visible = false;
    if (killerModelWalking) killerModelWalking.visible = false;
    if (killerModelRun) killerModelRun.visible = false;

    // Determine survivor state
    var targetState = 'idle';
    if (player.state === 'dying') {
        targetState = 'crawl';
    } else if (inputVec.x !== 0 || inputVec.y !== 0) {
        targetState = 'run';
    }

    // Switch models based on state
    if (targetState !== survivorCurrentState) {
        // Stop current animation
        if (survivorCurrentState === 'idle' && survivorMixerIdle) {
            var idleAction = Object.values(survivorAnimationsIdle)[0];
            if (idleAction) idleAction.stop();
        } else if (survivorCurrentState === 'run' && survivorMixerRun) {
            var runAction = Object.values(survivorAnimationsRun)[0];
            if (runAction) runAction.stop();
        } else if (survivorCurrentState === 'crawl' && survivorMixerCrawl) {
            var crawlAction = Object.values(survivorAnimationsCrawl)[0];
            if (crawlAction) crawlAction.stop();
        }

        // Hide all survivor models
        if (survivorModelIdle) survivorModelIdle.visible = false;
        if (survivorModelRun) survivorModelRun.visible = false;
        if (survivorModelCrawl) survivorModelCrawl.visible = false;

        // Show target model and play animation
        if (targetState === 'idle' && survivorModelIdle) {
            survivorModelIdle.visible = true;
            survivorModel = survivorModelIdle;
            var idleAction = Object.values(survivorAnimationsIdle)[0];
            if (idleAction) { idleAction.reset(); idleAction.play(); }
        } else if (targetState === 'run' && survivorModelRun) {
            survivorModelRun.visible = true;
            survivorModel = survivorModelRun;
            var runAction = Object.values(survivorAnimationsRun)[0];
            if (runAction) { runAction.reset(); runAction.play(); }
        } else if (targetState === 'crawl' && survivorModelCrawl) {
            survivorModelCrawl.visible = true;
            survivorModel = survivorModelCrawl;
            var crawlAction = Object.values(survivorAnimationsCrawl)[0];
            if (crawlAction) { crawlAction.reset(); crawlAction.play(); }
        }

        survivorCurrentState = targetState;
    }

    // Position canvas
    var cam = scene.cameras.main;
    if (!cam) return;

    var screenX = player.sprite.x - cam.scrollX;
    var screenY = player.sprite.y - cam.scrollY;

    var w = parseInt(threeCanvas.style.width) || 80;
    var h = parseInt(threeCanvas.style.height) || 120;

    threeCanvas.style.left = (screenX - w / 2) + 'px';
    threeCanvas.style.top = (screenY - h / 2) + 'px';
    threeCanvas.style.display = 'block';

    // Hide 2D sprite
    if (player.sprite.visible) player.sprite.setVisible(false);

    // Rotate model
    var moving = (inputVec.x !== 0 || inputVec.y !== 0);
    if (moving) {
        var targetAngle = Math.atan2(inputVec.x, inputVec.y);
        var diff = targetAngle - survivorRotation;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        survivorRotation += diff * 0.15;
    }

    if (survivorModel) survivorModel.rotation.y = survivorRotation;

    // Update active mixer
    if (survivorCurrentState === 'idle' && survivorMixerIdle) survivorMixerIdle.update(dt / 1000);
    else if (survivorCurrentState === 'run' && survivorMixerRun) survivorMixerRun.update(dt / 1000);
    else if (survivorCurrentState === 'crawl' && survivorMixerCrawl) survivorMixerCrawl.update(dt / 1000);

    threeRenderer.render(threeScene, threeCamera);
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

    var targetState = 'idle';
    if (joystickIntensity > 0.8) targetState = 'run';
    else if (moving) targetState = 'walk';

    if (targetState !== currentKillerState) {
        var prevState = currentKillerState;
        var targetActions = targetState === 'run' ? killerAnimationsRun : (targetState === 'walk' ? killerAnimationsWalking : killerAnimationsIdle);
        var currentActions = prevState === 'run' ? killerAnimationsRun : (prevState === 'walk' ? killerAnimationsWalking : killerAnimationsIdle);

        var currentAction = currentActions[Object.keys(currentActions)[0]];
        if (currentAction) currentAction.stop();

        if (killerModelIdle) killerModelIdle.visible = false;
        if (killerModelWalking) killerModelWalking.visible = false;
        if (killerModelRun) killerModelRun.visible = false;

        var targetAction = targetActions[Object.keys(targetActions)[0]];
        if (targetAction) {
            targetAction.reset();
            targetAction.play();
            if (targetState === 'run' && killerModelRun) { killerModelRun.visible = true; killerModel = killerModelRun; }
            else if (targetState === 'walk' && killerModelWalking) { killerModelWalking.visible = true; killerModel = killerModelWalking; }
            else if (targetState === 'idle' && killerModelIdle) { killerModelIdle.visible = true; killerModel = killerModelIdle; }
        }
        currentKillerState = targetState;
    }

    if (currentKillerState === 'idle' && killerMixerIdle) killerMixerIdle.update(dt / 1000);
    else if (currentKillerState === 'walk' && killerMixerWalking) killerMixerWalking.update(dt / 1000);
    else if (currentKillerState === 'run' && killerMixerRun) killerMixerRun.update(dt / 1000);

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

    if (survivorModelIdle) { threeScene.remove(survivorModelIdle); survivorModelIdle = null; }
    if (survivorModelRun) { threeScene.remove(survivorModelRun); survivorModelRun = null; }
    if (survivorModelCrawl) { threeScene.remove(survivorModelCrawl); survivorModelCrawl = null; }
    if (survivorMixerIdle) { survivorMixerIdle.stopAllAction(); survivorMixerIdle = null; }
    if (survivorMixerRun) { survivorMixerRun.stopAllAction(); survivorMixerRun = null; }
    if (survivorMixerCrawl) { survivorMixerCrawl.stopAllAction(); survivorMixerCrawl = null; }
    survivorAnimationsIdle = {};
    survivorAnimationsRun = {};
    survivorAnimationsCrawl = {};
    survivorModel = null;
    survivorRotation = 0;
    survivorCurrentState = 'idle';

    if (threeCanvas && threeCanvas.parentNode) threeCanvas.parentNode.removeChild(threeCanvas);

    threeRenderer = null;
    threeScene = null;
    threeCamera = null;
    threeCanvas = null;
    threeLoaded = false;
    survivorLoaded = false;
}

// ═══════ THREE.JS 3D MODELS ═══════

var killerModelRun = null;
var killerModelIdle = null;
var killerModelWalking = null;
var killerModel = null;
var killerMixerRun = null;
var killerMixerIdle = null;
var killerMixerWalking = null;
var killerAnimationsRun = {};
var killerAnimationsIdle = {};
var killerAnimationsWalking = {};
var modelsLoaded = 0;
var survivorModelsLoaded = 0;
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
var killerLoaded = false;
var currentKillerState = 'idle';
var currentKillerRotation = 0;
var totalKillerModels = 3;
var totalSurvivorModels = 3;
var currentKillerAnimation = null;
var currentSurvivorAnimation = null;
var survivorAnimationStates = {};

// Multiple 3D canvases - one for each character
var threeCanvases = {};
var threeRenderers = {};
var threeScenes = {};
var threeCameras = {};

function createThreeCanvas(id, isKiller) {
    var canvasSize = isKiller ? 110 : 80;
    var canvasHeight = isKiller ? 155 : 120;
    
    var canvas = document.createElement('canvas');
    canvas.width = canvasSize;
    canvas.height = canvasHeight;
    document.body.appendChild(canvas);
    canvas.setAttribute('style', 'position:fixed!important;top:0!important;left:0!important;z-index:20!important;pointer-events:none!important;display:none!important;width:' + canvasSize + 'px!important;height:' + canvasHeight + 'px!important;border:2px solid red!important;');
    
    var renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(canvasSize, canvasHeight);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.NoToneMapping;
    
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(60, canvasSize / canvasHeight, 0.01, 50);
    camera.position.set(0, 0.08, 0.15);
    camera.lookAt(0, 0.05, 0);
    
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    var dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(2, 4, 2);
    scene.add(dirLight);
    
    return { canvas: canvas, renderer: renderer, scene: scene, camera: camera };
}

function initThreeJS() {
    console.log('[3D] initThreeJS called, threeLoaded:', threeLoaded, 'threeError:', threeError);
    
    if (threeLoaded || threeError) {
        console.log('[3D] Already loaded or error, skipping');
        return;
    }
    if (typeof THREE === 'undefined') {
        console.warn('[3D] Three.js not loaded');
        threeError = true;
        return;
    }
    
    try {
        // Check if canvases already exist
        if (threeCanvases && Object.keys(threeCanvases).length > 0) {
            console.log('[3D] Canvases already exist, reusing');
            threeLoaded = true;
            return;
        }
        
        console.log('[3D] Creating canvases...');
        
        // Reset animation state
        survivorAnimationStates = {};
        currentKillerAnimation = null;
        
        // Create canvases: 1 killer, 3 survivors
        var killerCanvas = createThreeCanvas('killer', true);
        threeCanvases['killer'] = killerCanvas.canvas;
        threeRenderers['killer'] = killerCanvas.renderer;
        threeScenes['killer'] = killerCanvas.scene;
        threeCameras['killer'] = killerCanvas.camera;
        
        for (var i = 0; i < 3; i++) {
            var survivorCanvas = createThreeCanvas('survivor' + i, false);
            threeCanvases['survivor' + i] = survivorCanvas.canvas;
            threeRenderers['survivor' + i] = survivorCanvas.renderer;
            threeScenes['survivor' + i] = survivorCanvas.scene;
            threeCameras['survivor' + i] = survivorCanvas.camera;
        }
        
        console.log('[3D] Canvases created:', Object.keys(threeCanvases));
        
        // Keep original for compatibility
        threeCanvas = threeCanvases['killer'];
        threeRenderer = threeRenderers['killer'];
        threeScene = threeScenes['killer'];
        threeCamera = threeCameras['killer'];

        // Load models
        console.log('[3D] Loading models...');
        loadKillerModel('idle', 'src/models/killers/scare/ScareKiller_Idle.glb');
        loadKillerModel('walking', 'src/models/killers/scare/ScareKiller_Walking.glb');
        loadKillerModel('running', 'src/models/killers/scare/ScareKiller_Run.glb');
        loadSurvivorModel('idle', 'src/models/survivors/Jack/Jack_Idle.glb');
        loadSurvivorModel('run', 'src/models/survivors/Jack/Jack_Run.glb');
        loadSurvivorModel('crawl', 'src/models/survivors/Jack/Jack_Crawl.glb');

        threeLoaded = true;
        console.log('[3D] Three.js initialized, scenes:', Object.keys(threeScenes));
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
            
            // Add model to all scenes
            var modelRefs = {};
            for (var key in threeScenes) {
                if (threeScenes[key]) {
                    var clonedModel = model.clone();
                    clonedModel.visible = false;
                    threeScenes[key].add(clonedModel);
                    modelRefs[key] = clonedModel;
                }
            }
            
            // Add original model to killer scene for animations
            threeScenes['killer'].add(model);
            modelRefs['killer'] = model;
            
            var mixer = null;
            if (gltf.animations && gltf.animations.length > 0) {
                console.log('[3D] Killer', type, 'found', gltf.animations.length, 'animation(s):', gltf.animations.map(function(c) { return c.name; }));
                
                // Create mixer for this model
                var killerModel = modelRefs['killer'];
                
                if (killerModel) {
                    var killerMixer = new THREE.AnimationMixer(killerModel);
                    mixer = killerMixer;
                    
                    // Store by type
                    if (!window.killerCanvasMixers) window.killerCanvasMixers = {};
                    window.killerCanvasMixers[type] = killerMixer;
                    
                    gltf.animations.forEach(function (clip, index) {
                        console.log('[3D] Killer', type, 'clip:', clip.name);
                        var action = killerMixer.clipAction(clip);
                        action.play();
                    });
                    
                    console.log('[3D] Killer mixer created for', type);
                }
            } else {
                console.warn('[3D] No animations found in killer', type);
            }

            // Store references
            if (type === 'idle') { 
                window.killerModelIdleRefs = modelRefs;
                killerModelIdle = modelRefs; 
                killerMixerIdle = mixer; 
            }
            else if (type === 'running') { 
                window.killerModelRunRefs = modelRefs;
                killerModelRun = modelRefs; 
                killerMixerRun = mixer; 
            }
            else { 
                window.killerModelWalkingRefs = modelRefs;
                killerModelWalking = modelRefs; 
                killerMixerWalking = mixer; 
            }
            
            console.log('[3D] Killer model loaded:', type, 'modelRefs keys:', Object.keys(modelRefs));

            modelsLoaded++;
            if (modelsLoaded >= totalKillerModels) {
                killerLoaded = true;
                window.killerLoaded = true;
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
    
    // Показываем загрузку
    var debugEl = document.getElementById('debug-info');
    if (debugEl) debugEl.textContent = 'Загрузка модели выжившего: ' + type;

    loader.load(
        modelPath,
        function (gltf) {
            console.log('[3D] Survivor', type, 'loaded, scenes:', Object.keys(threeScenes));
            
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
            var targetScale = 0.6;
            
            model.scale.set(targetScale, targetScale, targetScale);
            var center = box.getCenter(new THREE.Vector3());
            model.position.set(-center.x * targetScale, -center.y * targetScale, -center.z * targetScale);
            model.visible = false;
            
            // Add model to all scenes
            var modelRefs = {};
            for (var key in threeScenes) {
                if (threeScenes[key]) {
                    var clonedModel = model.clone();
                    clonedModel.visible = false;
                    threeScenes[key].add(clonedModel);
                    modelRefs[key] = clonedModel;
                }
            }
            
            // Add original model to survivor0 scene for animations
            if (threeScenes['survivor0']) {
                threeScenes['survivor0'].add(model);
                modelRefs['survivor0'] = model;
            }
            
            var mixer = null;
            var canvasMixers = {};
            if (gltf.animations && gltf.animations.length > 0) {
                console.log('[3D] Survivor', type, 'animations:', gltf.animations.map(function(c) { return c.name; }));
                
                var timeScale = 1.0;
                
                for (var key in threeScenes) {
                    if (threeScenes[key] && modelRefs[key]) {
                        var canvasMixer = new THREE.AnimationMixer(modelRefs[key]);
                        canvasMixers[key] = canvasMixer;
                        gltf.animations.forEach(function (clip, index) {
                            var action = canvasMixer.clipAction(clip);
                            action.timeScale = timeScale;
                            action.play();
                        });
                    }
                }
                mixer = canvasMixers['survivor0'] || Object.values(canvasMixers)[0];
                window.survivorCanvasMixers = canvasMixers;
                if (!window.survivorAnimationsByType) window.survivorAnimationsByType = {};
                window.survivorAnimationsByType[type] = gltf.animations;
            } else {
                console.warn('[3D] No animations found in survivor', type);
            }
            
            // Store references
            if (type === 'idle') { 
                window.survivorModelIdleRefs = modelRefs;
                survivorModelIdle = modelRefs; 
                survivorMixerIdle = mixer; 
            }
            else if (type === 'run') { 
                window.survivorModelRunRefs = modelRefs;
                survivorModelRun = modelRefs; 
                survivorMixerRun = mixer; 
            }
            else { 
                window.survivorModelCrawlRefs = modelRefs;
                survivorModelCrawl = modelRefs; 
                survivorMixerCrawl = mixer; 
            }
            
            console.log('[3D] Survivor model loaded:', type, 'modelRefs keys:', Object.keys(modelRefs), 'mixer:', mixer);

            survivorModelsLoaded++;
            if (survivorModelsLoaded >= totalSurvivorModels) {
                survivorModel = survivorModelIdle;
                survivorLoaded = true;
                window.survivorLoaded = true;
                if (survivorModelIdle && survivorModelIdle['survivor0']) survivorModelIdle['survivor0'].visible = true;
                console.log('[3D] All survivor models loaded');
                var debugEl = document.getElementById('debug-info');
                if (debugEl) debugEl.textContent = 'ВСЕ МОДЕЛИ ЗАГРУЖЕНЫ!';
            }
        },
        function (progress) { console.log('[3D] Loading survivor ' + type + ':', Math.round(progress.loaded / progress.total * 100) + '%'); },
        function (error) { console.error('[3D] Survivor model load error (' + type + '):', error); }
    );
}

function updateSurvivor3DSprite(dt) {
    if (!threeLoaded || !threeCanvases || !threeRenderers) return;
    if (!window.scene || !window.scene.cameras) return;
    
    var cam = window.scene.cameras.main;
    if (!cam) return;

    if (player && player.sprite) {
        player.sprite.setVisible(false);
        if (player.glowFx) player.glowFx.setVisible(false);
    }
    
    if (player && player.aiPlayers) {
        player.aiPlayers.forEach(function(ai) {
            if (ai && ai.sprite && !ai.isAIKiller) {
                ai.sprite.setVisible(false);
                if (ai.glowFx) ai.glowFx.setVisible(false);
            }
        });
    }

    if (!isKiller && player && player.sprite && player.state !== 'dead' && player.state !== 'hooked' && player.state !== 'carried') {
        var screenX = player.sprite.x - cam.scrollX;
        var screenY = player.sprite.y - cam.scrollY;
        
        if (screenX > -50 && screenX < window.innerWidth + 50 && screenY > -50 && screenY < window.innerHeight + 50) {
            var canvas = threeCanvases['survivor0'];
            canvas.style.display = 'block';
            canvas.style.position = 'fixed';
            canvas.style.left = (screenX - 40) + 'px';
            canvas.style.top = (screenY - 60) + 'px';
            canvas.style.zIndex = '1000';
            canvas.style.pointerEvents = 'none';
            
            var moving = player.sprite.body && (Math.abs(player.sprite.body.velocity.x) > 5 || Math.abs(player.sprite.body.velocity.y) > 5);
            
            var scene = threeScenes['survivor0'];
            
            // Get player speed
            var speed = 0;
            if (player && player.sprite && player.sprite.body) {
                speed = Math.sqrt(player.sprite.body.velocity.x * player.sprite.body.velocity.x + player.sprite.body.velocity.y * player.sprite.body.velocity.y);
            }
            
            // Determine state
            var state = 'idle';
            if (speed > 120) state = 'run';
            else if (speed > 5) state = 'walk';
            
            // Always hide all first
            if (survivorModelIdle && survivorModelIdle['survivor0']) {
                survivorModelIdle['survivor0'].visible = false;
            }
            if (survivorModelRun && survivorModelRun['survivor0']) {
                survivorModelRun['survivor0'].visible = false;
            }
            
            // Show correct model
            var currentModel = null;
            if (state === 'run' && survivorModelRun && survivorModelRun['survivor0']) {
                currentModel = survivorModelRun['survivor0'];
            } else if (survivorModelIdle && survivorModelIdle['survivor0']) {
                currentModel = survivorModelIdle['survivor0'];
            }
            
            if (currentModel) {
                currentModel.visible = true;
                
                // Update rotation
                if (state !== 'idle' && player && player.sprite && player.sprite.body) {
                    var angle = Math.atan2(player.sprite.body.velocity.y, player.sprite.body.velocity.x);
                    currentModel.rotation.y = angle;
                }
            }
            
            threeRenderers['survivor0'].render(scene, threeCameras['survivor0']);
            
            // Update survivor mixer
            if (window.survivorCanvasMixers) {
                var mixerType = state === 'run' ? 'run' : 'idle';
                if (window.survivorCanvasMixers[mixerType]) {
                    window.survivorCanvasMixers[mixerType].update(dt);
                }
            }
        } else {
            threeCanvases['survivor0'].style.display = 'none';
        }
    }

    if (!isKiller && !isMultiplayer && player && player.aiPlayers) {
        var aiKiller = null;
        for (var i = 0; i < player.aiPlayers.length; i++) {
            if (player.aiPlayers[i].isAIKiller && player.aiPlayers[i].sprite) {
                aiKiller = player.aiPlayers[i];
                break;
            }
        }
        
        if (aiKiller && aiKiller.sprite) {
            aiKiller.sprite.setVisible(false);
            if (aiKiller.glowFx) aiKiller.glowFx.setVisible(false);
            
            var screenX = aiKiller.sprite.x - cam.scrollX;
            var screenY = aiKiller.sprite.y - cam.scrollY;
            
            if (screenX > -50 && screenX < window.innerWidth + 50 && screenY > -50 && screenY < window.innerHeight + 50) {
                var canvas = threeCanvases['killer'];
                canvas.style.display = 'block';
                canvas.style.position = 'fixed';
                canvas.style.left = (screenX - 55) + 'px';
                canvas.style.top = (screenY - 77) + 'px';
                canvas.style.zIndex = '1000';
                canvas.style.pointerEvents = 'none';
                
                var moving = aiKiller.sprite.body && (Math.abs(aiKiller.sprite.body.velocity.x) > 5 || Math.abs(aiKiller.sprite.body.velocity.y) > 5);
                
                var scene = threeScenes['killer'];
                
                if (killerModelIdle) {
                    var refs = killerModelIdle;
                    for (var k in refs) { if (refs[k]) refs[k].visible = false; }
                }
                if (killerModelRun) {
                    var refs = killerModelRun;
                    for (var k in refs) { if (refs[k]) refs[k].visible = false; }
                }
                if (killerModelWalking) {
                    var refs = killerModelWalking;
                    for (var k in refs) { if (refs[k]) refs[k].visible = false; }
                }
                
                var modelRefs = moving ? killerModelRun : killerModelIdle;
                if (modelRefs && modelRefs['killer']) {
                    modelRefs['killer'].visible = true;
                    
                    if (moving && aiKiller.sprite.body) {
                        var angle = Math.atan2(aiKiller.sprite.body.velocity.y, aiKiller.sprite.body.velocity.x);
                        modelRefs['killer'].rotation.y = angle + Math.PI;
                    }
                }
                
                threeRenderers['killer'].render(threeScenes['killer'], threeCameras['killer']);
                
                if (window.killerCanvasMixers) {
                    for (var mixKey in window.killerCanvasMixers) {
                        if (window.killerCanvasMixers[mixKey]) {
                            window.killerCanvasMixers[mixKey].update(dt);
                        }
                    }
                }
            } else {
                threeCanvases['killer'].style.display = 'none';
            }
        }
    }
}

function updateKiller3DSprite(dt) {
    if (!threeLoaded || !threeCanvases || !threeRenderers) return;
    
    if (!window.scene || !window.scene.cameras) return;
    
    var cam = window.scene.cameras.main;
    if (!cam) return;

    if (player && player.sprite) {
        player.sprite.setVisible(false);
        if (player.glowFx) player.glowFx.setVisible(false);
    }
    
    if (isKiller && player && player.aiPlayers) {
        player.aiPlayers.forEach(function(ai) {
            if (ai && ai.sprite && !ai.isAIKiller) {
                ai.sprite.setVisible(false);
                if (ai.glowFx) ai.glowFx.setVisible(false);
            }
        });
    }

    if (isKiller && player && player.sprite) {
        var screenX = player.sprite.x - cam.scrollX;
        var screenY = player.sprite.y - cam.scrollY;
        
        if (screenX > -50 && screenX < window.innerWidth + 50 && screenY > -50 && screenY < window.innerHeight + 50) {
            var canvas = threeCanvases['killer'];
            canvas.style.display = 'block';
            canvas.style.position = 'fixed';
            var w = 110;
            var h = 155;
            canvas.style.left = (screenX - w / 2) + 'px';
            canvas.style.top = (screenY - h / 2) + 'px';
            canvas.style.zIndex = '1000';
            canvas.style.pointerEvents = 'none';
            
            var scene = threeScenes['killer'];
            
            // Just show idle model always - simple
            if (killerModelIdle && killerModelIdle['killer']) {
                killerModelIdle['killer'].visible = true;
                
                // Update rotation
                if (player && player.sprite && player.sprite.body) {
                    var angle = Math.atan2(player.sprite.body.velocity.y, player.sprite.body.velocity.x);
                    killerModelIdle['killer'].rotation.y = angle;
                }
            }

            threeRenderers['killer'].render(scene, threeCameras['killer']);
            
            // Update idle mixer
            if (window.killerCanvasMixers && window.killerCanvasMixers['idle']) {
                window.killerCanvasMixers['idle'].update(dt);
            }
        } else {
            threeCanvases['killer'].style.display = 'none';
        }
    }

    if (isKiller && !isMultiplayer && player && player.aiPlayers && survivorLoaded) {
        var survivorIndex = 0;
        
        player.aiPlayers.forEach(function(ai) {
            if (ai && ai.sprite && !ai.isAIKiller && ai.state !== 'dead' && ai.state !== 'hooked' && ai.state !== 'carried') {
                var canvasKey = 'survivor' + survivorIndex;
                if (!threeCanvases[canvasKey]) return;
                
                if (ai.sprite.visible) ai.sprite.setVisible(false);
                
                var screenX = ai.sprite.x - cam.scrollX;
                var screenY = ai.sprite.y - cam.scrollY;
                
                if (screenX > -50 && screenX < window.innerWidth + 50 && screenY > -50 && screenY < window.innerHeight + 50) {
                    var canvas = threeCanvases[canvasKey];
                    canvas.style.left = (screenX - 40) + 'px';
                    canvas.style.top = (screenY - 60) + 'px';
                    canvas.style.display = 'block';
                    
                    var moving = ai.sprite.body && (Math.abs(ai.sprite.body.velocity.x) > 5 || Math.abs(ai.sprite.body.velocity.y) > 5);
                    
                    var scene = threeScenes[canvasKey];
                    
                    // Simple: just show idle model
                    if (survivorModelIdle && survivorModelIdle[canvasKey]) {
                        survivorModelIdle[canvasKey].visible = true;
                        if (moving && ai.sprite.body) {
                            var angle = Math.atan2(ai.sprite.body.velocity.y, ai.sprite.body.velocity.x);
                            survivorModelIdle[canvasKey].rotation.y = angle;
                        }
                    }
                    
                    threeRenderers[canvasKey].render(scene, threeCameras[canvasKey]);
                } else {
                    threeCanvases[canvasKey].style.display = 'none';
                }
                
                survivorIndex++;
            }
        });
    }
    
    if (!isKiller && !isMultiplayer && player && player.aiPlayers) {
        var aiKiller = null;
        for (var i = 0; i < player.aiPlayers.length; i++) {
            if (player.aiPlayers[i].isAIKiller && player.aiPlayers[i].sprite) {
                aiKiller = player.aiPlayers[i];
                break;
            }
        }
        
        if (aiKiller && aiKiller.sprite) {
            aiKiller.sprite.setVisible(false);
            if (aiKiller.glowFx) aiKiller.glowFx.setVisible(false);
            
            var screenX = aiKiller.sprite.x - cam.scrollX;
            var screenY = aiKiller.sprite.y - cam.scrollY;
            
            if (screenX > -50 && screenX < window.innerWidth + 50 && screenY > -50 && screenY < window.innerHeight + 50) {
                var canvas = threeCanvases['killer'];
                canvas.style.display = 'block';
                canvas.style.position = 'fixed';
                canvas.style.left = (screenX - 55) + 'px';
                canvas.style.top = (screenY - 77) + 'px';
                canvas.style.zIndex = '1000';
                canvas.style.pointerEvents = 'none';
                
                var moving = aiKiller.sprite.body && (Math.abs(aiKiller.sprite.body.velocity.x) > 5 || Math.abs(aiKiller.sprite.body.velocity.y) > 5);
                
                var scene = threeScenes['killer'];
                
                if (killerModelIdle) {
                    var refs = killerModelIdle;
                    for (var k in refs) { if (refs[k]) refs[k].visible = false; }
                }
                if (killerModelRun) {
                    var refs = killerModelRun;
                    for (var k in refs) { if (refs[k]) refs[k].visible = false; }
                }
                if (killerModelWalking) {
                    var refs = killerModelWalking;
                    for (var k in refs) { if (refs[k]) refs[k].visible = false; }
                }
                
                var modelRefs = moving ? killerModelRun : killerModelIdle;
                if (modelRefs && modelRefs['killer']) {
                    modelRefs['killer'].visible = true;
                    
                    if (moving && aiKiller.sprite.body) {
                        var angle = Math.atan2(aiKiller.sprite.body.velocity.y, aiKiller.sprite.body.velocity.x);
                        modelRefs['killer'].rotation.y = angle + Math.PI;
                    }
                }
                
                threeRenderers['killer'].render(threeScenes['killer'], threeCameras['killer']);
                
                if (window.killerCanvasMixers) {
                    for (var mixKey in window.killerCanvasMixers) {
                        if (window.killerCanvasMixers[mixKey]) {
                            window.killerCanvasMixers[mixKey].update(dt);
                        }
                    }
                }
            } else {
                threeCanvases['killer'].style.display = 'none';
            }
        }
    }
}

function cleanupThreeJS() {
    // Remove all models from all scenes
    if (killerModelIdle) {
        Object.values(threeScenes).forEach(function(scene) { scene.remove(killerModelIdle); });
        killerModelIdle = null;
    }
    if (killerModelWalking) {
        Object.values(threeScenes).forEach(function(scene) { scene.remove(killerModelWalking); });
        killerModelWalking = null;
    }
    if (killerModelRun) {
        Object.values(threeScenes).forEach(function(scene) { scene.remove(killerModelRun); });
        killerModelRun = null;
    }
    if (killerMixerIdle) { killerMixerIdle.stopAllAction(); killerMixerIdle = null; }
    if (killerMixerWalking) { killerMixerWalking.stopAllAction(); killerMixerWalking = null; }
    if (killerMixerRun) { killerMixerRun.stopAllAction(); killerMixerRun = null; }
    killerAnimationsIdle = {};
    killerAnimationsWalking = {};
    killerAnimationsRun = {};
    killerModel = null;
    killerRotation = 0;

    if (survivorModelIdle) {
        Object.values(threeScenes).forEach(function(scene) { scene.remove(survivorModelIdle); });
        survivorModelIdle = null;
    }
    if (survivorModelRun) {
        Object.values(threeScenes).forEach(function(scene) { scene.remove(survivorModelRun); });
        survivorModelRun = null;
    }
    if (survivorModelCrawl) {
        Object.values(threeScenes).forEach(function(scene) { scene.remove(survivorModelCrawl); });
        survivorModelCrawl = null;
    }
    if (survivorMixerIdle) { survivorMixerIdle.stopAllAction(); survivorMixerIdle = null; }
    if (survivorMixerRun) { survivorMixerRun.stopAllAction(); survivorMixerRun = null; }
    if (survivorMixerCrawl) { survivorMixerCrawl.stopAllAction(); survivorMixerCrawl = null; }
    survivorAnimationsIdle = {};
    survivorAnimationsRun = {};
    survivorAnimationsCrawl = {};
    survivorModel = null;
    survivorRotation = 0;
    survivorCurrentState = 'idle';
    
    window.killerCanvasMixers = null;
    window.killerAnimationsByType = null;
    window.survivorCanvasMixers = null;
    window.survivorAnimationsByType = null;

    // Clean up all canvases
    for (var key in threeCanvases) {
        if (threeCanvases[key] && threeCanvases[key].parentNode) {
            threeCanvases[key].parentNode.removeChild(threeCanvases[key]);
        }
    }
    threeCanvases = {};
    threeRenderers = {};
    threeScenes = {};
    threeCameras = {};
    
    threeRenderer = null;
    threeScene = null;
    threeCamera = null;
    threeCanvas = null;
    threeLoaded = false;
    survivorLoaded = false;
    killerLoaded = false;
    survivorAnimationStates = {};
    currentKillerAnimation = null;
}

// Expose functions to global scope
window.updateSurvivor3DSprite = updateSurvivor3DSprite;
window.updateKiller3DSprite = updateKiller3DSprite;
window.initThreeJS = initThreeJS;
window.cleanupThreeJS = cleanupThreeJS;

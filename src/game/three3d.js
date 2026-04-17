// ═══════ THREE.JS UNIFIED CHARACTER SYSTEM ═══════

// ═══════ CHARACTER CONFIGURATIONS ═══════
// Load from Firestore first, then localStorage, or use defaults
var CHARACTER_CONFIG = null;
var configLoaded = false;

function getDefaultCharacterConfig() {
    return {
        killer: {
            scare: {
                name: 'Scare',
                displayName: 'Scare Killer',
                isKiller: true,
                scale: 1.0,
                canvasWidth: 110,
                canvasHeight: 155,
                speedWalk: 20,
                speedRun: 160,
                enabled: true,
                animations: {
                    idle: 'src/models/killers/scare/ScareKiller_Idle.glb',
                    walk: 'src/models/killers/scare/ScareKiller_Walking.glb',
                    run: 'src/models/killers/scare/ScareKiller_Run.glb'
                }
            }
        },
        survivor: {
            jack: {
                name: 'Jack',
                displayName: 'Jack',
                isKiller: false,
                scale: 0.6,
                canvasWidth: 80,
                canvasHeight: 120,
                speedWalk: 0,
                speedRun: 20,
                enabled: true,
                animations: {
                    idle: 'src/models/survivors/Jack/Jack_Idle.glb',
                    run: 'src/models/survivors/Jack/Jack_Run.glb'
                }
            },
            vika: {
                name: 'Vika',
                displayName: 'Vika',
                isKiller: false,
                scale: 0.55,
                canvasWidth: 75,
                canvasHeight: 115,
                speedWalk: 0,
                speedRun: 22,
                enabled: true,
                animations: {
                    idle: 'src/models/survivors/Vika/Vika_Idle.glb',
                    run: 'src/models/survivors/Vika/Vika_Run.glb'
                }
            }
        }
    };
}

function getCharacterConfig() {
    if (CHARACTER_CONFIG) return CHARACTER_CONFIG;
    
    var saved = localStorage.getItem('dbd_models');
    if (saved) {
        try {
            CHARACTER_CONFIG = JSON.parse(saved);
            return CHARACTER_CONFIG;
        } catch(e) {}
    }
    
    CHARACTER_CONFIG = getDefaultCharacterConfig();
    return CHARACTER_CONFIG;
}

function loadCharacterConfigFromFirestore(callback) {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
        CHARACTER_CONFIG = getCharacterConfig();
        if (callback) callback();
        return;
    }
    
    var db = firebase.firestore();
    db.collection('characters').doc('config').get().then(function(doc) {
        if (doc.exists && doc.data().data) {
            var fbConfig = doc.data().data;
            if (fbConfig.killer || fbConfig.survivor) {
                CHARACTER_CONFIG = fbConfig;
                localStorage.setItem('dbd_models', JSON.stringify(CHARACTER_CONFIG));
            } else {
                CHARACTER_CONFIG = getCharacterConfig();
            }
        } else {
            CHARACTER_CONFIG = getCharacterConfig();
        }
        configLoaded = true;
        if (callback) callback();
    }).catch(function(err) {
        CHARACTER_CONFIG = getCharacterConfig();
        configLoaded = true;
        if (callback) callback();
    });
}

// Initialize with default config until Firestore loads
CHARACTER_CONFIG = getDefaultCharacterConfig();

// ═══════ SELECTED CHARACTER ═══════
// Store the selected character key for gameplay
var selectedKillerKey = null;
var selectedSurvivorKey = null;

function setSelectedCharacter(role, key) {
    if (role === 'killer') {
        selectedKillerKey = key;
    } else {
        selectedSurvivorKey = key;
    }
    ensureCharacterLoaded(role, key);
}

function ensureCharacterLoaded(role, key) {
    var characterType = role === 'killer' ? 'killer' : 'survivor';
    var canvasKey = characterType + '_' + key;
    
    if (characters3D[canvasKey] && characters3D[canvasKey].loaded) {
        return;
    }
    
    var config = CHARACTER_CONFIG[characterType] && CHARACTER_CONFIG[characterType][key];
    
    if (!config) {
        var savedConfig = localStorage.getItem('dbd_models');
        if (savedConfig) {
            try {
                var localConfig = JSON.parse(savedConfig);
                if (localConfig[characterType] && localConfig[characterType][key]) {
                    config = localConfig[characterType][key];
                    if (!CHARACTER_CONFIG[characterType]) CHARACTER_CONFIG[characterType] = {};
                    CHARACTER_CONFIG[characterType][key] = config;
                }
            } catch(e) {}
        }
    }
    
    // Fall back to first available character if config not found
    if (!config) {
        var keys = Object.keys(CHARACTER_CONFIG[characterType] || {});
        if (keys.length > 0) {
            key = keys[0];
            canvasKey = characterType + '_' + key;
            config = CHARACTER_CONFIG[characterType][key];
            // Update selected key to match fallback
            if (role === 'killer') {
                selectedKillerKey = key;
            } else {
                selectedSurvivorKey = key;
            }
        }
        
        // If still no config and this is survivor, use default survivor config
        if (!config && characterType === 'survivor') {
            config = {
                name: key || 'survivor',
                displayName: key || 'Survivor',
                isKiller: false,
                scale: 0.6,
                canvasWidth: 80,
                canvasHeight: 120,
                speedWalk: 0,
                speedRun: 20,
                enabled: true,
                animations: {
                    idle: 'src/models/survivors/' + key + '/' + key + '_Idle.glb',
                    run: 'src/models/survivors/' + key + '/' + key + '_Run.glb',
                    crawl: 'src/models/survivors/' + key + '/' + key + '_Crawl.glb'
                }
            };
        }
    }
    
    if (!config) {
        return;
    }
    
    if (!threeCanvases[canvasKey]) {
        var canvasData = createThreeCanvas(canvasKey, config.canvasWidth || 80, config.canvasHeight || 120);
        threeCanvases[canvasKey] = canvasData.canvas;
        threeRenderers[canvasKey] = canvasData.renderer;
        threeScenes[canvasKey] = canvasData.scene;
        threeCameras[canvasKey] = canvasData.camera;
    }
    
    if (!threeCanvases[canvasKey].parentNode) {
        document.body.appendChild(threeCanvases[canvasKey]);
    }
    
    loadCharacter3D(characterType, key, config, threeScenes[canvasKey], function() {});
}

function getSelectedCharacterKey(type) {
    if (type === 'killer') {
        return selectedKillerKey || getFirstCharacterKey('killer');
    } else {
        return selectedSurvivorKey || getFirstCharacterKey('survivor');
    }
}

// ═══════ CHARACTER DATA ═══════
var characters3D = {};

function createCharacter3D(type, characterConfig) {
    return {
        type: type,
        config: characterConfig,
        models: {},
        mixers: {},
        slotModels: {},
        loaded: false
    };
}

// ═══════ GLOBAL VARIABLES ═══════
var threeLoaded = false;
var threeError = false;
var threeCanvases = {};
var threeRenderers = {};
var threeScenes = {};
var threeCameras = {};
var allAnimationActions = [];

// Legacy variables for compatibility
var killerLoaded = false;
var survivorLoaded = false;

// ═══════ CREATE 3D CANVAS ═══════
function createThreeCanvas(id, width, height) {
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.id = 'canvas_' + id;
    document.body.appendChild(canvas);
    canvas.style.cssText = 'position:fixed;top:0;left:0;z-index:20;pointer-events:none;display:none;width:' + width + 'px;height:' + height + 'px;';
    
    var renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.shadowMap.enabled = false;
    renderer.toneMapping = THREE.NoToneMapping;
    
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 50);
    camera.position.set(0, 0.08, 0.15);
    camera.lookAt(0, 0.05, 0);
    
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    var dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight.position.set(2, 4, 2);
    scene.add(dirLight);
    
    return { canvas: canvas, renderer: renderer, scene: scene, camera: camera };
}

// ═══════ LOAD CHARACTER MODEL ═══════
function loadCharacterModel(character, charType, characterConfig, animKey, modelPath, callback) {
    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
        return;
    }
    
    // Check if model already loaded (cache)
    if (isModelLoaded(modelPath)) {
        console.log('[3D] Model already loaded:', modelPath);
        if (callback) callback();
        return;
    }

    var loader = new THREE.GLTFLoader();

    loader.load(
        modelPath,
        function (gltf) {
            var model = gltf.scene;
            model.traverse(function (child) {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(function(mat) {
                                mat.transparent = false;
                                mat.opacity = 1;
                                mat.depthWrite = true;
                            });
                        } else {
                            child.material.transparent = false;
                            child.material.opacity = 1;
                            child.material.depthWrite = true;
                        }
                    }
                }
            });

            // Store model height for reference
            if (!character.modelHeights) character.modelHeights = {};
            
            // Calculate scale and center model properly
            var box = new THREE.Box3().setFromObject(model);
            var size = box.getSize(new THREE.Vector3());
            var center = box.getCenter(new THREE.Vector3());
            
            // Target scale based on character type
            var targetHeight = charType === 'survivor' ? 1.2 : 1.5;
            var fixedScale = characterConfig.scale || (size.y > 0 ? targetHeight / size.y : (charType === 'survivor' ? 0.6 : 1.0));
            
            // Apply scale first
            model.scale.set(fixedScale, fixedScale, fixedScale);
            
            // Recalculate after scale
            var scaledBox = new THREE.Box3().setFromObject(model);
            var scaledSize = scaledBox.getSize(new THREE.Vector3());
            var scaledCenter = scaledBox.getCenter(new THREE.Vector3());
            
            // Center model - move to origin and lift so feet are at y=0
            model.position.x = -scaledCenter.x;
            model.position.y = -scaledCenter.y + scaledSize.y / 2;
            model.position.z = -scaledCenter.z;
            
            model.visible = false;
            
            // Store model info
            character.modelHeight = size.y;
            character.targetScale = fixedScale;
            
            // Create mixer
            if (gltf.animations && gltf.animations.length > 0) {
                var mixer = new THREE.AnimationMixer(model);
                character.mixers[animKey] = mixer;
                
                gltf.animations.forEach(function (clip) {
                    var action = mixer.clipAction(clip);
                    action.setLoop(THREE.LoopRepeat, Infinity);
                    action.timeScale = 1.0;
                    action.play();
                    allAnimationActions.push(action);
                });
            }

            character.models[animKey] = model;
            
            // Mark model as loaded
            markModelLoaded(modelPath);
            
            if (callback) callback();
        },
        function (progress) {},
        function (error) {}
    );
}

// ═══════ LOAD CHARACTER ═══════
function loadCharacter3D(charType, charKey, characterConfig, scene, callback) {
    var type = charType + '_' + charKey;
    var character = createCharacter3D(type, characterConfig);
    character.charType = charType;
    character.charKey = charKey;
    
    var animKeys = Object.keys(characterConfig.animations || {});
    var loadedCount = 0;
    
    function checkAllLoaded() {
        loadedCount++;
        if (loadedCount >= animKeys.length) {
            // Models already have correct scale/position from loadCharacterModel
            character.targetScale = character.targetScale || 0.6;
            
            // Add models to scene
            for (var key in character.models) {
                scene.add(character.models[key]);
                
                // For survivors, also add clones to all survivor canvases
                if (charType === 'survivor') {
                    if (!character.slotModels) character.slotModels = {};
                    
                    // Store original clips for cloning
                    var originalClips = {};
                    for (var mixKey in character.mixers) {
                        if (character.mixers[mixKey]._actions && character.mixers[mixKey]._actions.length > 0) {
                            originalClips[mixKey] = character.mixers[mixKey]._actions.map(function(a) { return a._clip; }).filter(function(c) { return c; });
                        }
                    }
                    
                    for (var i = 0; i < 4; i++) {
                        var slotScene = threeScenes['survivor_' + i];
                        if (slotScene) {
                            // Clone each model
                            for (var modelKey in character.models) {
                                var clone = character.models[modelKey].clone(true);
                                clone.visible = false;
                                slotScene.add(clone);
                                
                                if (!character.slotModels['survivor_' + i]) character.slotModels['survivor_' + i] = {};
                                character.slotModels['survivor_' + i][modelKey] = clone;
                            }
                            
                            // Create mixers for each animation state separately
                            if (!character.slotMixers) character.slotMixers = {};
                            character.slotMixers['survivor_' + i] = {};
                            
                            // Create a mixer for each state (idle, run) - use only the matching clip
                            var stateMapping = { 'idle': 'idle', 'run': 'run', 'crawl': 'crawl' };
                            for (var stateKey in stateMapping) {
                                var clipKey = stateMapping[stateKey];
                                if (originalClips[clipKey] && originalClips[clipKey].length > 0) {
                                    var cloneMixer = new THREE.AnimationMixer(slotScene.children[slotScene.children.length - 1]);
                                    
                                    originalClips[clipKey].forEach(function(clip) {
                                        var action = cloneMixer.clipAction(clip);
                                        action.setLoop(THREE.LoopRepeat, Infinity);
                                        action.timeScale = 1.0;
                                        action.play();
                                    });
                                    
                                    character.slotMixers['survivor_' + i][stateKey] = cloneMixer;
                                }
                            }
                        }
                    }
                }
            }
            character.loaded = true;
            characters3D[type] = character;
            if (callback) callback();
        }
    }
    
    animKeys.forEach(function(animKey) {
        var animPath = characterConfig.animations[animKey];
        if (animPath) {
            loadCharacterModel(character, charType, characterConfig, animKey, animPath, checkAllLoaded);
        } else {
            loadedCount++;
        }
    });
}

// ═══════ INITIALIZE 3D SYSTEM ═══════
function initThreeJS() {
    if (threeLoaded || threeError) {
        return;
    }
    if (typeof THREE === 'undefined') {
        threeError = true;
        return;
    }
    
    // Load config from Firestore first
    loadCharacterConfigFromFirestore(function() {
        continueInit();
    });
}

function continueInit() {
    try {
        if (threeCanvases && Object.keys(threeCanvases).length > 0) {
            threeLoaded = true;
            return;
        }
        
        // Create canvases for each character
        for (var charType in CHARACTER_CONFIG) {
            for (var charKey in CHARACTER_CONFIG[charType]) {
                var config = CHARACTER_CONFIG[charType][charKey];
                if (!config) continue;
                var canvasKey = charType + '_' + charKey;
                var canvasData = createThreeCanvas(canvasKey, config.canvasWidth || 100, config.canvasHeight || 150);
                threeCanvases[canvasKey] = canvasData.canvas;
                threeRenderers[canvasKey] = canvasData.renderer;
                threeScenes[canvasKey] = canvasData.scene;
                threeCameras[canvasKey] = canvasData.camera;
            }
        }
        
        // Create canvases for AI survivors (up to 4 total) - one per survivor
        var defaultSurvivorConfig = CHARACTER_CONFIG.survivor ? CHARACTER_CONFIG.survivor[Object.keys(CHARACTER_CONFIG.survivor || {})[0]] : null;
        for (var i = 0; i < 4; i++) {
            var canvasData = createThreeCanvas('survivor_' + i, defaultSurvivorConfig ? defaultSurvivorConfig.canvasWidth : 80, defaultSurvivorConfig ? defaultSurvivorConfig.canvasHeight : 120);
            threeCanvases['survivor_' + i] = canvasData.canvas;
            threeRenderers['survivor_' + i] = canvasData.renderer;
            threeScenes['survivor_' + i] = canvasData.scene;
            threeCameras['survivor_' + i] = canvasData.camera;
        }
        
        // Load all characters - count individual characters, not types
        var totalCharactersToLoad = 0;
        for (var ct in CHARACTER_CONFIG) {
            for (var ck in CHARACTER_CONFIG[ct]) {
                totalCharactersToLoad++;
            }
        }
        
        var loadedCount = 0;
        
        function onCharacterLoaded() {
            loadedCount++;
            if (loadedCount >= totalCharactersToLoad) {
                threeLoaded = true;
                
                for (var key in characters3D) {
                    if (key.indexOf('killer_') === 0) killerLoaded = true;
                    if (key.indexOf('survivor_') === 0) survivorLoaded = true;
                }
            }
        }
        
        for (var charType in CHARACTER_CONFIG) {
            for (var charKey in CHARACTER_CONFIG[charType]) {
                var config = CHARACTER_CONFIG[charType][charKey];
                if (!config) continue;
                var canvasKey = charType + '_' + charKey;
                var scene = threeScenes[canvasKey];
                if (!scene) scene = threeScenes[charType];
                loadCharacter3D(charType, charKey, config, scene, onCharacterLoaded);
            }
        }
        
    } catch (e) {
        console.error('[3D] Init error:', e);
        threeError = true;
    }
}

// ═══════ RENDER SURVIVOR ON SLOT ═══════
function renderSurvivorOnSlot(aiSprite, slot, dt, charKeyOverride) {
    var cam = window.scene.cameras.main;
    if (!cam) return;
    if (!aiSprite) return;
    
    // Check if sprite coordinates are valid
    var worldX = aiSprite.x;
    var worldY = aiSprite.y;
    if (isNaN(worldX) || isNaN(worldY)) return;
    
    // Check if camera scroll values are valid
    var scrollX = cam.scrollX || 0;
    var scrollY = cam.scrollY || 0;
    
    // Use override charKey or find first loaded survivor character
    var charKey = charKeyOverride || ('survivor_' + getFirstCharacterKey('survivor'));
    var character = characters3D[charKey];
    
    // Fallback: if not found, search for any loaded survivor character
    if (!character || !character.loaded) {
        for (var ck in characters3D) {
            var c = characters3D[ck];
            if (c && c.loaded && c.charType === 'survivor') {
                character = c;
                break;
            }
        }
    }
    
    if (!character || !character.loaded) return;
    
    var canvas = threeCanvases[slot];
    var scene = threeScenes[slot];
    var camera = threeCameras[slot];
    var renderer = threeRenderers[slot];
    
    if (!canvas || !scene || !camera || !renderer) return;
    
    var zoom = cam.zoom || 1;
    var screenX = (worldX - scrollX) * zoom;
    var screenY = (worldY - scrollY) * zoom;
    
    if (screenX < -200 || screenX > window.innerWidth + 200 || screenY < -200 || screenY > window.innerHeight + 200) {
        canvas.style.display = 'none';
        return;
    }
    
    canvas.style.display = 'block';
    canvas.style.position = 'fixed';
    canvas.style.left = (screenX - canvas.width/2) + 'px';
    canvas.style.top = (screenY - canvas.height/2) + 'px';
    canvas.style.zIndex = '1000';
    canvas.style.pointerEvents = 'none';
    
    // Get slot-specific models
    var slotModels = character.slotModels && character.slotModels[slot] ? character.slotModels[slot] : null;
    var slotMixers = character.slotMixers && character.slotMixers[slot] ? character.slotMixers[slot] : null;
    
    // Debug output (limited to avoid spam)
    if (window._3dDebugCount === undefined) window._3dDebugCount = 0;
    if (window._3dDebugCount < 3) {
        console.log('[3D] CharKey:', charKey, 'Slot:', slot, 'HasSlotModels:', !!slotModels, 'HasSlotMixers:', !!slotMixers, 'Loaded:', character.loaded);
        window._3dDebugCount++;
    }
    
    if (!slotModels) return;
    
var speed = 0;
    if (aiSprite.body) {
        speed = Math.sqrt(
            aiSprite.body.velocity.x * aiSprite.body.velocity.x + 
            aiSprite.body.velocity.y * aiSprite.body.velocity.y
        );
    }
    
    var state = speed > 20 ? 'run' : 'idle';
    
    var modelIdle = slotModels['idle'] || null;
    var modelRun = slotModels['run'] || null;
    
    if (!modelIdle || !modelRun) return;

    if (modelIdle) modelIdle.visible = false;
    if (modelRun) modelRun.visible = false;
    
    var currentModel = state === 'run' ? modelRun : modelIdle;
    if (currentModel) {
        currentModel.visible = true;
        if (aiSprite.body && (Math.abs(aiSprite.body.velocity.x) > 0.5 || Math.abs(aiSprite.body.velocity.y) > 0.5)) {
            var angle = Math.atan2(aiSprite.body.velocity.y, aiSprite.body.velocity.x);
            currentModel.rotation.y = angle;
        }
    }
    
    canvas.style.display = 'block';
    
    var slotMixers = character.slotMixers && character.slotMixers[slot];
    var mixer = null;
    if (slotMixers && slotMixers[state]) {
        mixer = slotMixers[state];
    } else if (character.mixers && character.mixers[state]) {
        mixer = character.mixers[state];
    }
    
    if (mixer) {
        mixer.update(dt / 1000);
    } else {
        // Fallback: use the first available mixer if no specific state mixer found
        if (slotMixers) {
            var firstKey = Object.keys(slotMixers)[0];
            if (firstKey && slotMixers[firstKey]) {
                slotMixers[firstKey].update(dt / 1000);
            }
        }
    }
    
    renderer.render(scene, camera);
}

// ═══════ UPDATE CHARACTER 3D SPRITE ═══════
function updateCharacter3DSprite(charSprite, characterType, dt) {
    if (!threeLoaded) return;
    if (!window.scene || !window.scene.cameras) return;
    
    var cam = window.scene.cameras.main;
    if (!cam) return;
    if (!charSprite) return;
    
    // Check if sprite coordinates are valid
    var worldX = charSprite.x;
    var worldY = charSprite.y;
    if (isNaN(worldX) || isNaN(worldY)) {
        // Sprite might not be fully initialized yet
        return;
    }
    
    // Check if camera scroll values are valid
    var scrollX = cam.scrollX;
    var scrollY = cam.scrollY;
    if (isNaN(scrollX) || isNaN(scrollY)) {
        scrollX = 0;
        scrollY = 0;
    }
    
    var character = characters3D[characterType];
    if (!character || !character.loaded) {
        return;
    }
    
    var config = character.config;
    var isSurvivor = characterType.indexOf('survivor') === 0;
    var canvasWidth = config.canvasWidth || (isSurvivor ? 80 : 110);
    var canvasHeight = config.canvasHeight || (isSurvivor ? 120 : 155);
    
    var canvas = threeCanvases[characterType];
    var scene = threeScenes[characterType];
    var camera = threeCameras[characterType];
    var renderer = threeRenderers[characterType];
    
    if (!canvas || !scene || !renderer) {
        return;
    }
    
    if (!canvas.parentNode) {
        document.body.appendChild(canvas);
    }

    var zoom = cam.zoom || 1;
    var screenX = (worldX - scrollX) * zoom;
    var screenY = (worldY - scrollY) * zoom;
    
    if (screenX < -200 || screenX > window.innerWidth + 200 || screenY < -200 || screenY > window.innerHeight + 200) {
        canvas.style.display = 'none';
        return;
    }
    
    canvas.style.display = 'block';
    canvas.style.position = 'fixed';
    canvas.style.zIndex = '1000';
    canvas.style.pointerEvents = 'none';
    canvas.style.left = (screenX - canvasWidth / 2) + 'px';
    canvas.style.top = (screenY - canvasHeight / 2) + 'px';
    
    // Calculate speed
    var speed = 0;
    if (charSprite.body) {
        speed = Math.sqrt(
            charSprite.body.velocity.x * charSprite.body.velocity.x + 
            charSprite.body.velocity.y * charSprite.body.velocity.y
        );
    }
    
    // Determine animation state
    var state = 'idle';
    var mixer = null;
    var currentModel = null;
    
    if (isSurvivor) {
        if (speed > (config.speedRun || 20)) {
            state = 'run';
            mixer = character.mixers['run'];
            currentModel = character.models['run'];
        } else if (player && player.state === 'dying' && character.mixers['crawl']) {
            state = 'crawl';
            mixer = character.mixers['crawl'];
            currentModel = character.models['crawl'];
        } else {
            state = 'idle';
            mixer = character.mixers['idle'];
            currentModel = character.models['idle'];
        }
    } else {
        if (speed > (config.speedRun || 160)) {
            state = 'run';
            mixer = character.mixers['run'];
            currentModel = character.models['run'];
        } else if (speed > (config.speedWalk || 20)) {
            state = 'walk';
            mixer = character.mixers['walk'];
            currentModel = character.models['walk'];
        } else {
            state = 'idle';
            mixer = character.mixers['idle'];
            currentModel = character.models['idle'];
        }
    }
    
    // Debug info
    var modelScale = currentModel ? currentModel.scale.x.toFixed(3) : 'N/A';
    var threeL = threeLoaded ? 'YES' : 'NO';
    var playerState = player ? player.state : 'N/A';
    var loaded = character && character.loaded ? 'YES' : 'NO';
    var debugInfo = characterType + ' | loaded:' + loaded + ' | scale:' + modelScale + ' | state:' + playerState;
    
    var debugEl = document.getElementById('model-debug');
    if (!debugEl) {
        debugEl = document.createElement('div');
        debugEl.id = 'model-debug';
        debugEl.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.9);color:#0f0;font-size:12px;padding:10px;border-radius:5px;z-index:99999;font-family:monospace;max-width:400px;border:2px solid #0f0;';
        document.body.appendChild(debugEl);
    }
    debugEl.textContent = debugInfo;
    
    // Crossfade animation transition
    var currentAction = character.currentAction;
    var targetAction = null;
    if (mixer && state) {
        var actions = mixer._actions || [];
        for (var i = 0; i < actions.length; i++) {
            if (actions[i]._clip && actions[i]._clip.name.toLowerCase().includes(state)) {
                targetAction = actions[i];
                break;
            }
        }
    }
    
    // Smooth crossfade
    if (targetAction && targetAction !== currentAction) {
        var crossfadeDuration = 0.15;
        if (currentAction) {
            currentAction.fadeOut(crossfadeDuration);
        }
        if (targetAction) {
            targetAction.reset().fadeIn(crossfadeDuration).play();
        }
        character.currentAction = targetAction;
    }
    
    // Hide all models
    for (var key in character.models) {
        character.models[key].visible = false;
    }
    
    // Show current model
    if (currentModel) {
        currentModel.visible = true;
        
        // Rotate based on joystick input direction
        if (typeof inputVec !== 'undefined') {
            var inputLen = Math.sqrt(inputVec.x * inputVec.x + inputVec.y * inputVec.y);
            if (inputLen > 0.1) {
                var angle = Math.atan2(inputVec.y, inputVec.x);
                currentModel.rotation.y = -angle + Math.PI / 2;
            }
        }
    }
    
    // Update mixer (Phaser dt is in ms, THREE.js expects seconds)
    if (mixer) {
        mixer.update(dt / 1000);
    }
    
    renderer.render(scene, camera);
}

// ═══════ LEGACY FUNCTIONS FOR COMPATIBILITY ═══════

function getFirstCharacterKey(type) {
    // Try CHARACTER_CONFIG first, but also check loaded characters
    if (CHARACTER_CONFIG && CHARACTER_CONFIG[type]) {
        var keys = Object.keys(CHARACTER_CONFIG[type]);
        if (keys.length > 0) return keys[0];
    }
    
    // Fallback: find first loaded character of this type
    for (var key in characters3D) {
        var c = characters3D[key];
        if (c && c.charType === type) {
            return c.charKey;
        }
    }
    
    return null;
}

function updateSurvivor3DSprite(dt) {
    if (!threeLoaded) return;

    var survivorKey = getSelectedCharacterKey('survivor');
    var charKey = 'survivor_' + survivorKey;
    var survivor3DLoaded = survivorKey && characters3D[charKey] && characters3D[charKey].loaded;

    // Always hide 2D sprites - only 3D allowed
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

    // Update survivor (player) 3D
    if (!isKiller && player && player.sprite && player.state !== 'dead' && player.state !== 'hooked' && player.state !== 'carried') {
        if (survivor3DLoaded) {
            var playerCharKey = 'survivor_' + (player.survivorKey || getFirstCharacterKey('survivor'));
            updateCharacter3DSprite(player.sprite, playerCharKey, dt);
        }
    }

    // Update AI survivors with 3D models
    if (!isKiller && !isMultiplayer && player && player.aiPlayers) {
        if (survivorLoaded) {
            var survivorIndex = 0;
            player.aiPlayers.forEach(function(ai) {
                if (ai && ai.sprite && !ai.isAIKiller && ai.state !== 'dead' && ai.state !== 'hooked' && ai.state !== 'carried') {
                    // Hide 2D sprite
                    if (ai.sprite.visible) ai.sprite.setVisible(false);
                    if (ai.glowFx) ai.glowFx.setVisible(false);
                    
                    var slot = 'survivor_' + survivorIndex;
                    var charKey = 'survivor_' + (ai.survivorKey || 'jack');
                    if (threeCanvases[slot] && threeScenes[slot]) {
                        renderSurvivorOnSlot(ai.sprite, slot, dt, charKey);
                    }
                    survivorIndex++;
                }
            });
        }
    }

    // Update AI killer
    if (!isKiller && !isMultiplayer && player && player.aiPlayers) {
        var aiKiller = null;
        for (var i = 0; i < player.aiPlayers.length; i++) {
            if (player.aiPlayers[i].isAIKiller && player.aiPlayers[i].sprite) {
                aiKiller = player.aiPlayers[i];
                break;
            }
        }
        
        var killerKey = getSelectedCharacterKey('killer');
        var killerCharKey = 'killer_' + killerKey;
        var killer3DLoaded = killerKey && characters3D[killerCharKey] && characters3D[killerCharKey].loaded;
        
        if (aiKiller && aiKiller.sprite && !isNaN(aiKiller.sprite.x)) {
            // Always hide 2D sprites - only 3D allowed
            aiKiller.sprite.setVisible(false);
            if (aiKiller.glowFx) aiKiller.glowFx.setVisible(false);
            
            if (killer3DLoaded) {
                updateCharacter3DSprite(aiKiller.sprite, killerCharKey, dt);
            }
        }
    }
}

function updateKiller3DSprite(dt) {
    if (!threeLoaded) return;

    // Hide killer sprite (player)
    if (player && player.sprite) {
        player.sprite.setVisible(false);
        if (player.glowFx) player.glowFx.setVisible(false);
    }

    // Update killer (player)
    if (isKiller && player && player.sprite) {
        var killerKey = getSelectedCharacterKey('killer');
        if (killerKey) {
            updateCharacter3DSprite(player.sprite, 'killer_' + killerKey, dt);
        }
    }
    
    // Update AI survivors with 3D models
    if (isKiller && !isMultiplayer && player && player.aiPlayers) {
        if (survivorLoaded) {
            var survivorIndex = 0;
            player.aiPlayers.forEach(function(ai) {
                if (ai && ai.sprite && !ai.isAIKiller && ai.state !== 'dead' && ai.state !== 'hooked' && ai.state !== 'carried') {
                    if (ai.sprite.visible) ai.sprite.setVisible(false);
                    if (ai.glowFx) ai.glowFx.setVisible(false);
                    
                    var slot = 'survivor_' + survivorIndex;
                    var charKey = 'survivor_' + (ai.survivorKey || 'jack');
                    if (threeCanvases[slot]) {
                        renderSurvivorOnSlot(ai.sprite, slot, dt, charKey);
                    }
                    survivorIndex++;
                }
            });
        }
    }
}

// ═══════ CLEANUP ═══════
function cleanupThreeJS() {
    // Clear all characters
    for (var type in characters3D) {
        var character = characters3D[type];
        for (var key in character.mixers) {
            character.mixers[key].stopAllAction();
        }
        character.models = {};
        character.mixers = {};
    }
    characters3D = {};
    
    // Clean up canvases
    for (var key in threeCanvases) {
        if (threeCanvases[key] && threeCanvases[key].parentNode) {
            threeCanvases[key].parentNode.removeChild(threeCanvases[key]);
        }
    }
    threeCanvases = {};
    threeRenderers = {};
    threeScenes = {};
    threeCameras = {};
    
    threeLoaded = false;
    killerLoaded = false;
    survivorLoaded = false;
}

// ═══════ ANIMATION SPEED CONTROLS ═══════
var animationTimeScale = 0.02;

function createAnimationMenu() {
    var menu = document.createElement('div');
    menu.id = 'animationMenu';
    menu.style.cssText = 'position:fixed;top:10px;right:10px;background:rgba(0,0,0,0.8);color:white;padding:15px;border-radius:8px;z-index:99999;font-family:Arial;font-size:12px;min-width:200px;';
    menu.innerHTML = 
        '<div style="margin-bottom:10px;font-weight:bold;">Настройка анимаций</div>' +
        '<div style="margin-bottom:10px;">' +
            '<label>Скорость: <span id="animSpeedValue">0.01</span></label><br>' +
            '<input type="range" id="animSpeedSlider" min="1" max="100" value="2" style="width:100%">' +
        '</div>' +
        '<button id="animSpeedReset" style="padding:5px 10px;cursor:pointer;">Сброс</button>';
    document.body.appendChild(menu);
    
    var slider = document.getElementById('animSpeedSlider');
    var valueDisplay = document.getElementById('animSpeedValue');
    var resetBtn = document.getElementById('animSpeedReset');
    
    slider.addEventListener('input', function() {
        var value = this.value / 100;
        animationTimeScale = value;
        valueDisplay.textContent = value.toFixed(2);
        updateAllAnimationSpeeds();
    });
    
    resetBtn.addEventListener('click', function() {
        animationTimeScale = 0.02;
        slider.value = 2;
        valueDisplay.textContent = '0.02';
        updateAllAnimationSpeeds();
    });
}

function updateAllAnimationSpeeds() {
    allAnimationActions.forEach(function(action) {
        action.timeScale = animationTimeScale;
    });
}

// ═══════ DISPOSE 3D MODELS ═══════
function disposeCharacter(character) {
    if (!character) return;
    
    // Dispose main models
    if (character.models) {
        Object.values(character.models).forEach(function(model) {
            if (!model) return;
            model.traverse(function(obj) {
                if (obj.isMesh) {
                    if (obj.geometry) {
                        obj.geometry.dispose();
                    }
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(function(m) { m.dispose(); });
                        } else {
                            obj.material.dispose();
                        }
                    }
                }
            });
        });
    }
    
    // Dispose slot models
    if (character.slotModels) {
        Object.keys(character.slotModels).forEach(function(slot) {
            var models = character.slotModels[slot];
            if (models) {
                Object.values(models).forEach(function(model) {
                    if (!model) return;
                    model.traverse(function(obj) {
                        if (obj.isMesh) {
                            if (obj.geometry) obj.geometry.dispose();
                            if (obj.material) {
                                if (Array.isArray(obj.material)) {
                                    obj.material.forEach(function(m) { m.dispose(); });
                                } else {
                                    obj.material.dispose();
                                }
                            }
                        }
                    });
                });
            }
        });
        character.slotModels = {};
    }
    
    // Dispose mixers
    if (character.mixers) {
        Object.values(character.mixers).forEach(function(mixer) {
            if (mixer) mixer.stopAllAction();
        });
        character.mixers = {};
    }
    
    if (character.slotMixers) {
        Object.values(character.slotMixers).forEach(function(mixer) {
            if (mixer) mixer.stopAllAction();
        });
        character.slotMixers = {};
    }
    
    character.loaded = false;
}

// Clean up characters that are not being used
function cleanupUnusedCharacters() {
    var activeChar = isKiller ? selectedKillerKey : selectedSurvivorKey;
    var activeType = isKiller ? 'killer' : 'survivor';
    var activeKey = activeType + '_' + activeChar;
    
    Object.keys(characters3D).forEach(function(key) {
        if (key !== activeKey && key.indexOf(activeType + '_') !== 0) {
            disposeCharacter(characters3D[key]);
            delete characters3D[key];
        }
    });
}

// Cache for loaded model paths
var loadedModelPaths = {};

function isModelLoaded(modelPath) {
    return loadedModelPaths[modelPath] === true;
}

function markModelLoaded(modelPath) {
    loadedModelPaths[modelPath] = true;
}

// ═══════ EXPORT TO WINDOW ═══════
window.initThreeJS = initThreeJS;
window.cleanupThreeJS = cleanupThreeJS;
window.updateCharacter3DSprite = updateCharacter3DSprite;
window.updateSurvivor3DSprite = updateSurvivor3DSprite;
window.updateKiller3DSprite = updateKiller3DSprite;
window.setSelectedCharacter = setSelectedCharacter;
window.CHARACTER_CONFIG = CHARACTER_CONFIG;
window.characters3D = characters3D;
window.createAnimationMenu = createAnimationMenu;
window.ensureCharacterLoaded = ensureCharacterLoaded;
window.setSelectedCharacter = setSelectedCharacter;

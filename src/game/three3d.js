// ═══════ THREE.JS UNIFIED CHARACTER SYSTEM ═══════

// ═══════ CHARACTER CONFIGURATIONS ═══════
// Load from localStorage or use defaults
function getCharacterConfig() {
    var saved = localStorage.getItem('dbd_models');
    if (saved) {
        return JSON.parse(saved);
    }
    // Default configuration
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
            }
        }
    };
}

var CHARACTER_CONFIG = getCharacterConfig();

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
    document.body.appendChild(canvas);
    canvas.setAttribute('style', 'position:fixed!important;top:0!important;left:0!important;z-index:20!important;pointer-events:none!important;display:none!important;width:' + width + 'px!important;height:' + height + 'px!important;');
    
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
function loadCharacterModel(character, animKey, modelPath, callback) {
    if (typeof THREE === 'undefined' || typeof THREE.GLTFLoader === 'undefined') {
        console.warn('[3D] GLTFLoader not available');
        return;
    }

    var loader = new THREE.GLTFLoader();
    console.log('[3D] Loading', character.config.name, animKey, 'from:', modelPath);

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
            var targetScale = character.config.scale;
            
            model.scale.set(targetScale, targetScale, targetScale);
            var center = box.getCenter(new THREE.Vector3());
            model.position.set(-center.x * targetScale, -center.y * targetScale, -center.z * targetScale);
            model.visible = false;
            
            // Create mixer
            if (gltf.animations && gltf.animations.length > 0) {
                console.log('[3D] Found', gltf.animations.length, 'animations');
                
                var mixer = new THREE.AnimationMixer(model);
                character.mixers[animKey] = mixer;
                
                gltf.animations.forEach(function (clip) {
                    var action = mixer.clipAction(clip);
                    action.setLoop(THREE.LoopRepeat, Infinity);
                    action.timeScale = 1.0;
                    action.play();
                    allAnimationActions.push(action);
                });
            } else {
                console.warn('[3D] No animations found');
            }

            character.models[animKey] = model;
            console.log('[3D] Model loaded:', animKey);
            
            if (callback) callback();
        },
        function (progress) {
            var percent = Math.round(progress.loaded / progress.total * 100);
            console.log('[3D] Loading:', percent + '%');
        },
        function (error) {
            console.error('[3D] Load error:', error);
        }
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
            // Add models to scene
            for (var key in character.models) {
                scene.add(character.models[key]);
                
                // For survivors, also add clones to all survivor canvases
                if (charType === 'survivor') {
                    if (!character.slotModels) character.slotModels = {};
                    for (var i = 0; i < 4; i++) {
                        var slotScene = threeScenes['survivor_' + i];
                        if (slotScene) {
                            var clone = character.models[key].clone(true); // deep clone
                            clone.visible = false;
                            slotScene.add(clone);
                            
                            if (!character.slotModels['survivor_' + i]) character.slotModels['survivor_' + i] = {};
                            character.slotModels['survivor_' + i][key] = clone;
                            
                            // Create mixer for cloned model
                            var cloneMixer = new THREE.AnimationMixer(clone);
                            cloneMixer.addEventListener('finished', function() {});
                            
                            // Add all animations
                            if (character.mixers[key]) {
                                character.mixers[key]._actions.forEach(function(action) {
                                    if (action._clip) {
                                        var newAction = cloneMixer.clipAction(action._clip);
                                        newAction.setLoop(action.loop, action._repeatCount);
                                        newAction.timeScale = action.timeScale;
                                        newAction.enabled = action.enabled;
                                        newAction.play();
                                    }
                                });
                            }
                            
                            if (!character.slotMixers) character.slotMixers = {};
                            if (!character.slotMixers['survivor_' + i]) character.slotMixers['survivor_' + i] = {};
                            character.slotMixers['survivor_' + i][key] = cloneMixer;
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
            loadCharacterModel(character, animKey, animPath, checkAllLoaded);
        } else {
            loadedCount++;
        }
    });
}

// ═══════ INITIALIZE 3D SYSTEM ═══════
function initThreeJS() {
    console.log('[3D] initThreeJS called');
    
    if (threeLoaded || threeError) {
        console.log('[3D] Already loaded or error');
        return;
    }
    if (typeof THREE === 'undefined') {
        console.warn('[3D] Three.js not loaded');
        threeError = true;
        return;
    }
    
    try {
        if (threeCanvases && Object.keys(threeCanvases).length > 0) {
            console.log('[3D] Canvases already exist');
            threeLoaded = true;
            return;
        }
        
        console.log('[3D] Creating canvases...');
        
        // Refresh config from localStorage
        CHARACTER_CONFIG = getCharacterConfig();
        
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
        
        console.log('[3D] Canvases created:', Object.keys(threeCanvases));
        
        // Load all characters
        var charactersToLoad = Object.keys(CHARACTER_CONFIG);
        var loadedCount = 0;
        
        function onCharacterLoaded() {
            loadedCount++;
            if (loadedCount >= charactersToLoad.length) {
                threeLoaded = true;
                console.log('[3D] All characters loaded');
                
                // Set loaded flags - check for any killer/survivor character
                for (var key in characters3D) {
                    if (key.indexOf('killer_') === 0) killerLoaded = true;
                    if (key.indexOf('survivor_') === 0) survivorLoaded = true;
                }
            }
        }
        
        charactersToLoad.forEach(function(charType) {
            for (var charKey in CHARACTER_CONFIG[charType]) {
                var config = CHARACTER_CONFIG[charType][charKey];
                if (!config) continue;
                var canvasKey = charType + '_' + charKey;
                var scene = threeScenes[canvasKey];
                if (!scene) scene = threeScenes[charType];
                loadCharacter3D(charType, charKey, config, scene, onCharacterLoaded);
            }
        });
        
    } catch (e) {
        console.error('[3D] Init error:', e);
        threeError = true;
    }
}

// ═══════ RENDER SURVIVOR ON SLOT ═══════
function renderSurvivorOnSlot(aiSprite, slot, dt) {
    if (!threeLoaded) return;
    if (!window.scene || !window.scene.cameras) return;
    
    // Debug: log every 2 seconds
    if (!renderSurvivorOnSlot._debugTimer) renderSurvivorOnSlot._debugTimer = 0;
    renderSurvivorOnSlot._debugTimer += dt / 1000;
    if (renderSurvivorOnSlot._debugTimer > 2) {
        renderSurvivorOnSlot._debugTimer = 0;
        var survivorKey = getFirstCharacterKey('survivor');
        var charKey = 'survivor_' + survivorKey;
        var character = characters3D[charKey];
        var modelsKeys = character && character.slotModels ? Object.keys(character.slotModels) : [];
        var mixersKeys = character && character.slotMixers ? Object.keys(character.slotMixers) : [];
        console.log('[3D Slot]', slot, 'models:', modelsKeys, 'mixers:', mixersKeys);
    }
    
    var cam = window.scene.cameras.main;
    if (!cam) return;
    if (!aiSprite) return;
    
    // Find first loaded survivor character
    var survivorKey = getFirstCharacterKey('survivor');
    var charKey = 'survivor_' + survivorKey;
    var character = characters3D[charKey];
    if (!character || !character.loaded) return;
    
    var canvas = threeCanvases[slot];
    var scene = threeScenes[slot];
    var camera = threeCameras[slot];
    var renderer = threeRenderers[slot];
    
    if (!canvas || !scene || !camera || !renderer) return;
    
    var screenX = aiSprite.x - cam.scrollX;
    var screenY = aiSprite.y - cam.scrollY;
    
    if (screenX < -100 || screenX > window.innerWidth + 100 || screenY < -100 || screenY > window.innerHeight + 100) {
        canvas.style.display = 'none';
        return;
    }
    
    canvas.style.display = 'block';
    canvas.style.position = 'fixed';
    canvas.style.left = (screenX - 40) + 'px';
    canvas.style.top = (screenY - 60) + 'px';
    canvas.style.zIndex = '1000';
    canvas.style.pointerEvents = 'none';
    
    // Get slot-specific models
    var slotModels = character.slotModels && character.slotModels[slot] ? character.slotModels[slot] : null;
    
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
    
    // Use individual slot mixer if available, otherwise fall back to shared
    var slotMixer = character.slotMixers && character.slotMixers[slot] ? character.slotMixers[slot][state] : null;
    if (slotMixer) {
        slotMixer.update(dt / 1000);
    } else if (character.mixers[state]) {
        character.mixers[state].update(dt / 1000);
    } else {
        console.warn('[3D] No mixer for slot:', slot, 'state:', state);
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
    
    var character = characters3D[characterType];
    if (!character || !character.loaded) return;
    
    var config = character.config;
    var canvas = threeCanvases[characterType] || threeCanvases['survivor'];
    var scene = threeScenes[characterType] || threeScenes['survivor'];
    var camera = threeCameras[characterType] || threeCameras['survivor'];
    var renderer = threeRenderers[characterType] || threeRenderers['survivor'];
    
    if (!canvas || !scene || !camera || !renderer) return;
    
    var screenX = charSprite.x - cam.scrollX;
    var screenY = charSprite.y - cam.scrollY;
    
    if (screenX < -100 || screenX > window.innerWidth + 100 || screenY < -100 || screenY > window.innerHeight + 100) {
        canvas.style.display = 'none';
        return;
    }
    
    canvas.style.display = 'block';
    canvas.style.position = 'fixed';
    canvas.style.left = (screenX - config.canvasWidth / 2) + 'px';
    canvas.style.top = (screenY - config.canvasHeight / 2) + 'px';
    canvas.style.zIndex = '1000';
    canvas.style.pointerEvents = 'none';
    
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
    
    if (config.isKiller) {
        if (speed > config.speedRun) {
            state = 'run';
            mixer = character.mixers['run'];
            currentModel = character.models['run'];
        } else if (speed > config.speedWalk) {
            state = 'walk';
            mixer = character.mixers['walk'];
            currentModel = character.models['walk'];
        } else {
            state = 'idle';
            mixer = character.mixers['idle'];
            currentModel = character.models['idle'];
        }
    } else {
        if (speed > config.speedRun) {
            state = 'run';
            mixer = character.mixers['run'];
            currentModel = character.models['run'];
        } else {
            state = 'idle';
            mixer = character.mixers['idle'];
            currentModel = character.models['idle'];
        }
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
    var keys = Object.keys(CHARACTER_CONFIG[type] || {});
    return keys[0] || null;
}

function updateSurvivor3DSprite(dt) {
    if (!threeLoaded) return;

    // Hide sprite
    if (player && player.sprite) {
        player.sprite.setVisible(false);
        if (player.glowFx) player.glowFx.setVisible(false);
    }
    
    // Hide AI survivors sprites
    if (player && player.aiPlayers) {
        player.aiPlayers.forEach(function(ai) {
            if (ai && ai.sprite && !ai.isAIKiller) {
                ai.sprite.setVisible(false);
                if (ai.glowFx) ai.glowFx.setVisible(false);
            }
        });
    }

    // Update survivor (player)
    if (!isKiller && player && player.sprite && player.state !== 'dead' && player.state !== 'hooked' && player.state !== 'carried') {
        var survivorKey = getFirstCharacterKey('survivor');
        if (survivorKey) {
            updateCharacter3DSprite(player.sprite, 'survivor_' + survivorKey, dt);
        }
    }

    // Update AI survivors with 3D models
    if (!isKiller && !isMultiplayer && player && player.aiPlayers) {
        if (survivorLoaded) {
            var survivorIndex = 0;
            player.aiPlayers.forEach(function(ai) {
                if (ai && ai.sprite && !ai.isAIKiller && ai.state !== 'dead' && ai.state !== 'hooked' && ai.state !== 'carried') {
                    if (ai.sprite.visible) ai.sprite.setVisible(false);
                    if (ai.glowFx) ai.glowFx.setVisible(false);
                    
                    var slot = 'survivor_' + survivorIndex;
                    if (threeCanvases[slot]) {
                        renderSurvivorOnSlot(ai.sprite, slot, dt);
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
        
        if (aiKiller && aiKiller.sprite) {
            aiKiller.sprite.setVisible(false);
            if (aiKiller.glowFx) aiKiller.glowFx.setVisible(false);
            var killerKey = getFirstCharacterKey('killer');
            if (killerKey) {
                updateCharacter3DSprite(aiKiller.sprite, 'killer_' + killerKey, dt);
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
        var killerKey = getFirstCharacterKey('killer');
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
                    if (threeCanvases[slot]) {
                        renderSurvivorOnSlot(ai.sprite, slot, dt);
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

// ═══════ EXPORT TO WINDOW ═══════
window.initThreeJS = initThreeJS;
window.cleanupThreeJS = cleanupThreeJS;
window.updateCharacter3DSprite = updateCharacter3DSprite;
window.updateSurvivor3DSprite = updateSurvivor3DSprite;
window.updateKiller3DSprite = updateKiller3DSprite;
window.CHARACTER_CONFIG = CHARACTER_CONFIG;
window.characters3D = characters3D;
window.createAnimationMenu = createAnimationMenu;

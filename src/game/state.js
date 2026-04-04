// ═══════ GLOBAL STATE ═══════

var game = null;
var scene = null;
var player = null;
var generators = [];
var hooks = [];
var gates = [];
var pallets = [];
var hatch = null;
var staticGroup = null;

var isKiller = false;
var isMultiplayer = false;
var roomCode = null;
var playerId = null;

var exitOpen = false;
var hatchOpen = false;
var hatchClosed = false;
var survivorsAlive = 0;

var killerStun = 0;
var boostTimer = 0;
var killerSlowdown = 0;
var survivorSpeedBoost = 0;
var killerStrikeTimer = 0;
var killerAttackCooldown = 0;
var isRoomHost = false;

var actionPressed = false;
var palletPressed = false;
var inputVec = { x: 0, y: 0 };
var isCarryingNearHook = false;
var isNearHatch = false;
var isEscapingHatch = false;
var hatchEscapeProgress = 0;
var HATCH_ESCAPE_TIME = 1.5;
var isNearGate = false;
var isEscapingGate = false;
var gateEscapeProgress = 0;
var GATE_ESCAPE_TIME = 1.5;

var floatBars = [];
var floatBarGfx = null;
var keys = {};
var gameEnded = false;
var localPlayerId = null;
var gameTime = 0;

// Remote players for multiplayer
var remotePlayers = {};
var lastPosUpdate = 0;
var POS_UPDATE_INTERVAL = 50;
var POS_LERP_SPEED = 0.15;

// Three.js 3D model state
var threeRenderer = null;
var threeScene = null;
var threeCamera = null;
var killerModelIdle = null;
var killerModelWalking = null;
var killerModelRun = null;
var killerModel = null;
var killerMixerIdle = null;
var killerMixerWalking = null;
var killerMixerRun = null;
var killerAnimationsIdle = {};
var killerAnimationsWalking = {};
var killerAnimationsRun = {};
var threeLoaded = false;
var threeError = false;
var threeCanvas = null;
var modelsLoaded = 0;
var totalModels = 3;
var killerRotation = 0;
var currentKillerState = 'idle';

// ═══════ BLOODPOINTS & STATS ═══════
var bloodpoints = {
    total: 0,
    matchEarned: 0,
    breakdown: {}
};

var matchStats = {
    startTime: 0,
    generatorsRepaired: 0,
    survivorsHealed: 0,
    survivorsKilled: 0,
    survivorsHooked: 0,
    palletsDropped: 0,
    palletsStunned: 0,
    gatesOpened: 0,
    hatchEscapes: 0,
    chaseTime: 0,
    isChasing: false,
    chaseStartTime: 0
};

// Player persistent stats (loaded from localStorage)
var playerStats = {
    totalPlaytime: 0, // seconds
    totalMatches: 0,
    wins: 0,
    losses: 0,
    totalBloodpoints: 0,
    killerStats: { kills: 0, hooks: 0, chases: 0 },
    survivorStats: { escapes: 0, gensRepaired: 0, heals: 0 }
};

function loadPlayerStats() {
    try {
        var saved = localStorage.getItem('dbd_player_stats');
        if (saved) {
            var parsed = JSON.parse(saved);
            for (var key in parsed) {
                if (playerStats.hasOwnProperty(key)) {
                    if (typeof parsed[key] === 'object' && !Array.isArray(parsed[key])) {
                        for (var subKey in parsed[key]) {
                            playerStats[key][subKey] = parsed[key][subKey];
                        }
                    } else {
                        playerStats[key] = parsed[key];
                    }
                }
            }
        }
    } catch (e) {
        console.warn('Failed to load player stats:', e);
    }
}

function savePlayerStats() {
    try {
        localStorage.setItem('dbd_player_stats', JSON.stringify(playerStats));
    } catch (e) {
        console.warn('Failed to save player stats:', e);
    }
}

function resetMatchStats() {
    matchStats = {
        startTime: Date.now(),
        generatorsRepaired: 0,
        survivorsHealed: 0,
        survivorsKilled: 0,
        survivorsHooked: 0,
        palletsDropped: 0,
        palletsStunned: 0,
        gatesOpened: 0,
        hatchEscapes: 0,
        chaseTime: 0,
        isChasing: false,
        chaseStartTime: 0
    };
    bloodpoints = { total: 0, matchEarned: 0, breakdown: {} };
}

function addBloodpoints(category, amount, description) {
    bloodpoints.matchEarned += amount;
    if (!bloodpoints.breakdown[category]) {
        bloodpoints.breakdown[category] = { total: 0, events: [] };
    }
    bloodpoints.breakdown[category].total += amount;
    bloodpoints.breakdown[category].events.push({ amount: amount, desc: description, time: Date.now() });
}

function calculateMatchBloodpoints(won) {
    var bp = 0;
    
    if (isKiller) {
        // Killer bloodpoints
        bp += matchStats.survivorsKilled * 3000; // Kill: 3000 each
        bp += matchStats.survivorsHooked * 1500; // Hook: 1500 each
        bp += Math.floor(matchStats.chaseTime / 10) * 100; // Chase: 100 per 10 seconds
        bp += matchStats.palletsStunned > 0 ? -500 : 0; // Stunned penalty
        bp += won ? 5000 : 0; // Win bonus
    } else {
        // Survivor bloodpoints
        bp += matchStats.generatorsRepaired * 2000; // Gen repair: 2000 each
        bp += matchStats.survivorsHealed * 1500; // Heal: 1500 each
        bp += matchStats.palletsDropped * 1000; // Pallet drop: 1000 each
        bp += matchStats.palletsStunned * 2000; // Stun killer: 2000 each
        bp += matchStats.gatesOpened * 3000; // Gate open: 3000 each
        bp += matchStats.hatchEscapes > 0 ? 4000 : 0; // Hatch escape: 4000
        bp += Math.floor(matchStats.chaseTime / 15) * 150; // Chase: 150 per 15 seconds
        bp += won ? 5000 : 0; // Win bonus (escaped)
    }
    
    return bp;
}

function endMatch(won) {
    var playtime = (Date.now() - matchStats.startTime) / 1000;
    var earnedBP = calculateMatchBloodpoints(won);
    
    // Update persistent stats
    playerStats.totalPlaytime += playtime;
    playerStats.totalMatches++;
    playerStats.totalBloodpoints += earnedBP;
    
    if (won) playerStats.wins++;
    else playerStats.losses++;
    
    if (isKiller) {
        playerStats.killerStats.kills += matchStats.survivorsKilled;
        playerStats.killerStats.hooks += matchStats.survivorsHooked;
    } else {
        if (won) playerStats.survivorStats.escapes++;
        playerStats.survivorStats.gensRepaired += matchStats.generatorsRepaired;
        playerStats.survivorStats.heals += matchStats.survivorsHealed;
    }
    
    savePlayerStats();
    
    return {
        won: won,
        playtime: playtime,
        bloodpoints: earnedBP,
        stats: Object.assign({}, matchStats)
    };
}

// Load stats on init
loadPlayerStats();

// ═══════ GRAPHICS SETTINGS ═══════
var graphicsSettings = {
    quality: 'auto', // 'low', 'medium', 'high', 'ultra', 'auto'
    shadows: false,
    fog: true,
    particles: true,
    atmosphere: true,
    crows: true,
    dust: true,
    ash: true,
    bloodSplatter: true,
    screenShake: true,
    fpsLimit: 60,
    pixelRatio: 1,
    antialias: false
};

function detectGraphicsQuality() {
    var mem = navigator.deviceMemory || 4;
    var cores = navigator.hardwareConcurrency || 4;
    var gpu = '';
    
    try {
        var canvas = document.createElement('canvas');
        var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            var dbg = gl.getExtension('WEBGL_debug_renderer_info');
            if (dbg) gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL).toLowerCase();
        }
    } catch(e) {}
    
    var isHighGPU = gpu.includes('adreno') || gpu.includes('mali-g') || gpu.includes('apple') || gpu.includes('nvidia') || gpu.includes('amd') || gpu.includes('intel iris');
    
    if (mem >= 8 && cores >= 8 && isHighGPU) return 'ultra';
    if (mem >= 6 && cores >= 6) return 'high';
    if (mem >= 4 && cores >= 4) return 'medium';
    return 'low';
}

function applyGraphicsSettings() {
    var saved = localStorage.getItem('dbd_graphics_settings');
    if (saved) {
        try {
            var parsed = JSON.parse(saved);
            for (var key in parsed) {
                if (graphicsSettings.hasOwnProperty(key)) {
                    graphicsSettings[key] = parsed[key];
                }
            }
        } catch(e) {}
    }
    
    // Auto-detect if not set
    if (graphicsSettings.quality === 'auto') {
        graphicsSettings.quality = detectGraphicsQuality();
    }
    
    // Apply quality preset
    switch (graphicsSettings.quality) {
        case 'low':
            graphicsSettings.shadows = false;
            graphicsSettings.fog = false;
            graphicsSettings.particles = false;
            graphicsSettings.atmosphere = false;
            graphicsSettings.crows = false;
            graphicsSettings.dust = false;
            graphicsSettings.ash = false;
            graphicsSettings.bloodSplatter = false;
            graphicsSettings.screenShake = false;
            graphicsSettings.fpsLimit = 30;
            graphicsSettings.pixelRatio = 1;
            graphicsSettings.antialias = false;
            break;
        case 'medium':
            graphicsSettings.shadows = false;
            graphicsSettings.fog = true;
            graphicsSettings.particles = true;
            graphicsSettings.atmosphere = true;
            graphicsSettings.crows = true;
            graphicsSettings.dust = true;
            graphicsSettings.ash = false;
            graphicsSettings.bloodSplatter = true;
            graphicsSettings.screenShake = true;
            graphicsSettings.fpsLimit = 60;
            graphicsSettings.pixelRatio = 1;
            graphicsSettings.antialias = false;
            break;
        case 'high':
            graphicsSettings.shadows = false;
            graphicsSettings.fog = true;
            graphicsSettings.particles = true;
            graphicsSettings.atmosphere = true;
            graphicsSettings.crows = true;
            graphicsSettings.dust = true;
            graphicsSettings.ash = true;
            graphicsSettings.bloodSplatter = true;
            graphicsSettings.screenShake = true;
            graphicsSettings.fpsLimit = 60;
            graphicsSettings.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            graphicsSettings.antialias = false;
            break;
        case 'ultra':
            graphicsSettings.shadows = true;
            graphicsSettings.fog = true;
            graphicsSettings.particles = true;
            graphicsSettings.atmosphere = true;
            graphicsSettings.crows = true;
            graphicsSettings.dust = true;
            graphicsSettings.ash = true;
            graphicsSettings.bloodSplatter = true;
            graphicsSettings.screenShake = true;
            graphicsSettings.fpsLimit = 60;
            graphicsSettings.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            graphicsSettings.antialias = true;
            break;
    }
}

function saveGraphicsSettings() {
    try {
        localStorage.setItem('dbd_graphics_settings', JSON.stringify(graphicsSettings));
    } catch(e) {}
}

// Apply on init
applyGraphicsSettings();

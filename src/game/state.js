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

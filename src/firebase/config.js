// ═══════ FIREBASE CONFIG ═══════

const firebaseConfig = {
    apiKey: "AIzaSyClnLMd7bt99ngZU7UzSxnStvYD3WXdkew",
    authDomain: "dbdtg-d24d7.firebaseapp.com",
    databaseURL: "https://dbdtg-d24d7-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "dbdtg-d24d7",
    storageBucket: "dbdtg-d24d7.firebasestorage.app",
    messagingSenderId: "48938774159",
    appId: "1:48938774159:web:3beaea874e68ed07104afa"
};

// Инициализация Firebase
if (typeof firebase !== 'undefined') {
    try {
        firebase.initializeApp(firebaseConfig);
        window.fbDB = firebase.database();
        window.fbFS = firebase.firestore();
        window.firebaseLoaded = true;
        window.fsLoaded = true;
        console.log('Firebase initialized successfully');
    } catch (e) {
        console.error('Firebase initialization error:', e);
        window.firebaseLoaded = false;
        window.fsLoaded = false;
    }
} else {
    console.warn('Firebase SDK not loaded');
    window.firebaseLoaded = false;
    window.fsLoaded = false;
}

// ═══════ GAME CONFIG ═══════

const CONFIG = {
    ROOM_CODE_LENGTH: 6,
    MAX_PLAYERS: 4,
    MIN_PLAYERS_TO_START: 2,
    PLAYER_SPEED: 145,
    KILLER_SPEED: 162,
    INJURED_SPEED: 115,
    DYING_SPEED: 38,
    GENERATOR_COUNT: 5,
    GENERATOR_REPAIR_RATE: 100 / 28,
    GENERATOR_BREAK_RATE: 100 / 10,
    HEAL_RATE: 100 / 18,
    UNHOOK_RATE: 100 / 4,
    GATE_RATE: 100 / 20,
    HOOK_TIME: 90,
    STUN_TIME: 1.8,
    BOOST_TIME: 2.2,
    EXIT_OPEN_TIME: 15,
    CATCH_DISTANCE: 58,
    INTERACT_DISTANCE: 62,
    CATCH_COOLDOWN: 2
};

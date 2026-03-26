let auth;
let currentUser = null;
let userData = null;

async function initFirebaseAuth() {
    try {
        if (typeof firebase === 'undefined') {
            console.warn('Firebase SDK не загружен');
            return null;
        }
        
        auth = firebase.auth();
        
        const result = await auth.signInAnonymously();
        currentUser = result.user;
        
        userData = {
            uid: currentUser.uid,
            displayName: 'Игрок',
            createdAt: Date.now()
        };
        
        console.log('Анонимная авторизация:', currentUser.uid);
        return currentUser;
    } catch (error) {
        console.error('Ошибка авторизации:', error);
        return null;
    }
}

function getCurrentUser() {
    return currentUser;
}

function getUserData() {
    return userData;
}

function getTelegramUserId() {
    if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe) {
        const user = Telegram.WebApp.initDataUnsafe.user;
        if (user) {
            return user.id.toString();
        }
    }
    return null;
}

function setUserDisplayName(name) {
    if (userData) {
        userData.displayName = name;
    }
}
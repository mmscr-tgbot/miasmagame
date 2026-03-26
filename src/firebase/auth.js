let currentUser = null;
let userData = null;

function initFirebaseAuth() {
    currentUser = {
        uid: 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    };
    
    userData = {
        uid: currentUser.uid,
        displayName: 'Игрок',
        createdAt: Date.now()
    };
    
    console.log('Пользователь:', currentUser.uid);
    return Promise.resolve(currentUser);
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
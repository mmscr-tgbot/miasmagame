let firebaseReady = false;

async function initApp() {
    console.log('Инициализация приложения...');
    
    UI.init();
    
    UI.showScreen('loading');
    
    try {
        await initFirebaseApp();
        firebaseReady = true;
        console.log('Firebase инициализирован');
    } catch (e) {
        console.warn('Firebase недоступен, используем тестовый режим:', e);
        firebaseReady = false;
    }
    
    initTelegramWebApp();
    
    setTimeout(() => {
        UI.showScreen('mainMenu');
    }, 500);
    
    console.log('Приложение готово');
}

async function initFirebaseApp() {
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js';
    script.async = true;
    
    await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
    
    const analyticsScript = document.createElement('script');
    analyticsScript.src = 'https://www.gstatic.com/firebasejs/12.11.0/firebase-database-compat.js';
    analyticsScript.async = true;
    
    await new Promise((resolve, reject) => {
        analyticsScript.onload = resolve;
        analyticsScript.onerror = reject;
        document.head.appendChild(analyticsScript);
    });
    
    const authScript = document.createElement('script');
    authScript.src = 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth-compat.js';
    authScript.async = true;
    
    await new Promise((resolve, reject) => {
        authScript.onload = resolve;
        authScript.onerror = reject;
        document.head.appendChild(authScript);
    });
    
    if (typeof firebase !== 'undefined' && firebaseConfig) {
        firebase.initializeApp(firebaseConfig);
        
        await initFirebaseAuth();
        await initFirebaseDB();
    } else {
        throw new Error('Firebase не загружен');
    }
}

function initTelegramWebApp() {
    if (window.Telegram && Telegram.WebApp) {
        Telegram.WebApp.ready();
        
        Telegram.WebApp.expand();
        
        document.body.style.setProperty('--tg-viewport-height', Telegram.WebApp.viewportHeight + 'px');
        
        window.addEventListener('resize', () => {
            document.body.style.setProperty('--tg-viewport-height', Telegram.WebApp.viewportHeight + 'px');
        });
        
        if (Telegram.WebApp.initDataUnsafe && Telegram.WebApp.initDataUnsafe.user) {
            const user = Telegram.WebApp.initDataUnsafe.user;
            console.log('Пользователь Telegram:', user.first_name, user.id);
            
            setUserDisplayName(user.first_name || 'Игрок');
        }
        
        Telegram.WebApp.onEvent('viewportChanged', () => {
            document.body.style.setProperty('--tg-viewport-height', Telegram.WebApp.viewportHeight + 'px');
        });
        
        console.log('Telegram Web App инициализирован');
    } else {
        console.warn('Telegram Web App недоступен - работа в режиме браузера');
    }
}

function preventDefault(e) {
    if (e.cancelable) {
        e.preventDefault();
    }
}

document.addEventListener('touchmove', preventDefault, { passive: false });

document.addEventListener('gesturestart', preventDefault);
document.addEventListener('gesturechange', preventDefault);
document.addEventListener('gestureend', preventDefault);

document.addEventListener('DOMContentLoaded', initApp);

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initApp();
}

function showError(message) {
    console.error(message);
    UI.showToast(message);
}

window.addEventListener('error', (e) => {
    console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});
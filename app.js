let firebaseReady = false;

async function initApp() {
    console.log('Инициализация приложения...');
    
    UI.init();
    UI.showScreen('loading');
    
    if (typeof firebase !== 'undefined' && firebaseConfig) {
        try {
            firebase.initializeApp(firebaseConfig);
            await initFirebaseAuth();
            await initFirebaseDB();
            firebaseReady = true;
            console.log('Firebase готов');
        } catch (e) {
            console.error('Ошибка Firebase:', e);
            UI.showToast('Ошибка подключения');
        }
    } else {
        console.error('Firebase не загружен');
    }
    
    initTelegramWebApp();
    
    setTimeout(() => {
        UI.showScreen('mainMenu');
    }, 500);
    
    console.log('Приложение готово');
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
            console.log('Пользователь:', user.first_name, user.id);
            setUserDisplayName(user.first_name || 'Игрок');
        }
        
        Telegram.WebApp.onEvent('viewportChanged', () => {
            document.body.style.setProperty('--tg-viewport-height', Telegram.WebApp.viewportHeight + 'px');
        });
        
        console.log('Telegram Web App готов');
    } else {
        console.warn('Режим браузера');
    }
}

function preventDefault(e) {
    if (e.cancelable) e.preventDefault();
}

document.addEventListener('touchmove', preventDefault, { passive: false });
document.addEventListener('gesturestart', preventDefault);
document.addEventListener('gesturechange', preventDefault);
document.addEventListener('gestureend', preventDefault);

document.addEventListener('DOMContentLoaded', initApp);
if (document.readyState === 'complete' || document.readyState === 'interactive') initApp();

window.addEventListener('error', (e) => console.error('Error:', e.error));
window.addEventListener('unhandledrejection', (e) => console.error('Promise rejection:', e.reason));
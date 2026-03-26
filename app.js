async function loadScript(src) {
    console.log('Загрузка скрипта:', src);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            console.log('Загружено:', src);
            resolve();
        };
        script.onerror = () => {
            console.error('Ошибка загрузки:', src);
            reject(new Error('Failed to load: ' + src));
        };
        document.head.appendChild(script);
    });
}

async function initApp() {
    console.log('=== Инициализация приложения ===');
    
    UI.init();
    UI.showScreen('loading');
    
    const statusEl = document.getElementById('loading-status');
    
    try {
        statusEl.textContent = 'Загрузка Firebase SDK...';
        console.log('Загрузка Firebase скриптов...');
        
        await Promise.all([
            loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js'),
            loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js'),
            loadScript('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js')
        ]);
        
        console.log('Firebase скрипты загружены');
        console.log('firebase объект:', typeof firebase);
        
        if (typeof firebase === 'undefined') {
            throw new Error('firebase не определён!');
        }
        
        if (!firebaseConfig) {
            throw new Error('firebaseConfig не определён!');
        }
        
        statusEl.textContent = 'Инициализация Firebase...';
        console.log('Инициализация firebase...');
        firebase.initializeApp(firebaseConfig);
        console.log('firebase.initializeApp выполнен');
        
        statusEl.textContent = 'Подключение к базе...';
        await initFirebaseDB();
        
        statusEl.textContent = 'Готово!';
        console.log('=== Firebase полностью готов ===');
        
    } catch (e) {
        console.error('=== ОШИБКА ИНИЦИАЛИЗАЦИИ ===', e);
        if (statusEl) statusEl.textContent = 'Ошибка: ' + e.message;
    }
    
    initTelegramWebApp();
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    UI.showScreen('mainMenu');
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
            console.log('Пользователь Telegram:', user.first_name);
            setUserDisplayName(user.first_name || 'Игрок');
        }
        
        Telegram.WebApp.onEvent('viewportChanged', () => {
            document.body.style.setProperty('--tg-viewport-height', Telegram.WebApp.viewportHeight + 'px');
        });
        
        console.log('Telegram Web App готов');
    } else {
        console.log('Режим браузера');
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
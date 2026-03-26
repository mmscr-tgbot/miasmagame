function initApp() {
    console.log('Miasma Massacre');
    
    if (window.Telegram && Telegram.WebApp) {
        Telegram.WebApp.ready();
        Telegram.WebApp.expand();
    }
}

document.addEventListener('DOMContentLoaded', initApp);
window.initApp = function() {
    console.log('Starting...');
    
    function showMenu() {
        document.getElementById('loading-screen').style.display = 'none';
        document.getElementById('main-menu').style.display = 'flex';
    }
    
    function checkPhaser() {
        if (typeof Phaser !== 'undefined' && Phaser) {
            console.log('Phaser OK');
            showMenu();
            return true;
        }
        return false;
    }
    
    if (!checkPhaser()) {
        var attempts = 0;
        var interval = setInterval(function() {
            attempts++;
            console.log('Attempt ' + attempts);
            if (checkPhaser()) {
                clearInterval(interval);
            } else if (attempts > 20) {
                clearInterval(interval);
                var p = document.querySelector('#loading-screen p');
                if (p) p.textContent = 'Ошибка загрузки. Обновите страницу.';
            }
        }, 300);
    }
    
    var tg = document.createElement('script');
    tg.src = 'https://telegram.org/js/telegram-web-app.js';
    tg.onload = function() {
        try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch(e) {}
    };
    document.head.appendChild(tg);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initApp);
} else {
    window.initApp();
}
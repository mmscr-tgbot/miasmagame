window.initApp = function() {
    console.log('Miasma Massacre starting...');
    
    var checkCount = 0;
    function checkReady() {
        checkCount++;
        if (typeof Phaser !== 'undefined') {
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('main-menu').style.display = 'flex';
            console.log('Ready!');
            return;
        }
        if (checkCount < 50) {
            setTimeout(checkReady, 200);
        } else {
            document.querySelector('#loading-screen p').textContent = 'Ошибка загрузки';
        }
    }
    checkReady();
    
    var tgScript = document.createElement('script');
    tgScript.src = 'https://telegram.org/js/telegram-web-app.js';
    tgScript.onload = function() {
        if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
            try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch(e) {}
        }
    };
    document.head.appendChild(tgScript);
};

document.addEventListener('DOMContentLoaded', window.initApp);
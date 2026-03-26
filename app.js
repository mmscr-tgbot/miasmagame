function initApp() {
    console.log('Miasma Massacre starting...');
    
    const loadingText = document.querySelector('#loading-screen p');
    if (loadingText) loadingText.textContent = 'Загрузка...';
    
    function checkPhaser() {
        if (typeof Phaser !== 'undefined') {
            console.log('Phaser loaded!');
            setTimeout(() => {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('main-menu').style.display = 'flex';
            }, 500);
        } else {
            console.log('Waiting for Phaser...');
            setTimeout(checkPhaser, 100);
        }
    }
    
    setTimeout(checkPhaser, 500);
    
    if (window.Telegram && Telegram.WebApp) {
        try {
            Telegram.WebApp.ready();
            Telegram.WebApp.expand();
        } catch(e) {}
    }
}

document.addEventListener('DOMContentLoaded', initApp);
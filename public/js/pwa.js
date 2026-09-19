/**
 * ============================================================
 *  js/pwa.js - "download and install" without an app store
 * ============================================================
 *  This is what turns the website into something a shop owner
 *  can install on an Android phone, a tablet or a Windows
 *  laptop. Chrome fires the beforeinstallprompt event when the
 *  site qualifies; we catch it and show our own button.
 *
 *  For it to fire, the site must be served over HTTPS (or
 *  localhost while you develop), have a manifest, and register
 *  a service worker. All three are in place.
 * ============================================================
 */

let deferredInstallPrompt = null;

// ── Register the service worker ──
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('service-worker.js')
      .then(registration => {
        console.log('Offline support ready.', registration.scope);
      })
      .catch(error => {
        console.log('Service worker did not register:', error.message);
      });
  });
}


// ── Catch the install prompt and show our own button ──
window.addEventListener('beforeinstallprompt', function (event) {
  event.preventDefault();          // stop Chrome's default mini-bar
  deferredInstallPrompt = event;
  showInstallButton();
});

function showInstallButton() {
  if (document.getElementById('pwaInstallBtn')) return;

  const button = document.createElement('button');
  button.id = 'pwaInstallBtn';
  button.className = 'pwa-install-btn';
  button.innerHTML = '&#11015; Install App';

  button.addEventListener('click', async function () {
    if (!deferredInstallPrompt) return;

    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;

    if (choice.outcome === 'accepted') {
      button.remove();
    }

    deferredInstallPrompt = null;
  });

  document.body.appendChild(button);
}

// Once installed, the button has done its job
window.addEventListener('appinstalled', function () {
  const button = document.getElementById('pwaInstallBtn');
  if (button) button.remove();
  deferredInstallPrompt = null;
});


// ── Tell the user when the connection drops ──
window.addEventListener('offline', function () {
  showConnectionBanner('You are offline. Sales cannot be saved until you reconnect.');
});

window.addEventListener('online', function () {
  const banner = document.getElementById('connectionBanner');
  if (banner) banner.remove();
});

function showConnectionBanner(message) {
  if (document.getElementById('connectionBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'connectionBanner';
  banner.className = 'connection-banner';
  banner.textContent = message;
  document.body.appendChild(banner);
}


// ── Styles for the two things above ──
const pwaStyles = document.createElement('style');
pwaStyles.textContent = `
  .pwa-install-btn {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 9000;
    background: #006B3F;
    color: #fff;
    border: none;
    border-radius: 999px;
    padding: 12px 22px;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(0,0,0,0.2);
    cursor: pointer;
  }
  .pwa-install-btn:hover { background: #004d2c; }

  .connection-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9500;
    background: #CE1126;
    color: #fff;
    text-align: center;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 600;
  }

  @media print {
    .pwa-install-btn, .connection-banner { display: none !important; }
  }
`;
document.head.appendChild(pwaStyles);

(function () {
  'use strict';

  var installEvent = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = !!hidden;
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (e) {
      // Ignore SW failures (e.g. private mode).
    }
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function isStandalone() {
    // iOS Safari
    if (typeof navigator.standalone === 'boolean') return navigator.standalone;
    // Other browsers
    return window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  }

  function showIOSTip() {
    if (!isIOS() || isStandalone()) return;
    // iOS Safari doesn't fire beforeinstallprompt; show a lightweight tip.
    var id = 'iosInstallTip';
    if (document.getElementById(id)) return;

    var tip = document.createElement('div');
    tip.id = id;
    tip.setAttribute('role', 'status');
    tip.style.position = 'fixed';
    tip.style.left = '12px';
    tip.style.right = '12px';
    tip.style.bottom = 'calc(88px + env(safe-area-inset-bottom, 0px))';
    tip.style.zIndex = '120';
    tip.style.padding = '10px 12px';
    tip.style.borderRadius = '14px';
    tip.style.border = '1px solid rgba(0,0,0,0.10)';
    tip.style.background = 'rgba(255,255,255,0.92)';
    tip.style.backdropFilter = 'blur(10px)';
    tip.style.boxShadow = '0 14px 40px rgba(0,0,0,0.18)';
    tip.style.font = "600 13px/1.35 system-ui, -apple-system, 'Quicksand', sans-serif";
    tip.style.color = '#222';

    var msg = document.createElement('div');
    msg.textContent = 'iPhone/iPad：点击 Safari 分享按钮，然后选“添加到主屏幕”，即可像 App 一样使用。';

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = '知道了';
    close.style.marginTop = '8px';
    close.style.border = '1px solid rgba(0,0,0,0.14)';
    close.style.background = '#fff';
    close.style.borderRadius = '12px';
    close.style.padding = '8px 10px';
    close.style.font = "600 13px/1 'Quicksand', sans-serif";
    close.addEventListener('click', function () {
      tip.remove();
      try { localStorage.setItem(id, '1'); } catch (e) {}
    });

    try {
      if (localStorage.getItem(id) === '1') return;
    } catch (e) {}

    tip.appendChild(msg);
    tip.appendChild(close);
    document.body.appendChild(tip);
  }

  // Show an "Install" affordance only when the browser actually offers it.
  function setupInstallUI() {
    var btnInstall = byId('btnInstall');
    if (!btnInstall) return;

    setHidden(btnInstall, true);

    window.addEventListener('beforeinstallprompt', function (e) {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      installEvent = e;
      setHidden(btnInstall, false);
    });

    btnInstall.addEventListener('click', async function () {
      if (!installEvent) return;
      btnInstall.disabled = true;
      try {
        installEvent.prompt();
        await installEvent.userChoice;
      } catch (e) {
        // ignore
      } finally {
        installEvent = null;
        setHidden(btnInstall, true);
        btnInstall.disabled = false;
      }
    });
  }

  registerSW();
  setupInstallUI();
  showIOSTip();
})();

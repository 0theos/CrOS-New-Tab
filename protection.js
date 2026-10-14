/**
 * CrOS New Tab — Anti-Close Protection (beforeunload)
 *
 * Responsibilities:
 * 1. Synchronously intercept accidental tab or window closure using beforeunload.
 * 2. Read close protection preference (defaults to true) synchronously from localStorage.
 * 3. Respect user activation (navigator.userActivation.hasBeenActive) per Chromium MV3 specs.
 * 4. Transparently exempt intentional user actions:
 *    - Standard <a> anchor links
 *    - Desktop shortcuts (.shortcut, .ctx-menu-item, [data-url])
 *    - Form submissions (e.g. search bar)
 *    - Programmatic navigations via window.__crosNavigate(url) and window.__crosAllowNavigation()
 * 5. Sync storage state between chrome.storage.local and localStorage for zero-latency synchronous access.
 */

(() => {
  'use strict';

  let isNavigatingAway = false;

  // Expose global navigation helpers for features.js and internal modules
  if (typeof window !== 'undefined') {
    window.__crosNavigate = function(url) {
      isNavigatingAway = true;
      if (url) {
        window.location.href = url;
      }
    };

    window.__crosAllowNavigation = function() {
      isNavigatingAway = true;
    };

    window.__crosIsNavigatingAway = function() {
      return isNavigatingAway;
    };
  }

  // Track clicks on links, desktop shortcuts, and context menu actions
  document.addEventListener('click', (e) => {
    // 1. Standard <a> anchor links without download or target=_blank
    const link = e.target && e.target.closest && e.target.closest('a');
    if (link && link.href && !link.target && !link.hasAttribute('download')) {
      isNavigatingAway = true;
      return;
    }

    // 2. Desktop shortcuts (.shortcut), context menu items, and clickable app tiles
    if (e.target && e.target.closest && (
      e.target.closest('.shortcut') ||
      e.target.closest('.ctx-menu-item') ||
      e.target.closest('[data-url]') ||
      (e.target.className && typeof e.target.className === 'string' && e.target.className.includes('shortcut'))
    )) {
      isNavigatingAway = true;
    }
  }, true);

  // Track double clicks on desktop shortcuts
  document.addEventListener('dblclick', (e) => {
    if (e.target && e.target.closest && (
      e.target.closest('.shortcut') ||
      e.target.closest('[data-url]') ||
      (e.target.className && typeof e.target.className === 'string' && e.target.className.includes('shortcut'))
    )) {
      isNavigatingAway = true;
    }
  }, true);

  // Track keyboard activations (e.g. Enter on a desktop shortcut)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.closest && e.target.closest('.shortcut')) {
      isNavigatingAway = true;
    }
  }, true);

  // Track form submissions (e.g. search form)
  document.addEventListener('submit', () => {
    isNavigatingAway = true;
  }, true);

  // Reset navigation suppression flag if user stays on page (e.g. bfcache/pageshow)
  window.addEventListener('pageshow', () => {
    isNavigatingAway = false;
  });

  // Synchronous beforeunload event listener
  window.addEventListener('beforeunload', (e) => {
    // 1. Suppress prompt if user intentionally initiated navigation
    if (isNavigatingAway) return;

    // 2. Read setting from cached/storage state (default true)
    let closeProtectionEnabled = true;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem) {
        const v3 = JSON.parse(localStorage.getItem('cros_v3') || 'null');
        const v2 = JSON.parse(localStorage.getItem('cros_v2') || 'null');
        if (v3 && v3.closeProtection !== undefined) {
          closeProtectionEnabled = v3.closeProtection;
        } else if (v2 && v2.closeProtection !== undefined) {
          closeProtectionEnabled = v2.closeProtection;
        } else if (v2 && v2.antiClose !== undefined) {
          closeProtectionEnabled = v2.antiClose;
        }
      }
    } catch (_) {}

    if (!closeProtectionEnabled) return;

    // 3. User activation check per modern Chromium specification
    const hasInteracted = (typeof navigator !== 'undefined' && navigator.userActivation)
      ? navigator.userActivation.hasBeenActive
      : true;

    if (!hasInteracted) return;

    // 4. Prompt browser's native confirmation dialog
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  // Sync settings to localStorage for synchronous beforeunload reading
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(['cros_v3', 'cros_v2'], (res) => {
        try {
          if (typeof localStorage !== 'undefined' && localStorage.setItem) {
            if (res && res.cros_v3) localStorage.setItem('cros_v3', JSON.stringify(res.cros_v3));
            if (res && res.cros_v2) localStorage.setItem('cros_v2', JSON.stringify(res.cros_v2));
          }
        } catch (_) {}
      });
    } catch (_) {}

    try {
      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && typeof localStorage !== 'undefined' && localStorage.setItem) {
            if (changes && changes.cros_v3) localStorage.setItem('cros_v3', JSON.stringify(changes.cros_v3.newValue));
            if (changes && changes.cros_v2) localStorage.setItem('cros_v2', JSON.stringify(changes.cros_v2.newValue));
          }
        });
      }
    } catch (_) {}
  }
})();

/**
 * CrOS New Tab — Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 * 1. Synchronous top-level lifecycle event monitoring (chrome.tabs.onRemoved, chrome.windows.onRemoved).
 * 2. Anti-close protection: detect closure of last desktop newtab or window and immediately reopen desktop.
 * 3. Support internal runtime messaging (PING, GET_PROTECTION_STATUS, RESTORE_DESKTOP, PIN_CURRENT_TAB, CHECK_ACTIVE_TABS).
 * 4. Adhere to strict MV3 constraints: top-level synchronous listeners, persistent storage via chrome.storage.local,
 *    and comprehensive error handling without unhandled promise rejections.
 */

'use strict';

const NEWTAB_URL = chrome.runtime.getURL('newtab.html');

/**
 * Retrieve configuration settings from chrome.storage.local.
 * Supports cros_v3, cros_v2, and legacy cros_settings with safe defaults (protection enabled by default).
 *
 * @returns {Promise<{closeProtection: boolean, autoRestore: boolean, pinnedDesktop: boolean}>}
 */
async function getSettings() {
  try {
    const res = await chrome.storage.local.get(['cros_v3', 'cros_v2', 'cros_settings']);
    const v3 = res.cros_v3 || {};
    const v2 = res.cros_v2 || {};
    const s = res.cros_settings || {};

    // Prioritize cros_v3 -> cros_v2 -> cros_settings -> default true
    const closeProtection = v3.closeProtection !== undefined
      ? v3.closeProtection
      : (v2.closeProtection !== undefined
          ? v2.closeProtection
          : (s.closeProtection !== undefined
              ? s.closeProtection
              : (v2.antiClose !== undefined ? v2.antiClose : true)));

    const autoRestore = v3.autoRestore !== undefined
      ? v3.autoRestore
      : (v2.autoRestore !== undefined
          ? v2.autoRestore
          : (s.autoRestore !== undefined ? s.autoRestore : true));

    const pinnedDesktop = !!(v3.pinnedDesktop || v2.pinnedDesktop || s.pinnedDesktop);

    return {
      closeProtection: closeProtection !== false,
      autoRestore: autoRestore !== false,
      pinnedDesktop
    };
  } catch (err) {
    console.warn('[CrOS Background] Error reading storage settings:', err);
    return { closeProtection: true, autoRestore: true, pinnedDesktop: false };
  }
}

/**
 * Guarantees that at least one CrOS New Tab desktop is open and accessible.
 * If preferWindowId is provided, attempts to open in that window first.
 * If all normal windows are closed, creates a new normal browser window.
 *
 * @param {number|null} preferWindowId
 * @returns {Promise<chrome.tabs.Tab|chrome.windows.Window|null>}
 */
async function ensureDesktopOpen(preferWindowId = null) {
  try {
    // 1. Check if a desktop tab is already open anywhere
    const existingTabs = await chrome.tabs.query({ url: NEWTAB_URL });
    if (existingTabs.length > 0) {
      return existingTabs[0];
    }

    // 2. If a specific window was requested, try opening in it
    if (preferWindowId !== null) {
      try {
        return await chrome.tabs.create({
          windowId: preferWindowId,
          url: NEWTAB_URL
        });
      } catch (windowErr) {
        // Window may have already closed, fallback to querying existing windows
      }
    }

    // 3. Check for any surviving normal windows
    const openWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    if (openWindows.length > 0) {
      return await chrome.tabs.create({
        windowId: openWindows[0].id,
        url: NEWTAB_URL
      });
    }

    // 4. No normal windows exist — create a new window with the desktop
    return await chrome.windows.create({
      url: NEWTAB_URL,
      focused: true,
      type: 'normal'
    });
  } catch (err) {
    console.error('[CrOS Background] Error ensuring desktop open:', err);
    return null;
  }
}

/**
 * Mutex locks and debouncing timestamps to prevent runaway window or tab spawning bombs
 * during rapid, cascading, or concurrent close events.
 */
let isRestoringWindow = false;
let lastWindowRestoreTime = 0;
let isRestoringTab = false;
let lastTabRestoreTime = 0;
const RESTORE_DEBOUNCE_MS = 500;

/**
 * Safely restores a new desktop window when the last window closes.
 * Utilizes a mutex lock and cooldown debouncing to prevent window spawning cascades.
 *
 * @param {number|null} closingWindowId
 * @returns {Promise<chrome.windows.Window|null>}
 */
async function safelyResurrectWindow(closingWindowId = null) {
  const now = Date.now();
  if (isRestoringWindow || (now - lastWindowRestoreTime < RESTORE_DEBOUNCE_MS)) {
    return null;
  }
  isRestoringWindow = true;
  try {
    const allWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
    const remainingWindows = closingWindowId !== null
      ? allWindows.filter(w => w.id !== closingWindowId)
      : allWindows;

    if (remainingWindows.length === 0) {
      lastWindowRestoreTime = Date.now();
      return await chrome.windows.create({
        url: NEWTAB_URL,
        focused: true,
        type: 'normal'
      });
    }
    return null;
  } catch (err) {
    console.warn('[CrOS Background] Error resurrecting window:', err);
    return null;
  } finally {
    isRestoringWindow = false;
  }
}

/**
 * Safely restores a desktop tab in a window when no desktop tab remains open.
 * Utilizes mutex locking to prevent duplicate tab creation during concurrent closures.
 *
 * @param {number} windowId
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function safelyResurrectTab(windowId) {
  const now = Date.now();
  if (isRestoringTab || (now - lastTabRestoreTime < RESTORE_DEBOUNCE_MS)) {
    return null;
  }
  isRestoringTab = true;
  try {
    const desktopTabs = await chrome.tabs.query({ url: NEWTAB_URL });
    if (desktopTabs.length === 0) {
      lastTabRestoreTime = Date.now();
      return await chrome.tabs.create({
        windowId: windowId,
        url: NEWTAB_URL
      });
    }
    return null;
  } catch (err) {
    console.warn('[CrOS Background] Error resurrecting tab in window:', err);
    // Window may have closed concurrently, try window resurrection
    return await safelyResurrectWindow(windowId);
  } finally {
    isRestoringTab = false;
  }
}

// =============================================================================
// Top-Level Synchronous Event Listeners (Mandatory for Manifest V3 Service Worker)
// =============================================================================

/**
 * 1. chrome.tabs.onRemoved listener
 * Triggered when any tab is closed in any window.
 */
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    const settings = await getSettings();
    if (!settings.closeProtection && !settings.autoRestore) return;

    if (!removeInfo.isWindowClosing) {
      // The containing window is still open. Check if any desktop tab remains open across the browser.
      try {
        const desktopTabs = await chrome.tabs.query({ url: NEWTAB_URL });
        if (desktopTabs.length === 0) {
          // No desktop tab remains in any window — immediately restore desktop in this window
          await safelyResurrectTab(removeInfo.windowId);
        } else {
          // If desktop tabs exist in other windows, check if this window has run out of tabs
          const tabsInWindow = await chrome.tabs.query({ windowId: removeInfo.windowId });
          if (tabsInWindow.length === 0) {
            await chrome.tabs.create({
              windowId: removeInfo.windowId,
              url: NEWTAB_URL
            });
          }
        }
      } catch (queryErr) {
        // Window may have closed concurrently
        await safelyResurrectWindow(removeInfo.windowId);
      }
    } else {
      // The tab closure is causing the window itself to close.
      // Safely resurrect desktop window with debouncing / mutex guard.
      await safelyResurrectWindow(removeInfo.windowId);
    }
  } catch (err) {
    console.warn('[CrOS Background] Error in tabs.onRemoved listener:', err);
  }
});

/**
 * 2. chrome.windows.onRemoved listener
 * Triggered when a window is completely destroyed.
 */
chrome.windows.onRemoved.addListener(async (closedWindowId) => {
  try {
    const settings = await getSettings();
    if (!settings.closeProtection && !settings.autoRestore) return;

    await safelyResurrectWindow(closedWindowId);
  } catch (err) {
    console.warn('[CrOS Background] Error in windows.onRemoved listener:', err);
  }
});

/**
 * 3. chrome.runtime.onStartup listener
 * Triggered on browser startup.
 */
chrome.runtime.onStartup.addListener(async () => {
  try {
    const settings = await getSettings();
    if (settings.autoRestore) {
      await ensureDesktopOpen();
    }
  } catch (err) {
    console.warn('[CrOS Background] Error in onStartup listener:', err);
  }
});

/**
 * 4. chrome.runtime.onInstalled listener
 * Triggered on extension install or update.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    console.log(`[CrOS New Tab] Service Worker initialized (${details.reason || 'runtime'}).`);
    const settings = await getSettings();
    if (settings.autoRestore) {
      await ensureDesktopOpen();
    }
  } catch (err) {
    console.warn('[CrOS Background] Error in onInstalled listener:', err);
  }
});

/**
 * 5. chrome.runtime.onMessage listener
 * Handles internal messaging between newtab.html and background service worker.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  switch (message.action) {
    case 'PING':
      sendResponse({ status: 'OK', version: '0.3.0', timestamp: Date.now() });
      return false;

    case 'GET_PROTECTION_STATUS':
      getSettings()
        .then(settings => sendResponse({ success: true, settings }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true; // Keep message channel open for async response

    case 'RESTORE_DESKTOP':
      ensureDesktopOpen()
        .then(result => sendResponse({ success: true, result }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    case 'PIN_CURRENT_TAB':
      if (sender.tab && sender.tab.id) {
        chrome.tabs.update(sender.tab.id, { pinned: !!message.pinned })
          .then(tab => sendResponse({ success: true, tab }))
          .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
      }
      sendResponse({ success: false, error: 'No tab id in sender' });
      return false;

    case 'CHECK_ACTIVE_TABS':
      chrome.tabs.query({ url: NEWTAB_URL })
        .then(tabs => sendResponse({ success: true, count: tabs.length, tabs }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      return true;

    default:
      return false;
  }
});

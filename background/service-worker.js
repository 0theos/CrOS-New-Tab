/**
 * Background Service Worker (Manifest V3)
 * Handles extension lifecycle, context menus, and side panel coordination.
 */

// Lifecycle: onInstalled
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[CrOS Modular Assistant] Installed. Reason:', details.reason);

  // Set default side panel behavior if supported
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }

  // Create context menu actions
  if (chrome.contextMenus) {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'cros-save-selection-to-notes',
        title: '📝 Сохранить выделенное в заметки CrOS',
        contexts: ['selection']
      });

      chrome.contextMenus.create({
        id: 'cros-open-sidepanel',
        title: '📑 Открыть в боковой панели ChromeOS',
        contexts: ['page', 'action']
      });
    });
  }
});

// Context menu click listener
chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'cros-save-selection-to-notes' && info.selectionText) {
    const textToSave = info.selectionText;
    const hostname = tab?.url ? new URL(tab.url).hostname : 'Общие';
    const key = `notes_${hostname}`;

    // Append to existing notes
    chrome.storage.local.get([key], (data) => {
      const existing = data[key] || '';
      const updated = existing ? `${existing}\n\n• ${textToSave}` : `• ${textToSave}`;
      chrome.storage.local.set({ [key]: updated });
    });
  } else if (info.menuItemId === 'cros-open-sidepanel' && tab?.windowId) {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
    }
  }
});

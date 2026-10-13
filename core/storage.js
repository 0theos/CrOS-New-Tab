/**
 * Robust async storage wrapper with Chrome extension API and localStorage fallback.
 */

export const Storage = {
  async get(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
      });
    }
    // Fallback for non-extension context / dev preview
    const res = {};
    const keyList = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys || {});
    for (const k of keyList) {
      const val = localStorage.getItem(k);
      if (val !== null) {
        try {
          res[k] = JSON.parse(val);
        } catch {
          res[k] = val;
        }
      } else if (keys && typeof keys === 'object' && !Array.isArray(keys) && k in keys) {
        res[k] = keys[k];
      }
    }
    return res;
  },

  async set(items) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.set(items, () => resolve());
      });
    }
    for (const [k, v] of Object.entries(items)) {
      localStorage.setItem(k, JSON.stringify(v));
    }
  },

  async remove(keys) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.remove(keys, () => resolve());
      });
    }
    const keyList = Array.isArray(keys) ? keys : [keys];
    for (const k of keyList) {
      localStorage.removeItem(k);
    }
  }
};

/**
 * ChromeOS Theme Manager
 * Listens to system color scheme and applies Material 3 variables dynamically.
 */

import { Storage } from './storage.js';

export const ThemeManager = {
  currentMode: 'auto', // 'auto' | 'dark' | 'light'
  currentAccent: 'default', // 'default' | 'teal' | 'purple' | 'rose' | 'emerald'
  listeners: new Set(),
  mediaQuery: null,

  async init() {
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    // Listen to live system theme changes on ChromeOS
    this.mediaQuery.addEventListener('change', (e) => {
      if (this.currentMode === 'auto') {
        this.applyTheme();
        this.notifyListeners({
          isDark: e.matches,
          source: 'system'
        });
      }
    });

    // Load saved preferences
    const saved = await Storage.get({
      cros_theme_mode: 'auto',
      cros_theme_accent: 'default'
    });

    this.currentMode = saved.cros_theme_mode;
    this.currentAccent = saved.cros_theme_accent;
    this.applyTheme();
  },

  isSystemDark() {
    return this.mediaQuery ? this.mediaQuery.matches : window.matchMedia('(prefers-color-scheme: dark)').matches;
  },

  isCurrentlyDark() {
    if (this.currentMode === 'dark') return true;
    if (this.currentMode === 'light') return false;
    return this.isSystemDark();
  },

  applyTheme() {
    const root = document.documentElement;

    // Apply Mode
    if (this.currentMode === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', this.currentMode);
    }

    // Apply Accent
    if (this.currentAccent === 'default') {
      root.removeAttribute('data-accent');
    } else {
      root.setAttribute('data-accent', this.currentAccent);
    }
  },

  async setMode(mode) {
    if (!['auto', 'dark', 'light'].includes(mode)) return;
    this.currentMode = mode;
    await Storage.set({ cros_theme_mode: mode });
    this.applyTheme();
    this.notifyListeners({ mode, isDark: this.isCurrentlyDark() });
  },

  async setAccent(accent) {
    if (!['default', 'teal', 'purple', 'rose', 'emerald'].includes(accent)) return;
    this.currentAccent = accent;
    await Storage.set({ cros_theme_accent: accent });
    this.applyTheme();
    this.notifyListeners({ accent });
  },

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  },

  notifyListeners(data) {
    for (const cb of this.listeners) {
      try {
        cb(data);
      } catch (err) {
        console.error('Theme listener error:', err);
      }
    }
  }
};

/**
 * Side Panel Script
 * Adapts to active Chrome tabs dynamically as the user navigates.
 */

import { ThemeManager } from '../core/theme-manager.js';
import { registry } from '../modules/index.js';
import { Storage } from '../core/storage.js';

class SidePanelController {
  constructor() {
    this.activeModuleId = null;
    this.moduleContentEl = document.getElementById('module-content');
    this.moduleTabsEl = document.getElementById('module-tabs');
    this.themeIndicatorEl = document.getElementById('theme-indicator');
    this.activeTabInfoEl = document.getElementById('active-tab-info');
  }

  async start() {
    await ThemeManager.init();
    this.updateThemeIndicator();
    ThemeManager.subscribe(() => this.updateThemeIndicator());

    await registry.init();
    await this.loadActiveTabInfo();

    // Listen to tab changes in browser while side panel is open
    if (chrome.tabs && chrome.tabs.onActivated) {
      chrome.tabs.onActivated.addListener(async () => {
        await this.loadActiveTabInfo();
        // If current module relies on active tab (like quick notes), re-render
        if (this.activeModuleId) {
          this.switchModule(this.activeModuleId, false);
        }
      });
    }

    const saved = await Storage.get({ cros_last_active_module: null });
    const enabledModules = registry.getEnabled();

    if (enabledModules.length > 0) {
      const targetId = (saved.cros_last_active_module && registry.isEnabled(saved.cros_last_active_module))
        ? saved.cros_last_active_module
        : enabledModules[0].id;

      this.renderTabs(enabledModules, targetId);
      this.switchModule(targetId);
    }

    document.getElementById('btn-open-options')?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }

  updateThemeIndicator() {
    const isDark = ThemeManager.isCurrentlyDark();
    const mode = ThemeManager.currentMode;
    const modeLabel = mode === 'auto' ? 'Авто' : mode === 'dark' ? 'Темная' : 'Светлая';
    this.themeIndicatorEl.textContent = `${modeLabel} • ${isDark ? 'Тёмная' : 'Светлая'}`;
  }

  async loadActiveTabInfo() {
    try {
      if (chrome.tabs && chrome.tabs.query) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
          const u = new URL(tab.url);
          this.activeTabInfoEl.textContent = u.hostname || 'Chrome';
          return;
        }
      }
    } catch {
      // Ignored
    }
    this.activeTabInfoEl.textContent = 'ChromeOS';
  }

  renderTabs(modules, activeId) {
    this.moduleTabsEl.innerHTML = '';
    modules.forEach(mod => {
      const btn = document.createElement('button');
      btn.className = `cros-tab-btn ${mod.id === activeId ? 'active' : ''}`;
      btn.setAttribute('data-id', mod.id);
      btn.innerHTML = `<span>${mod.icon || '📦'}</span> <span>${mod.name}</span>`;

      btn.addEventListener('click', () => {
        this.switchModule(mod.id);
      });

      this.moduleTabsEl.appendChild(btn);
    });
  }

  async switchModule(id, shouldAnimate = true) {
    const mod = registry.get(id);
    if (!mod) return;

    this.activeModuleId = id;
    await Storage.set({ cros_last_active_module: id });

    this.moduleTabsEl.querySelectorAll('.cros-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-id') === id);
    });

    this.moduleContentEl.innerHTML = '';
    if (shouldAnimate) {
      this.moduleContentEl.className = 'cros-card animate-fade-in';
    }

    try {
      await mod.render(this.moduleContentEl, { registry });
    } catch (err) {
      this.moduleContentEl.innerHTML = `
        <div style="color:var(--cros-badge-danger-text); padding:10px;">
          Ошибка: ${err.message}
        </div>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const panel = new SidePanelController();
  panel.start();
});

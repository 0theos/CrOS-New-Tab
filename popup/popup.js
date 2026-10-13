/**
 * Popup Script
 * Initializes ThemeManager and Module Registry, handles tabs and view rendering.
 */

import { ThemeManager } from '../core/theme-manager.js';
import { registry } from '../modules/index.js';
import { Storage } from '../core/storage.js';

class PopupController {
  constructor() {
    this.activeModuleId = null;
    this.moduleContentEl = document.getElementById('module-content');
    this.moduleTabsEl = document.getElementById('module-tabs');
    this.themeIndicatorEl = document.getElementById('theme-indicator');
    this.activeTabInfoEl = document.getElementById('active-tab-info');
  }

  async start() {
    // 1. Initialize Theme Engine
    await ThemeManager.init();
    this.updateThemeIndicator();
    ThemeManager.subscribe(() => this.updateThemeIndicator());

    // 2. Initialize Module Registry
    await registry.init();

    // 3. Update current tab info
    await this.loadActiveTabInfo();

    // 4. Render tabs & active module
    const saved = await Storage.get({ cros_last_active_module: null });
    const enabledModules = registry.getEnabled();

    if (enabledModules.length > 0) {
      const targetId = (saved.cros_last_active_module && registry.isEnabled(saved.cros_last_active_module))
        ? saved.cros_last_active_module
        : enabledModules[0].id;

      this.renderTabs(enabledModules, targetId);
      this.switchModule(targetId);
    } else {
      this.moduleContentEl.innerHTML = `
        <div class="cros-caption" style="text-align:center; padding:20px;">
          Все модули отключены. Включите их в настройках.
        </div>
      `;
    }

    // 5. Action listeners
    document.getElementById('btn-open-options')?.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open(chrome.runtime.getURL('options/options.html'));
      }
    });

    document.getElementById('btn-open-sidepanel')?.addEventListener('click', async () => {
      try {
        if (chrome.sidePanel && chrome.sidePanel.open) {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab && tab.windowId) {
            await chrome.sidePanel.open({ windowId: tab.windowId });
            window.close();
          }
        }
      } catch (err) {
        console.warn('Sidepanel open error:', err);
      }
    });
  }

  updateThemeIndicator() {
    const isDark = ThemeManager.isCurrentlyDark();
    const mode = ThemeManager.currentMode;
    const modeLabel = mode === 'auto' ? 'Авто (CrOS)' : mode === 'dark' ? 'Темная' : 'Светлая';
    this.themeIndicatorEl.textContent = `${modeLabel} • ${isDark ? 'Тёмная' : 'Светлая'}`;
  }

  async loadActiveTabInfo() {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
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
      btn.setAttribute('role', 'tab');
      btn.setAttribute('data-id', mod.id);
      btn.innerHTML = `<span>${mod.icon || '📦'}</span> <span>${mod.name}</span>`;

      btn.addEventListener('click', () => {
        this.switchModule(mod.id);
      });

      this.moduleTabsEl.appendChild(btn);
    });
  }

  async switchModule(id) {
    const mod = registry.get(id);
    if (!mod) return;

    this.activeModuleId = id;
    await Storage.set({ cros_last_active_module: id });

    // Update tab classes
    this.moduleTabsEl.querySelectorAll('.cros-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-id') === id);
    });

    // Animate and render
    this.moduleContentEl.innerHTML = '';
    this.moduleContentEl.className = 'cros-card animate-fade-in';

    try {
      await mod.render(this.moduleContentEl, { registry });
    } catch (err) {
      this.moduleContentEl.innerHTML = `
        <div style="color:var(--cros-badge-danger-text); padding:10px;">
          Ошибка рендеринга модуля: ${err.message}
        </div>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const popup = new PopupController();
  popup.start();
});

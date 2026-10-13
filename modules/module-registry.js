/**
 * Module Registry & Lifecycle Manager
 * Handles discovery, activation, persistence, and execution of interaction modules.
 */

import { Storage } from '../core/storage.js';
import { events } from '../core/event-bus.js';

export class ModuleRegistry {
  constructor() {
    this.modules = new Map();
    this.enabledState = {};
    this.customModules = [];
    this.initialized = false;
  }

  /**
   * Register a module definition.
   */
  register(module) {
    if (!module || !module.id) {
      throw new Error('Module must have an id');
    }
    this.modules.set(module.id, module);
  }

  /**
   * Initialize module states from storage.
   */
  async init() {
    if (this.initialized) return;

    const data = await Storage.get({
      cros_enabled_modules: {},
      cros_user_custom_modules: []
    });

    this.enabledState = data.cros_enabled_modules || {};
    this.customModules = data.cros_user_custom_modules || [];

    // Register user custom modules dynamically
    for (const customMod of this.customModules) {
      this.registerCustomModule(customMod);
    }

    // Call init hook on enabled modules
    for (const [id, module] of this.modules.entries()) {
      if (this.isEnabled(id) && typeof module.init === 'function') {
        try {
          await module.init({ registry: this, events });
        } catch (err) {
          console.error(`Error initializing module "${id}":`, err);
        }
      }
    }

    this.initialized = true;
  }

  /**
   * Check if module is currently enabled.
   */
  isEnabled(id) {
    if (this.enabledState[id] !== undefined) {
      return Boolean(this.enabledState[id]);
    }
    const mod = this.modules.get(id);
    return mod ? mod.defaultEnabled !== false : true;
  }

  /**
   * Toggle module enabled state and save.
   */
  async setEnabled(id, isEnabled) {
    this.enabledState[id] = Boolean(isEnabled);
    await Storage.set({ cros_enabled_modules: this.enabledState });

    const mod = this.modules.get(id);
    if (mod) {
      if (isEnabled && typeof mod.init === 'function') {
        await mod.init({ registry: this, events });
      }
      events.emit('module:state-change', { id, enabled: isEnabled });
    }
  }

  /**
   * Get all registered modules.
   */
  getAll() {
    return Array.from(this.modules.values());
  }

  /**
   * Get enabled modules.
   */
  getEnabled() {
    return this.getAll().filter(m => this.isEnabled(m.id));
  }

  /**
   * Get module by ID.
   */
  get(id) {
    return this.modules.get(id);
  }

  /**
   * Helper to execute arbitrary code or functions in the active tab.
   */
  async executeInActiveTab(scriptFunction, ...args) {
    if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.scripting) {
      console.warn('Chrome tabs/scripting API is not available in current environment.');
      return null;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return null;

    // Check if URL is inspectable (skip chrome:// pages)
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://'))) {
      throw new Error('Нельзя внедрять скрипты на системные страницы браузера');
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scriptFunction,
      args: args
    });

    return results && results[0] ? results[0].result : null;
  }

  /**
   * Dynamically register a user-created custom snippet/module.
   */
  registerCustomModule(config) {
    const customMod = {
      id: config.id || `custom-${Date.now()}`,
      name: config.name || 'Пользовательский модуль',
      description: config.description || 'Модуль интеракции, созданный пользователем',
      icon: config.icon || '⚡',
      category: 'custom',
      isCustom: true,
      defaultEnabled: true,
      code: config.code || '',

      render(container, context) {
        container.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:8px;">
            <p class="cros-body-medium">${config.description || 'Пользовательский модуль'}</p>
            <button class="cros-btn cros-btn-primary" id="run-${this.id}">
              <span>${config.buttonLabel || 'Выполнить действие'}</span>
            </button>
            <div id="output-${this.id}" style="font-family:var(--cros-font-mono); font-size:11px; padding:6px; background:var(--cros-surface-variant); border-radius:var(--cros-radius-xs); display:none; word-break:break-all;"></div>
          </div>
        `;

        const btn = container.querySelector(`#run-${this.id}`);
        const out = container.querySelector(`#output-${this.id}`);

        btn.addEventListener('click', async () => {
          try {
            btn.disabled = true;
            btn.textContent = 'Выполняется...';
            // Evaluate in context of active tab
            const res = await context.registry.executeInActiveTab(
              (rawCode) => {
                try {
                  // Execute user script
                  const fn = new Function(rawCode);
                  return { success: true, result: fn() };
                } catch (e) {
                  return { success: false, error: e.message };
                }
              },
              config.code
            );

            out.style.display = 'block';
            if (res && res.success) {
              out.style.color = 'var(--cros-primary)';
              out.textContent = `Результат: ${typeof res.result === 'object' ? JSON.stringify(res.result) : res.result || 'Выполнено успешно!'}`;
            } else {
              out.style.color = 'var(--cros-badge-danger-text)';
              out.textContent = `Ошибка: ${res?.error || 'Не удалось выполнить'}`;
            }
          } catch (err) {
            out.style.display = 'block';
            out.style.color = 'var(--cros-badge-danger-text)';
            out.textContent = `Ошибка: ${err.message}`;
          } finally {
            btn.disabled = false;
            btn.textContent = config.buttonLabel || 'Выполнить действие';
          }
        });
      }
    };

    this.register(customMod);
    return customMod;
  }
}

export const registry = new ModuleRegistry();

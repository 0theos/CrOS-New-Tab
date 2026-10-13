/**
 * Options Controller
 * Handles settings, module toggles, theme adjustments, and configuration export/import.
 */

import { ThemeManager } from '../core/theme-manager.js';
import { registry } from '../modules/index.js';
import { Storage } from '../core/storage.js';

class OptionsController {
  constructor() {
    this.modulesListEl = document.getElementById('modules-list');
    this.statusChipEl = document.getElementById('status-chip');
    this.modulesCountEl = document.getElementById('modules-count');
  }

  async start() {
    await ThemeManager.init();
    await registry.init();

    this.initThemeControls();
    this.renderModules();
    this.initBackupControls();
  }

  flashStatus(msg) {
    this.statusChipEl.textContent = msg;
    this.statusChipEl.className = 'cros-badge cros-badge-success';
    setTimeout(() => {
      this.statusChipEl.textContent = 'Готово';
      this.statusChipEl.className = 'cros-badge cros-badge-info';
    }, 2000);
  }

  initThemeControls() {
    // Mode buttons
    const themeButtons = document.querySelectorAll('.theme-btn');
    const updateModeButtons = () => {
      themeButtons.forEach(btn => {
        const mode = btn.getAttribute('data-mode');
        if (mode === ThemeManager.currentMode) {
          btn.classList.remove('cros-btn-outlined');
          btn.classList.add('cros-btn-primary');
        } else {
          btn.classList.remove('cros-btn-primary');
          btn.classList.add('cros-btn-outlined');
        }
      });
    };

    themeButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.getAttribute('data-mode');
        await ThemeManager.setMode(mode);
        updateModeButtons();
        this.flashStatus('Тема сохранена');
      });
    });

    updateModeButtons();

    // Accent dots
    const accents = [
      { id: 'default', name: 'Синий (CrOS)', color: '#1a73e8' },
      { id: 'teal', name: 'Бирюзовый', color: '#00897b' },
      { id: 'purple', name: 'Фиолетовый', color: '#7c4dff' },
      { id: 'rose', name: 'Коралловый', color: '#e53935' },
      { id: 'emerald', name: 'Изумрудный', color: '#1e8e3e' }
    ];

    const accentContainer = document.getElementById('accent-selector');
    accentContainer.innerHTML = '';

    const updateAccentDots = () => {
      accentContainer.querySelectorAll('.accent-dot').forEach(dot => {
        const acc = dot.getAttribute('data-accent');
        const isActive = ThemeManager.currentAccent === acc;
        dot.style.borderColor = isActive ? 'var(--cros-on-surface)' : 'transparent';
        dot.style.transform = isActive ? 'scale(1.2)' : 'scale(1)';
      });
    };

    accents.forEach(acc => {
      const dot = document.createElement('button');
      dot.className = 'accent-dot';
      dot.title = acc.name;
      dot.setAttribute('data-accent', acc.id);
      dot.style.cssText = `
        width: 26px;
        height: 26px;
        border-radius: 50%;
        background-color: ${acc.color};
        border: 2px solid transparent;
        cursor: pointer;
        transition: transform 0.15s;
      `;

      dot.addEventListener('click', async () => {
        await ThemeManager.setAccent(acc.id);
        updateAccentDots();
        this.flashStatus('Акцент сохранен');
      });

      accentContainer.appendChild(dot);
    });

    updateAccentDots();
  }

  renderModules() {
    const modules = registry.getAll();
    this.modulesCountEl.textContent = `Всего: ${modules.length}`;
    this.modulesListEl.innerHTML = '';

    modules.forEach(mod => {
      const isEnabled = registry.isEnabled(mod.id);

      const row = document.createElement('div');
      row.className = 'module-row';
      row.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="module-icon">${mod.icon || '📦'}</div>
          <div>
            <div style="font-weight:500; font-size:13.5px; display:flex; align-items:center; gap:6px;">
              <span>${mod.name}</span>
              ${mod.isCustom ? '<span class="cros-badge cros-badge-info" style="font-size:10px;">Свой модуль</span>' : ''}
            </div>
            <div class="cros-caption" style="color:var(--cros-on-surface-variant); margin-top:2px;">
              ${mod.description}
            </div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <label class="cros-switch">
            <input type="checkbox" id="toggle-${mod.id}" ${isEnabled ? 'checked' : ''}>
            <span class="cros-slider"></span>
          </label>
        </div>
      `;

      const input = row.querySelector(`#toggle-${mod.id}`);
      input.addEventListener('change', async (e) => {
        await registry.setEnabled(mod.id, e.target.checked);
        this.flashStatus(`Модуль ${e.target.checked ? 'включен' : 'выключен'}`);
      });

      this.modulesListEl.appendChild(row);
    });
  }

  initBackupControls() {
    // Export
    document.getElementById('btn-export-data')?.addEventListener('click', async () => {
      const allData = await Storage.get(null);
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cros-modular-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.flashStatus('Резервная копия скачана');
    });

    // Import
    const fileInput = document.getElementById('import-file-input');
    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (typeof parsed === 'object' && parsed !== null) {
            await Storage.set(parsed);
            alert('Настройки успешно импортированы!');
            location.reload();
          }
        } catch (err) {
          alert('Ошибка чтения файла конфигурации: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const options = new OptionsController();
  options.start();
});

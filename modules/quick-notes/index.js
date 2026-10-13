/**
 * Quick Notes Module
 * Provides global notes and tab-specific scratchpads with instant auto-save.
 */

import { Storage } from '../../core/storage.js';

export const quickNotesModule = {
  id: 'quick-notes',
  name: 'Быстрые заметки',
  description: 'Автономный блокнот с привязкой к текущему сайту или глобальным заметкам',
  icon: '📝',
  category: 'productivity',
  defaultEnabled: true,

  async render(container, context) {
    const currentTab = await this.getCurrentTab();
    const hostname = currentTab && currentTab.url ? this.getHostname(currentTab.url) : 'Общие';

    // Fetch saved notes
    const storageKey = `notes_${hostname}`;
    const data = await Storage.get({
      [storageKey]: '',
      notes_global: ''
    });

    let activeTabMode = 'page'; // 'page' or 'global'

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; gap:4px; background:var(--cros-surface-variant); padding:2px; border-radius:var(--cros-radius-full);">
            <button class="cros-btn cros-btn-ghost" id="tab-page-note" style="padding:3px 10px; font-size:11px; border-radius:var(--cros-radius-full);">
              📌 ${hostname}
            </button>
            <button class="cros-btn cros-btn-ghost" id="tab-global-note" style="padding:3px 10px; font-size:11px; border-radius:var(--cros-radius-full);">
              🌐 Общие
            </button>
          </div>
          <span id="save-status" class="cros-caption" style="color:var(--cros-on-surface-variant);">Сохранено</span>
        </div>

        <textarea id="note-area" class="cros-textarea" placeholder="Напишите заметку..." style="min-height:90px;"></textarea>

        <div style="display:flex; justify-content:space-between; align-items:center;">
          <button class="cros-btn cros-btn-outlined" id="clear-note" style="padding:4px 8px; font-size:11px;">
            Очистить
          </button>
          <button class="cros-btn cros-btn-primary" id="copy-note" style="padding:4px 10px; font-size:11px;">
            Скопировать
          </button>
        </div>
      </div>
    `;

    const btnPage = container.querySelector('#tab-page-note');
    const btnGlobal = container.querySelector('#tab-global-note');
    const noteArea = container.querySelector('#note-area');
    const saveStatus = container.querySelector('#save-status');
    const btnClear = container.querySelector('#clear-note');
    const btnCopy = container.querySelector('#copy-note');

    const updateActiveButton = () => {
      if (activeTabMode === 'page') {
        btnPage.style.background = 'var(--cros-surface)';
        btnPage.style.color = 'var(--cros-primary)';
        btnPage.style.boxShadow = 'var(--cros-shadow-1)';
        btnGlobal.style.background = 'transparent';
        btnGlobal.style.color = 'var(--cros-on-surface-variant)';
        btnGlobal.style.boxShadow = 'none';
        noteArea.value = data[storageKey] || '';
      } else {
        btnGlobal.style.background = 'var(--cros-surface)';
        btnGlobal.style.color = 'var(--cros-primary)';
        btnGlobal.style.boxShadow = 'var(--cros-shadow-1)';
        btnPage.style.background = 'transparent';
        btnPage.style.color = 'var(--cros-on-surface-variant)';
        btnPage.style.boxShadow = 'none';
        noteArea.value = data.notes_global || '';
      }
    };

    updateActiveButton();

    let debounceTimer = null;
    noteArea.addEventListener('input', () => {
      saveStatus.textContent = 'Сохранение...';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const val = noteArea.value;
        if (activeTabMode === 'page') {
          data[storageKey] = val;
          await Storage.set({ [storageKey]: val });
        } else {
          data.notes_global = val;
          await Storage.set({ notes_global: val });
        }
        saveStatus.textContent = 'Сохранено ✓';
      }, 350);
    });

    btnPage.addEventListener('click', () => {
      activeTabMode = 'page';
      updateActiveButton();
    });

    btnGlobal.addEventListener('click', () => {
      activeTabMode = 'global';
      updateActiveButton();
    });

    btnClear.addEventListener('click', async () => {
      if (!confirm('Очистить эту заметку?')) return;
      noteArea.value = '';
      if (activeTabMode === 'page') {
        data[storageKey] = '';
        await Storage.set({ [storageKey]: '' });
      } else {
        data.notes_global = '';
        await Storage.set({ notes_global: '' });
      }
      saveStatus.textContent = 'Очищено';
    });

    btnCopy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(noteArea.value);
      btnCopy.textContent = 'Скопировано!';
      setTimeout(() => {
        btnCopy.textContent = 'Скопировать';
      }, 1500);
    });
  },

  async getCurrentTab() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return tab;
    }
    return null;
  },

  getHostname(url) {
    try {
      const u = new URL(url);
      return u.hostname || 'Текущая страница';
    } catch {
      return 'Текущая страница';
    }
  }
};

/**
 * ChromeOS Theme & Color Inspector Module
 * Allows dynamic theme switching, accent palette customization, and inspecting web page colors.
 */

import { ThemeManager } from '../../core/theme-manager.js';

export const colorInspectorModule = {
  id: 'color-inspector',
  name: 'Стиль & Цветовая гамма',
  description: 'Управление адаптивной темой ChromeOS, цветовыми акцентами Material You и пипетка цветов',
  icon: '🎨',
  category: 'appearance',
  defaultEnabled: true,

  render(container, context) {
    const accents = [
      { id: 'default', name: 'Синий (CrOS)', color: '#1a73e8' },
      { id: 'teal', name: 'Бирюзовый', color: '#00897b' },
      { id: 'purple', name: 'Фиолетовый', color: '#7c4dff' },
      { id: 'rose', name: 'Коралловый', color: '#e53935' },
      { id: 'emerald', name: 'Изумрудный', color: '#1e8e3e' }
    ];

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        <!-- Theme Mode Switcher -->
        <div>
          <div class="cros-body-medium" style="margin-bottom:6px; font-weight:500;">Режим темы:</div>
          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:6px;">
            <button class="cros-btn cros-btn-outlined" id="theme-mode-auto" style="padding:6px 4px; font-size:11.5px;">
              💻 Система
            </button>
            <button class="cros-btn cros-btn-outlined" id="theme-mode-light" style="padding:6px 4px; font-size:11.5px;">
              ☀️ Светлая
            </button>
            <button class="cros-btn cros-btn-outlined" id="theme-mode-dark" style="padding:6px 4px; font-size:11.5px;">
              🌙 Темная
            </button>
          </div>
        </div>

        <!-- Material You Accent Palette -->
        <div>
          <div class="cros-body-medium" style="margin-bottom:6px; font-weight:500;">Акцентная палитра (Material You):</div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${accents.map(acc => `
              <button class="accent-dot" data-accent="${acc.id}" title="${acc.name}" style="
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background-color: ${acc.color};
                border: 2px solid ${ThemeManager.currentAccent === acc.id ? 'var(--cros-on-surface)' : 'transparent'};
                cursor: pointer;
                transition: transform 0.15s;
              "></button>
            `).join('')}
          </div>
        </div>

        <!-- Inspect Page Palette -->
        <div style="border-top:1px solid var(--cros-divider); padding-top:10px;">
          <button class="cros-btn cros-btn-tonal" id="btn-inspect-palette" style="width:100%; font-size:12px;">
            🔍 Определить палитру активной страницы
          </button>
          <div id="palette-result" style="display:none; margin-top:8px;"></div>
        </div>
      </div>
    `;

    // Highlight active mode button
    const updateActiveButtons = () => {
      const mode = ThemeManager.currentMode;
      const modes = ['auto', 'light', 'dark'];
      modes.forEach(m => {
        const btn = container.querySelector(`#theme-mode-${m}`);
        if (!btn) return;
        if (m === mode) {
          btn.classList.remove('cros-btn-outlined');
          btn.classList.add('cros-btn-primary');
        } else {
          btn.classList.remove('cros-btn-primary');
          btn.classList.add('cros-btn-outlined');
        }
      });

      // Update accent dot borders
      container.querySelectorAll('.accent-dot').forEach(dot => {
        const acc = dot.getAttribute('data-accent');
        dot.style.borderColor = (ThemeManager.currentAccent === acc) ? 'var(--cros-on-surface)' : 'transparent';
        dot.style.transform = (ThemeManager.currentAccent === acc) ? 'scale(1.15)' : 'scale(1)';
      });
    };

    updateActiveButtons();

    // Event listeners for modes
    container.querySelector('#theme-mode-auto').addEventListener('click', () => {
      ThemeManager.setMode('auto');
      updateActiveButtons();
    });
    container.querySelector('#theme-mode-light').addEventListener('click', () => {
      ThemeManager.setMode('light');
      updateActiveButtons();
    });
    container.querySelector('#theme-mode-dark').addEventListener('click', () => {
      ThemeManager.setMode('dark');
      updateActiveButtons();
    });

    // Accent selection
    container.querySelectorAll('.accent-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const acc = dot.getAttribute('data-accent');
        ThemeManager.setAccent(acc);
        updateActiveButtons();
      });
    });

    // Page palette extraction
    const inspectBtn = container.querySelector('#btn-inspect-palette');
    const palResult = container.querySelector('#palette-result');

    inspectBtn.addEventListener('click', async () => {
      try {
        inspectBtn.disabled = true;
        inspectBtn.textContent = 'Анализ стилей...';

        const colors = await context.registry.executeInActiveTab(() => {
          const bodyStyle = window.getComputedStyle(document.body);
          const bg = bodyStyle.backgroundColor;
          const color = bodyStyle.color;

          // Collect unique colors from first 50 elements
          const set = new Set();
          if (bg && bg !== 'rgba(0, 0, 0, 0)') set.add(bg);
          if (color) set.add(color);

          const elems = document.querySelectorAll('header, nav, button, a, h1, h2');
          for (let i = 0; i < Math.min(elems.length, 30); i++) {
            const cs = window.getComputedStyle(elems[i]);
            if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') set.add(cs.backgroundColor);
            if (cs.color) set.add(cs.color);
          }
          return Array.from(set).slice(0, 6);
        });

        palResult.style.display = 'block';
        if (colors && colors.length > 0) {
          palResult.innerHTML = `
            <div class="cros-caption" style="margin-bottom:6px;">Палитра сайта:</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              ${colors.map(c => `
                <div style="display:flex; align-items:center; gap:4px; background:var(--cros-surface-variant); padding:3px 6px; border-radius:var(--cros-radius-xs); font-size:10px;">
                  <span style="width:12px; height:12px; border-radius:3px; background:${c}; border:1px solid var(--cros-outline); display:inline-block;"></span>
                  <span>${c}</span>
                </div>
              `).join('')}
            </div>
          `;
        } else {
          palResult.innerHTML = `<span class="cros-caption">Не удалось получить цвета страницы.</span>`;
        }
      } catch (err) {
        palResult.style.display = 'block';
        palResult.innerHTML = `<span class="cros-caption" style="color:var(--cros-badge-danger-text);">Ошибка: ${err.message}</span>`;
      } finally {
        inspectBtn.disabled = false;
        inspectBtn.textContent = '🔍 Определить палитру активной страницы';
      }
    });
  }
};

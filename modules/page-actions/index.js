/**
 * Page Actions Module
 * Provides rich page interactions, inspection, and manipulation tools.
 */

export const pageActionsModule = {
  id: 'page-actions',
  name: 'Интеракция со страницей',
  description: 'Инструменты взаимодействия с открытой вкладкой: markdown ссылки, режим чтения, анализ текста',
  icon: '⚡',
  category: 'interaction',
  defaultEnabled: true,

  render(container, context) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <button class="cros-btn cros-btn-tonal" id="action-copy-md" style="font-size:11.5px; padding:8px 6px;">
            📋 Markdown ссылка
          </button>
          <button class="cros-btn cros-btn-tonal" id="action-stats" style="font-size:11.5px; padding:8px 6px;">
            📊 Анализ текста
          </button>
          <button class="cros-btn cros-btn-tonal" id="action-dark-toggle" style="font-size:11.5px; padding:8px 6px;">
            🌓 Ночной фильтр
          </button>
          <button class="cros-btn cros-btn-tonal" id="action-highlight-links" style="font-size:11.5px; padding:8px 6px;">
            🔗 Подсветка ссылок
          </button>
        </div>

        <div id="page-action-output" style="display:none; padding:10px; border-radius:var(--cros-radius-sm); background:var(--cros-surface-variant); font-size:12px; line-height:1.4;">
        </div>
      </div>
    `;

    const out = container.querySelector('#page-action-output');
    const showOutput = (html) => {
      out.style.display = 'block';
      out.innerHTML = html;
    };

    // 1. Copy Markdown Link
    container.querySelector('#action-copy-md').addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;
        const md = `[${tab.title || 'Ссылка'}](${tab.url})`;
        await navigator.clipboard.writeText(md);
        showOutput(`
          <div style="color:var(--cros-primary); font-weight:500;">✓ Скопировано в буфер обмена:</div>
          <code style="display:block; margin-top:4px; font-family:var(--cros-font-mono); font-size:11px; word-break:break-all;">${md}</code>
        `);
      } catch (err) {
        showOutput(`<div style="color:var(--cros-badge-danger-text);">Ошибка: ${err.message}</div>`);
      }
    });

    // 2. Page Stats
    container.querySelector('#action-stats').addEventListener('click', async () => {
      try {
        showOutput('<em>Анализируем страницу...</em>');
        const stats = await context.registry.executeInActiveTab(() => {
          const text = document.body ? document.body.innerText || '' : '';
          const words = text.trim() ? text.trim().split(/\s+/).length : 0;
          const chars = text.length;
          const readTimeMinutes = Math.max(1, Math.ceil(words / 200));
          const headings = document.querySelectorAll('h1, h2, h3').length;
          const links = document.querySelectorAll('a[href]').length;
          const images = document.querySelectorAll('img').length;

          return { words, chars, readTimeMinutes, headings, links, images };
        });

        if (stats) {
          showOutput(`
            <div style="font-weight:600; margin-bottom:6px; color:var(--cros-on-surface);">Статистика страницы:</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
              <div>• <b>${stats.words.toLocaleString()}</b> слов</div>
              <div>• <b>${stats.chars.toLocaleString()}</b> знаков</div>
              <div>• ~<b>${stats.readTimeMinutes}</b> мин. чтения</div>
              <div>• <b>${stats.headings}</b> заголовков</div>
              <div>• <b>${stats.links}</b> ссылок</div>
              <div>• <b>${stats.images}</b> изображений</div>
            </div>
          `);
        }
      } catch (err) {
        showOutput(`<div style="color:var(--cros-badge-danger-text);">Ошибка: ${err.message}</div>`);
      }
    });

    // 3. Dark Filter Toggle
    container.querySelector('#action-dark-toggle').addEventListener('click', async () => {
      try {
        const isDark = await context.registry.executeInActiveTab(() => {
          const id = '__cros_dark_filter_style';
          let el = document.getElementById(id);
          if (el) {
            el.remove();
            return false;
          } else {
            el = document.createElement('style');
            el.id = id;
            el.textContent = `
              html {
                filter: invert(90%) hue-rotate(180deg) !important;
                background: #111 !important;
              }
              img, video, canvas, svg, [style*="background-image"] {
                filter: invert(100%) hue-rotate(180deg) !important;
              }
            `;
            document.head.appendChild(el);
            return true;
          }
        });

        showOutput(`
          <div style="color:var(--cros-primary); font-weight:500;">
            ${isDark ? '🌙 Ночной фильтр страницы включен' : '☀️ Ночной фильтр страницы отключен'}
          </div>
        `);
      } catch (err) {
        showOutput(`<div style="color:var(--cros-badge-danger-text);">Ошибка: ${err.message}</div>`);
      }
    });

    // 4. Highlight Links
    container.querySelector('#action-highlight-links').addEventListener('click', async () => {
      try {
        const count = await context.registry.executeInActiveTab(() => {
          const links = document.querySelectorAll('a[href]');
          const id = '__cros_links_highlight_style';
          let el = document.getElementById(id);
          if (el) {
            el.remove();
            return 0;
          } else {
            el = document.createElement('style');
            el.id = id;
            el.textContent = `
              a[href] {
                outline: 2px dashed #1a73e8 !important;
                background-color: rgba(26, 115, 232, 0.15) !important;
                transition: outline 0.2s !important;
              }
            `;
            document.head.appendChild(el);
            return links.length;
          }
        });

        if (count > 0) {
          showOutput(`<div style="color:var(--cros-primary);">Подсвечено <b>${count}</b> ссылок на странице. Повторный клик снимает подсветку.</div>`);
        } else {
          showOutput(`<div>Подсветка ссылок отключена.</div>`);
        }
      } catch (err) {
        showOutput(`<div style="color:var(--cros-badge-danger-text);">Ошибка: ${err.message}</div>`);
      }
    });
  }
};

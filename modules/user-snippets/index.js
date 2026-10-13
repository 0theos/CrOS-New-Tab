/**
 * User Snippets & Custom Module Creator
 * Allows users to visually create and run their own interactive modules on web pages.
 */

import { Storage } from '../../core/storage.js';

export const userSnippetsModule = {
  id: 'user-snippets',
  name: 'Конструктор модулей',
  description: 'Создание собственных модулей интеракции с JavaScript-сценариями для страниц',
  icon: '🧩',
  category: 'custom',
  defaultEnabled: true,

  async render(container, context) {
    const data = await Storage.get({
      cros_user_custom_modules: []
    });

    let modulesList = data.cros_user_custom_modules || [];

    const renderView = () => {
      container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="cros-caption">Пользовательские модули (${modulesList.length})</span>
            <button class="cros-btn cros-btn-tonal" id="btn-new-snippet" style="font-size:11px; padding:3px 8px;">
              + Добавить модуль
            </button>
          </div>

          <!-- Creation Form (hidden by default) -->
          <div id="new-snippet-form" style="display:none; flex-direction:column; gap:8px; padding:10px; background:var(--cros-surface-variant); border-radius:var(--cros-radius-md); border:1px solid var(--cros-outline-variant);">
            <div style="font-weight:500; font-size:12px;">Новый модуль интеракции:</div>
            
            <div style="display:flex; gap:6px;">
              <input type="text" id="custom-icon" class="cros-input" placeholder="Иконка (напр. 🚀)" value="🚀" style="width:70px; text-align:center;">
              <input type="text" id="custom-name" class="cros-input" placeholder="Название (напр. Скролл наверх)">
            </div>

            <input type="text" id="custom-desc" class="cros-input" placeholder="Описание действия">

            <textarea id="custom-code" class="cros-textarea" placeholder="// JS код, исполняемый на странице:
window.scrollTo({top: 0, behavior: 'smooth'});
return 'Прокручено наверх!';" style="font-family:var(--cros-font-mono); font-size:11px; min-height:70px;"></textarea>

            <div style="display:flex; justify-content:flex-end; gap:6px;">
              <button class="cros-btn cros-btn-ghost" id="btn-cancel-snippet" style="font-size:11px;">Отмена</button>
              <button class="cros-btn cros-btn-primary" id="btn-save-snippet" style="font-size:11px;">Сохранить модуль</button>
            </div>
          </div>

          <!-- List of created snippets -->
          <div id="snippets-list" style="display:flex; flex-direction:column; gap:6px;">
            ${modulesList.length === 0 ? `
              <div class="cros-caption" style="text-align:center; padding:12px; color:var(--cros-on-surface-variant);">
                Пока нет созданных модулей. Нажмите "+ Добавить модуль", чтобы создать кнопку с вашим действием для сайтов!
              </div>
            ` : modulesList.map((m, idx) => `
              <div class="cros-card" style="padding:8px; display:flex; justify-content:space-between; align-items:center; background:var(--cros-surface-variant);">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                  <span style="font-size:16px;">${m.icon || '⚡'}</span>
                  <div style="overflow:hidden;">
                    <div style="font-weight:500; font-size:12px; text-overflow:ellipsis; white-space:nowrap; overflow:hidden;">${m.name}</div>
                    <div class="cros-caption" style="text-overflow:ellipsis; white-space:nowrap; overflow:hidden;">${m.description || 'JS сценарий'}</div>
                  </div>
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0;">
                  <button class="cros-btn cros-btn-primary btn-run-custom" data-idx="${idx}" style="padding:4px 8px; font-size:11px;">
                    Запуск
                  </button>
                  <button class="cros-btn cros-btn-ghost btn-del-custom" data-idx="${idx}" style="padding:4px 6px; font-size:11px; color:var(--cros-badge-danger-text);" title="Удалить">
                    ✕
                  </button>
                </div>
              </div>
            `).join('')}
          </div>

          <div id="custom-output" style="display:none; padding:8px; border-radius:var(--cros-radius-xs); background:var(--cros-surface-variant); font-size:11px; font-family:var(--cros-font-mono);"></div>
        </div>
      `;

      // Wire events
      const form = container.querySelector('#new-snippet-form');
      const btnNew = container.querySelector('#btn-new-snippet');
      const btnCancel = container.querySelector('#btn-cancel-snippet');
      const btnSave = container.querySelector('#btn-save-snippet');
      const out = container.querySelector('#custom-output');

      btnNew.addEventListener('click', () => {
        form.style.display = form.style.display === 'none' ? 'flex' : 'none';
      });

      btnCancel.addEventListener('click', () => {
        form.style.display = 'none';
      });

      btnSave.addEventListener('click', async () => {
        const name = container.querySelector('#custom-name').value.trim();
        const icon = container.querySelector('#custom-icon').value.trim() || '⚡';
        const desc = container.querySelector('#custom-desc').value.trim();
        const code = container.querySelector('#custom-code').value.trim();

        if (!name || !code) {
          alert('Укажите название и JavaScript код модуля.');
          return;
        }

        const newMod = {
          id: `custom_${Date.now()}`,
          name,
          icon,
          description: desc,
          code,
          created: new Date().toISOString()
        };

        modulesList.push(newMod);
        await Storage.set({ cros_user_custom_modules: modulesList });
        context.registry.registerCustomModule(newMod);

        renderView();
      });

      // Run buttons
      container.querySelectorAll('.btn-run-custom').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          const mod = modulesList[idx];
          if (!mod) return;

          out.style.display = 'block';
          out.textContent = `Запуск "${mod.name}"...`;

          try {
            const res = await context.registry.executeInActiveTab((scriptCode) => {
              try {
                const fn = new Function(scriptCode);
                return { ok: true, result: fn() };
              } catch (e) {
                return { ok: false, error: e.message };
              }
            }, mod.code);

            if (res && res.ok) {
              out.style.color = 'var(--cros-primary)';
              out.textContent = `✓ [${mod.name}]: ${res.result !== undefined ? JSON.stringify(res.result) : 'Успешно выполнено'}`;
            } else {
              out.style.color = 'var(--cros-badge-danger-text)';
              out.textContent = `✗ Ошибка: ${res?.error || 'Не удалось выполнить'}`;
            }
          } catch (err) {
            out.style.color = 'var(--cros-badge-danger-text)';
            out.textContent = `✗ Ошибка: ${err.message}`;
          }
        });
      });

      // Delete buttons
      container.querySelectorAll('.btn-del-custom').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          if (confirm(`Удалить модуль "${modulesList[idx].name}"?`)) {
            modulesList.splice(idx, 1);
            await Storage.set({ cros_user_custom_modules: modulesList });
            renderView();
          }
        });
      });
    };

    renderView();
  }
};

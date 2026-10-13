/**
 * ШАБЛОН ПОЛЬЗОВАТЕЛЬСКОГО МОДУЛЯ (Module Template)
 * 
 * Скопируйте этот файл в новую папку, например: `modules/my-cool-module/index.js`
 * Затем подключите его в `modules/index.js`:
 *   import { myCoolModule } from './my-cool-module/index.js';
 *   registry.register(myCoolModule);
 */

export const templateModule = {
  // Уникальный идентификатор модуля (латиница, дефисы)
  id: 'template-module',

  // Человекочитаемое название в интерфейсе ChromeOS
  name: 'Мой новый модуль',

  // Краткое описание назначения
  description: 'Пример пользовательского модуля интеракции',

  // Иконка (эмодзи или SVG строка)
  icon: '⚡',

  // Категория: 'interaction' | 'productivity' | 'appearance' | 'tools'
  category: 'interaction',

  // Включен ли по умолчанию при первом запуске
  defaultEnabled: true,

  /**
   * Опциональный метод инициализации (вызывается 1 раз при загрузке расширения)
   * @param {Object} context - { registry, events }
   */
  async init(context) {
    console.log(`[${this.name}] инициализирован`);
  },

  /**
   * Отрисовка интерфейса модуля в Popup окне или боковой панели ChromeOS (Side Panel)
   * @param {HTMLElement} container - DOM-элемент, куда модуль вставляет свой HTML
   * @param {Object} context - { registry, events, currentTab }
   */
  async render(container, context) {
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:8px;">
        <p class="cros-body-medium">
          Привет! Это новый кастомный модуль.
        </p>

        <button class="cros-btn cros-btn-primary" id="btn-example-action">
          🚀 Выполнить действие на странице
        </button>

        <div id="action-feedback" class="cros-caption" style="display:none;"></div>
      </div>
    `;

    const btn = container.querySelector('#btn-example-action');
    const feedback = container.querySelector('#action-feedback');

    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true;

        // Пример вызова кода на активной веб-странице
        const result = await context.registry.executeInActiveTab(() => {
          // Этот код исполняется внутри DOM открытой вкладки браузера:
          const title = document.title;
          const url = location.href;
          return `Страница: ${title} (${url})`;
        });

        feedback.style.display = 'block';
        feedback.style.color = 'var(--cros-primary)';
        feedback.textContent = `Результат: ${result}`;
      } catch (err) {
        feedback.style.display = 'block';
        feedback.style.color = 'var(--cros-badge-danger-text)';
        feedback.textContent = `Ошибка: ${err.message}`;
      } finally {
        btn.disabled = false;
      }
    });
  },

  /**
   * Опциональный хук очистки при размонтировании
   */
  destroy(container) {
    container.innerHTML = '';
  }
};

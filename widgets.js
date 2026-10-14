/**
 * CrOS New Tab — Modular Widget System (v0.3.0)
 *
 * Architecture & Features:
 * 1. Global registry (window.CrosWidgets / window.WidgetRegistry).
 * 2. Clock & Date widget (24h/12h AM/PM, seconds toggle, date localization, tab-nums typography).
 * 3. Preserved & enhanced v0.2 widgets: note, todo, countdown, embed.
 * 4. Extensible slots for weather, calendar, gmail, drive, news widgets.
 * 5. Full lifecycle: add, remove, toggle enable/disable, pointer-capture drag & drop, ResizeObserver resizing.
 * 6. Boundary clamping: prevents widgets from being placed or dragged outside the viewport.
 * 7. Debounced persistence synchronized with chrome.storage.local / cros_v3.
 */

(() => {
  'use strict';

  const MIN_WIDTH = 120;
  const MIN_HEIGHT = 80;
  const DEFAULT_WIDTH = 280;
  const DEFAULT_HEIGHT = 180;
  const GRID_STEP = 20;

  const snapToGrid = (val, step = GRID_STEP) => Math.round(val / step) * step;

  // DOM helper
  const el = (tag, props = {}, ...children) => {
    if (typeof document === 'undefined') return { append: () => {}, setAttribute: () => {}, style: {}, classList: { add: () => {}, toggle: () => {} }, addEventListener: () => {} };
    const node = Object.assign(document.createElement(tag), props);
    children.forEach((c) => {
      if (c != null) node.append(c);
    });
    return node;
  };

  const uid = (prefix = 'w') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  // Safe URL sanitizer
  const safeUrl = (u) => {
    try {
      const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null;
    } catch {
      return null;
    }
  };

  // Viewport coordinate and dimension clamping
  function clampCoords(x, y) {
    const winW = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1920;
    const winH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1080;
    const maxX = Math.max(0, winW - 60);
    const maxY = Math.max(0, winH - 40);
    return {
      x: Math.max(0, Math.min(maxX, Math.round(Number(x) || 0))),
      y: Math.max(0, Math.min(maxY, Math.round(Number(y) || 0)))
    };
  }

  function clampDimensions(w, h) {
    const winW = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : 1920;
    const winH = (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 1080;
    const maxW = Math.max(MIN_WIDTH, winW);
    const maxH = Math.max(MIN_HEIGHT, winH);
    return {
      w: Math.max(MIN_WIDTH, Math.min(maxW, Math.round(Number(w) || DEFAULT_WIDTH))),
      h: Math.max(MIN_HEIGHT, Math.min(maxH, Math.round(Number(h) || DEFAULT_HEIGHT)))
    };
  }

  /**
   * Reference time formatter adhering to PROJECT.md §Interface Contracts & test specs.
   * @param {Date|number|string} date
   * @param {boolean} [format24h=true]
   * @param {boolean} [showSeconds=false]
   * @returns {string}
   */
  function formatTime(date, format24h = true, showSeconds = false) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const seconds = d.getSeconds();

    if (format24h) {
      const hh = String(hours).padStart(2, '0');
      const mm = String(minutes).padStart(2, '0');
      if (showSeconds) {
        const ss = String(seconds).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
      }
      return `${hh}:${mm}`;
    } else {
      const h12 = hours % 12 || 12;
      const mm = String(minutes).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      if (showSeconds) {
        const ss = String(seconds).padStart(2, '0');
        return `${h12}:${mm}:${ss} ${ampm}`;
      }
      return `${h12}:${mm} ${ampm}`;
    }
  }

  /**
   * Localized date formatter.
   * @param {Date|number|string} date
   * @param {string} [locale='ru-RU']
   * @returns {string}
   */
  function formatDate(date, locale) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    const loc = locale || (typeof navigator !== 'undefined' && navigator.language) || 'ru-RU';
    try {
      const formatter = new Intl.DateTimeFormat(loc, {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
      const str = formatter.format(d);
      return str.charAt(0).toUpperCase() + str.slice(1);
    } catch (_) {
      return d.toDateString();
    }
  }

  // Active timers and observers across widget instances
  const activeTimers = new Set();
  const activeObservers = new Set();
  let zTop = 20;

  /**
   * Core Widget Registry & Controller
   */
  class CrosWidgetEngine {
    constructor() {
      this.registry = new Map();
      this.container = null;
      this.getWidgetsFn = () => [];
      this.onSaveFn = () => {};
      this.saveDebounceTimer = null;
      this.isInitialized = false;

      this.registerBuiltInWidgets();
    }

    /**
     * Debounced save callback trigger
     */
    triggerSave() {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = setTimeout(() => {
        try {
          this.onSaveFn();
        } catch (e) {
          console.warn('[CrosWidgets] Save failed:', e);
        }
      }, 250);
    }

    /**
     * Register a new widget type
     */
    register(type, definition) {
      if (!type || typeof type !== 'string') {
        throw new Error('Widget type must be a non-empty string');
      }
      this.registry.set(type, {
        type,
        title: definition.title || type,
        icon: definition.icon || '🧩',
        description: definition.description || '',
        defaultW: definition.defaultW || DEFAULT_WIDTH,
        defaultH: definition.defaultH || DEFAULT_HEIGHT,
        defaultConfig: definition.defaultConfig || {},
        render: definition.render || (() => {}),
        onDestroy: definition.onDestroy || null,
        ...definition
      });
    }

    /**
     * Get metadata catalog of all registered types
     */
    getCatalog() {
      return Array.from(this.registry.values()).map((def) => ({
        type: def.type,
        title: def.title,
        icon: def.icon,
        description: def.description,
        defaultW: def.defaultW,
        defaultH: def.defaultH
      }));
    }

    /**
     * Initialize widget engine with container and state callbacks
     */
    init(options = {}) {
      this.container = options.container || (typeof document !== 'undefined' ? document.getElementById('widgets') : null);
      this.getWidgetsFn = typeof options.getWidgets === 'function' ? options.getWidgets : () => [];
      this.onSaveFn = typeof options.onSave === 'function' ? options.onSave : () => {};
      this.isInitialized = true;

      this.render();
    }

    /**
     * Render all widgets from current state
     */
    render() {
      if (!this.container) return;

      this.destroyActiveArtifacts();
      this.container.replaceChildren();

      const widgets = this.getWidgetsFn();
      if (!Array.isArray(widgets)) return;

      widgets.forEach((w, index) => {
        const node = this.createWidgetNode(w, index);
        if (node) this.container.append(node);
      });
    }

    /**
     * Construct DOM element for a widget record
     */
    createWidgetNode(w, index = 0) {
      // Default positioning if missing
      if (w.x == null || w.y == null) {
        w.x = 140 + (index % 3) * 300;
        w.y = 90 + Math.floor(index / 3) * 230;
      }
      const coords = clampCoords(w.x, w.y);
      w.x = coords.x;
      w.y = coords.y;

      const dims = clampDimensions(w.w, w.h);
      w.w = dims.w;
      w.h = dims.h;

      if (w.enabled === undefined) {
        w.enabled = true;
      }
      w.pinned = Boolean(w.pinned);

      // Root widget element
      const node = el('div', {
        className: `widget widget-${w.type}` + (w.enabled === false ? ' widget-disabled' : '') + (w.pinned ? ' widget-pinned' : ''),
        id: `widget-dom-${w.id}`
      });
      node.setAttribute('data-id', w.id);
      node.setAttribute('data-type', w.type);

      Object.assign(node.style, {
        left: `${w.x}px`,
        top: `${w.y}px`,
        width: `${w.w}px`,
        height: `${w.h}px`,
        display: w.enabled === false ? 'none' : 'flex'
      });

      // Header controls
      const def = this.registry.get(w.type);
      const titleSpan = el('span', {
        className: 'widget-title',
        textContent: w.title || (def && def.title) || w.type
      });

      // Pin / Lock button
      const pinBtn = el('button', {
        className: 'item-pin' + (w.pinned ? ' pinned' : ''),
        title: w.pinned ? 'Открепить виджет' : 'Закрепить виджет',
        textContent: w.pinned ? '📌' : '📍'
      });

      // Delete button
      const rmBtn = el('button', {
        className: 'item-remove',
        title: 'Удалить виджет',
        textContent: '✕'
      });
      if (w.pinned) {
        rmBtn.style.display = 'none';
      }

      pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        w.pinned = !w.pinned;
        pinBtn.classList.toggle('pinned', w.pinned);
        pinBtn.title = w.pinned ? 'Открепить виджет' : 'Закрепить виджет';
        pinBtn.textContent = w.pinned ? '📌' : '📍';
        node.classList.toggle('widget-pinned', w.pinned);
        rmBtn.style.display = w.pinned ? 'none' : '';
        this.triggerSave();
      });

      rmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeWidget(w.id);
      });

      // Header container with actions
      const actions = el('div', { className: 'widget-head-actions' }, pinBtn, rmBtn);
      const head = el('div', { className: 'widget-head' }, titleSpan, actions);

      // Body container
      const body = el('div', { className: 'widget-body' });
      node.append(head, body);

      // Bring to front on pointerdown
      node.addEventListener('pointerdown', () => {
        node.style.zIndex = ++zTop;
      });

      // 1. Drag & drop positioning with pointer capture, magnetic grid snapping and bounds clamping
      head.addEventListener('pointerdown', (e) => {
        if (w.pinned) return;
        if (e.button !== 0 || e.target === rmBtn || e.target === pinBtn || e.target.closest('button, input, select')) return;
        node.style.zIndex = ++zTop;

        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = node.offsetLeft;
        const startTop = node.offsetTop;

        head.setPointerCapture(e.pointerId);
        node.classList.add('dragging');

        const onPointerMove = (ev) => {
          const rawX = startLeft + (ev.clientX - startX);
          const rawY = startTop + (ev.clientY - startY);
          const snappedX = snapToGrid(rawX, GRID_STEP);
          const snappedY = snapToGrid(rawY, GRID_STEP);
          const dist = Math.hypot(rawX - snappedX, rawY - snappedY);
          // Magnetic threshold of 14px
          const targetX = dist < 14 ? snappedX : rawX;
          const targetY = dist < 14 ? snappedY : rawY;
          const clamped = clampCoords(targetX, targetY);
          node.style.left = `${clamped.x}px`;
          node.style.top = `${clamped.y}px`;
        };

        const onPointerUp = (ev) => {
          head.removeEventListener('pointermove', onPointerMove);
          head.removeEventListener('pointerup', onPointerUp);
          head.removeEventListener('pointercancel', onPointerUp);
          node.classList.remove('dragging');

          try {
            head.releasePointerCapture(ev.pointerId);
          } catch (_) {}

          const snappedX = snapToGrid(node.offsetLeft, GRID_STEP);
          const snappedY = snapToGrid(node.offsetTop, GRID_STEP);
          const finalClamped = clampCoords(snappedX, snappedY);
          node.style.left = `${finalClamped.x}px`;
          node.style.top = `${finalClamped.y}px`;
          w.x = finalClamped.x;
          w.y = finalClamped.y;

          this.triggerSave();
        };

        head.addEventListener('pointermove', onPointerMove);
        head.addEventListener('pointerup', onPointerUp);
        head.addEventListener('pointercancel', onPointerUp);
      });

      // 2. ResizeObserver with bounds clamping and debounced storage save
      try {
        const ro = new ResizeObserver(() => {
          if (w.enabled === false || w.pinned) return;
          const currentW = node.offsetWidth;
          const currentH = node.offsetHeight;
          if (Math.abs(currentW - w.w) < 2 && Math.abs(currentH - w.h) < 2) return;

          const snappedW = snapToGrid(currentW, GRID_STEP);
          const snappedH = snapToGrid(currentH, GRID_STEP);
          const clamped = clampDimensions(snappedW, snappedH);
          w.w = clamped.w;
          w.h = clamped.h;
          this.triggerSave();
        });
        ro.observe(node);
        activeObservers.add(ro);
      } catch (err) {
        console.warn('[CrosWidgets] ResizeObserver error:', err);
      }

      // 3. Render type-specific body
      if (def && typeof def.render === 'function') {
        try {
          def.render(w, body, () => this.triggerSave(), node);
        } catch (err) {
          console.error(`[CrosWidgets] Failed to render widget ${w.type}:`, err);
          body.replaceChildren(el('div', { className: 'widget-error', textContent: 'Ошибка виджета' }));
        }
      } else {
        body.replaceChildren(el('div', { textContent: `Тип: ${w.type}` }));
      }

      return node;
    }

    /**
     * Add a new widget instance
     */
    addWidget(type, title, config = {}, pos = null) {
      const def = this.registry.get(type);
      if (!def && !['clock', 'weather', 'calendar', 'gmail', 'drive', 'news', 'note', 'todo', 'countdown', 'embed'].includes(type)) {
        throw new Error(`Unsupported widget type: ${type}`);
      }

      const widgets = this.getWidgetsFn();
      const count = widgets.length;

      let x = pos && pos.x != null ? pos.x : 40 + (count % 3) * 300;
      let y = pos && pos.y != null ? pos.y : 90 + Math.floor(count / 3) * 200;
      let w = def ? def.defaultW : DEFAULT_WIDTH;
      let h = def ? def.defaultH : DEFAULT_HEIGHT;

      const coords = clampCoords(x, y);
      const dims = clampDimensions(w, h);

      const newWidget = {
        id: uid(type),
        type,
        title: title || (def ? def.title : type),
        x: coords.x,
        y: coords.y,
        w: dims.w,
        h: dims.h,
        enabled: true,
        config: Object.assign({}, def ? def.defaultConfig : {}, config)
      };

      widgets.push(newWidget);
      this.triggerSave();
      this.render();

      return newWidget;
    }

    /**
     * Remove a widget by ID
     */
    removeWidget(id) {
      const widgets = this.getWidgetsFn();
      const idx = widgets.findIndex((w) => w.id === id);
      if (idx === -1) return false;

      const [removed] = widgets.splice(idx, 1);
      const def = this.registry.get(removed.type);
      if (def && typeof def.onDestroy === 'function') {
        try {
          def.onDestroy(removed);
        } catch (_) {}
      }

      this.triggerSave();
      this.render();
      return true;
    }

    /**
     * Toggle or set enabled state of a widget
     */
    toggleWidget(id, forceEnabled = null) {
      const widgets = this.getWidgetsFn();
      const widget = widgets.find((w) => w.id === id);
      if (!widget) return false;

      widget.enabled = forceEnabled != null ? Boolean(forceEnabled) : !widget.enabled;

      const dom = typeof document !== 'undefined' ? document.getElementById(`widget-dom-${id}`) : null;
      if (dom) {
        dom.style.display = widget.enabled ? 'flex' : 'none';
        dom.classList.toggle('widget-disabled', !widget.enabled);
      }

      this.triggerSave();
      return true;
    }

    /**
     * Programmatically move widget
     */
    moveWidget(id, x, y) {
      const widgets = this.getWidgetsFn();
      const widget = widgets.find((w) => w.id === id);
      if (!widget) return false;

      const clamped = clampCoords(x, y);
      widget.x = clamped.x;
      widget.y = clamped.y;

      const dom = typeof document !== 'undefined' ? document.getElementById(`widget-dom-${id}`) : null;
      if (dom) {
        dom.style.left = `${clamped.x}px`;
        dom.style.top = `${clamped.y}px`;
      }

      this.triggerSave();
      return true;
    }

    /**
     * Programmatically resize widget
     */
    resizeWidget(id, w, h) {
      const widgets = this.getWidgetsFn();
      const widget = widgets.find((w) => w.id === id);
      if (!widget) return false;

      const clamped = clampDimensions(w, h);
      widget.w = clamped.w;
      widget.h = clamped.h;

      const dom = typeof document !== 'undefined' ? document.getElementById(`widget-dom-${id}`) : null;
      if (dom) {
        dom.style.width = `${clamped.w}px`;
        dom.style.height = `${clamped.h}px`;
      }

      this.triggerSave();
      return true;
    }

    /**
     * Retrieve widget by ID
     */
    getWidget(id) {
      const widgets = this.getWidgetsFn();
      return widgets.find((w) => w.id === id) || null;
    }

    /**
     * Clean up all timers and observers
     */
    destroyActiveArtifacts() {
      activeTimers.forEach((t) => clearInterval(t));
      activeTimers.clear();

      activeObservers.forEach((ro) => ro.disconnect());
      activeObservers.clear();
    }

    /**
     * Tear down engine
     */
    destroy() {
      this.destroyActiveArtifacts();
      if (this.container) this.container.replaceChildren();
      this.isInitialized = false;
    }

    /**
     * Register all standard and built-in widget types
     */
    registerBuiltInWidgets() {
      // 1. CLOCK & DATE WIDGET (Feature 7)
      this.register('clock', {
        title: 'Часы и дата',
        icon: '🕒',
        description: 'Цифровые часы, дата и переключатель 24ч/12ч',
        defaultW: 280,
        defaultH: 140,
        defaultConfig: {
          format24h: true,
          showSeconds: false,
          showDate: true
        },
        render(w, body, save) {
          w.config = w.config || {};
          if (w.config.format24h === undefined) w.config.format24h = true;
          if (w.config.showSeconds === undefined) w.config.showSeconds = false;
          if (w.config.showDate === undefined) w.config.showDate = true;

          const timeDisplay = el('div', { className: 'widget-clock-time' });
          const dateDisplay = el('div', { className: 'widget-clock-date' });

          const update = () => {
            const now = new Date();
            timeDisplay.textContent = formatTime(now, w.config.format24h, w.config.showSeconds);
            if (w.config.showDate) {
              dateDisplay.textContent = formatDate(now);
              dateDisplay.style.display = 'block';
            } else {
              dateDisplay.style.display = 'none';
            }
          };

          update();

          // Interval depends on whether seconds are visible (1s vs 10s)
          const intervalMs = w.config.showSeconds ? 1000 : 1000;
          const timer = setInterval(update, intervalMs);
          activeTimers.add(timer);

          // Inline Quick Controls
          const toggleFormatBtn = el('button', {
            className: 'widget-chip-btn',
            textContent: w.config.format24h ? '24ч' : '12ч',
            title: 'Переключить формат 24ч / 12ч'
          });
          toggleFormatBtn.onclick = (e) => {
            e.stopPropagation();
            w.config.format24h = !w.config.format24h;
            toggleFormatBtn.textContent = w.config.format24h ? '24ч' : '12ч';
            update();
            save();
          };

          const toggleSecBtn = el('button', {
            className: 'widget-chip-btn' + (w.config.showSeconds ? ' active' : ''),
            textContent: ':сек',
            title: 'Показывать / скрыть секунды'
          });
          toggleSecBtn.onclick = (e) => {
            e.stopPropagation();
            w.config.showSeconds = !w.config.showSeconds;
            toggleSecBtn.classList.toggle('active', w.config.showSeconds);
            update();
            save();
          };

          const toggleDateBtn = el('button', {
            className: 'widget-chip-btn' + (w.config.showDate ? ' active' : ''),
            textContent: 'дата',
            title: 'Показывать / скрыть дату'
          });
          toggleDateBtn.onclick = (e) => {
            e.stopPropagation();
            w.config.showDate = !w.config.showDate;
            toggleDateBtn.classList.toggle('active', w.config.showDate);
            update();
            save();
          };

          const controlsRow = el('div', { className: 'widget-clock-controls' }, toggleFormatBtn, toggleSecBtn, toggleDateBtn);

          body.replaceChildren(timeDisplay, dateDisplay, controlsRow);
        }
      });

      // 2. NOTE WIDGET (v0.2 Preserved)
      this.register('note', {
        title: 'Заметка',
        icon: '📝',
        description: 'Быстрые заметки с автосохранением',
        defaultW: 280,
        defaultH: 200,
        defaultConfig: { text: '' },
        render(w, body, save) {
          const initialText = w.text || (w.config && w.config.text) || '';
          const ta = el('textarea', {
            className: 'widget-note-textarea',
            placeholder: 'Введите текст заметки…',
            value: initialText
          });

          ta.addEventListener('input', () => {
            w.text = ta.value;
            if (w.config) w.config.text = ta.value;
            save();
          });

          body.replaceChildren(ta);
        }
      });

      // 3. TODO WIDGET (v0.2 Preserved)
      this.register('todo', {
        title: 'Список дел',
        icon: '☑️',
        description: 'Интерактивный чеклист с отметкой выполнения',
        defaultW: 280,
        defaultH: 220,
        defaultConfig: { items: [] },
        render(w, body, save) {
          w.items = w.items || (w.config && w.config.items) || [];
          if (w.config) w.config.items = w.items;

          const listEl = el('div', { className: 'widget-todo-list' });

          const renderList = () => {
            listEl.replaceChildren();
            w.items.forEach((item, index) => {
              const cb = el('input', { type: 'checkbox', checked: !!item.done });
              cb.onchange = () => {
                item.done = cb.checked;
                save();
                renderList();
              };

              const textSpan = el('span', { textContent: item.text });
              const delBtn = el('button', { className: 'todo-del-btn', textContent: '✕', title: 'Удалить задачу' });
              delBtn.onclick = () => {
                w.items.splice(index, 1);
                save();
                renderList();
              };

              const row = el('div', { className: 'todo-item' + (item.done ? ' done' : '') }, cb, textSpan, delBtn);
              listEl.append(row);
            });
          };

          const inputEl = el('input', {
            type: 'text',
            className: 'widget-todo-input',
            placeholder: 'Новая задача (Enter)…'
          });

          inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const text = inputEl.value.trim();
              if (text) {
                w.items.push({ text, done: false });
                inputEl.value = '';
                save();
                renderList();
              }
            }
          });

          renderList();
          body.replaceChildren(listEl, inputEl);
        }
      });

      // 4. COUNTDOWN WIDGET (v0.2 Preserved)
      this.register('countdown', {
        title: 'Обратный отсчёт',
        icon: '⏳',
        description: 'Таймер до важной даты или события',
        defaultW: 260,
        defaultH: 150,
        defaultConfig: { date: '' },
        render(w, body, save) {
          const valEl = el('div', { className: 'countdown-value' });
          const dateStr = w.date || (w.config && w.config.date) || '';

          const tick = () => {
            if (!dateStr) {
              valEl.textContent = 'Укажите дату';
              return;
            }
            const target = new Date(dateStr).getTime();
            const diff = target - Date.now();
            if (isNaN(diff)) {
              valEl.textContent = '—';
              return;
            }
            if (diff <= 0) {
              valEl.textContent = 'Наступило!';
              return;
            }
            const days = Math.floor(diff / 864e5);
            const hours = Math.floor(diff / 36e5) % 24;
            const minutes = Math.floor(diff / 6e4) % 60;
            valEl.textContent = `${days}д ${hours}ч ${minutes}м`;
          };

          tick();
          const timer = setInterval(tick, 30000);
          activeTimers.add(timer);

          body.replaceChildren(valEl);
        }
      });

      // 5. EMBED WIDGET (v0.2 Preserved)
      this.register('embed', {
        title: 'Веб-страница (iframe)',
        icon: '🌐',
        description: 'Встраивание веб-страниц и интерактивных фреймов',
        defaultW: 360,
        defaultH: 260,
        defaultConfig: { url: '' },
        render(w, body) {
          const targetUrl = safeUrl(w.url || (w.config && w.config.url) || '');
          if (targetUrl) {
            const frame = el('iframe', {
              src: targetUrl,
              referrerPolicy: 'no-referrer',
              sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups'
            });
            body.replaceChildren(frame);
          } else {
            body.replaceChildren(el('div', { className: 'widget-embed-empty', textContent: 'Укажите корректный URL веб-страницы' }));
          }
        }
      });

      // 6. WEATHER WIDGET (R3 Open-Meteo Integration)
      this.register('weather', {
        title: 'Погода',
        icon: '🌤️',
        description: 'Текущая погода и прогноз Open-Meteo',
        defaultW: 320,
        defaultH: 220,
        defaultConfig: { city: 'Moscow', lat: 55.7558, lon: 37.6173, units: 'celsius' },
        render(w, body, save, node) {
          const service = (typeof window !== 'undefined' && window.WeatherService)
            || (typeof require !== 'undefined' ? (() => { try { return require('./services/weather-service.js').WeatherService; } catch (_) { return null; } })() : null);
          if (service && typeof service.renderWidget === 'function') {
            service.renderWidget(w, body, save, node);
            return;
          }
          // Default presentation if WeatherService is unavailable
          const city = (w.config && w.config.city) || 'Moscow';
          body.replaceChildren(
            el('div', { className: 'weather-stub-card' },
              el('div', { className: 'weather-stub-header' },
                el('span', { className: 'weather-stub-city', textContent: `📍 ${city}` }),
                el('span', { className: 'weather-stub-badge', textContent: 'Open-Meteo' })
              ),
              el('div', { className: 'weather-stub-temp', textContent: '🌤️ +18°C' }),
              el('div', { className: 'weather-stub-desc', textContent: 'Ясно • Ветер 3.2 м/с' })
            )
          );
        }
      });

      // 7. GOOGLE CALENDAR WIDGET (R2 Slot)
      this.register('calendar', {
        title: 'Google Календарь',
        icon: '📅',
        description: 'Ближайшие встречи и события из Google Calendar',
        defaultW: 320,
        defaultH: 220,
        defaultConfig: { maxItems: 5 },
        render(w, body, save, node) {
          const service = (typeof window !== 'undefined' && window.GoogleService)
            || (typeof require !== 'undefined' ? (() => { try { return require('./services/google-service.js').GoogleService; } catch (_) { return null; } })() : null);
          if (service && typeof service.renderCalendarWidget === 'function') {
            service.renderCalendarWidget(w, body, save, node);
            return;
          }
          body.replaceChildren(
            el('div', { className: 'google-stub-card' },
              el('div', { className: 'google-stub-title', textContent: '📅 Google Календарь' }),
              el('div', { className: 'google-stub-desc', textContent: 'Предстоящие события календаря. Настройте Client ID в параметрах.' }),
              el('button', {
                className: 'btn btn-primary',
                textContent: 'Настроить в параметрах',
                onclick: () => {
                  const panel = document.getElementById('settings-panel');
                  if (panel) panel.classList.add('open');
                  const btn = document.getElementById('tab-btn-google');
                  if (btn) btn.click();
                }
              })
            )
          );
        }
      });

      // 8. GMAIL WIDGET (R2 Slot)
      this.register('gmail', {
        title: 'Gmail Непрочитанные',
        icon: '✉️',
        description: 'Счётчик непрочитанных и список входящих писем',
        defaultW: 320,
        defaultH: 220,
        defaultConfig: { maxItems: 5 },
        render(w, body, save, node) {
          const service = (typeof window !== 'undefined' && window.GoogleService)
            || (typeof require !== 'undefined' ? (() => { try { return require('./services/google-service.js').GoogleService; } catch (_) { return null; } })() : null);
          if (service && typeof service.renderGmailWidget === 'function') {
            service.renderGmailWidget(w, body, save, node);
            return;
          }
          body.replaceChildren(
            el('div', { className: 'google-stub-card' },
              el('div', { className: 'google-stub-title', textContent: '✉️ Gmail Inbox' }),
              el('div', { className: 'google-stub-desc', textContent: 'Непрочитанные сообщения почты. Настройте Client ID в параметрах.' }),
              el('button', {
                className: 'btn btn-primary',
                textContent: 'Настроить в параметрах',
                onclick: () => {
                  const panel = document.getElementById('settings-panel');
                  if (panel) panel.classList.add('open');
                  const btn = document.getElementById('tab-btn-google');
                  if (btn) btn.click();
                }
              })
            )
          );
        }
      });

      // 9. GOOGLE DRIVE WIDGET (R2 Slot)
      this.register('drive', {
        title: 'Google Диск',
        icon: '📁',
        description: 'Недавно просмотренные и изменённые файлы',
        defaultW: 320,
        defaultH: 220,
        defaultConfig: { maxItems: 5 },
        render(w, body, save, node) {
          const service = (typeof window !== 'undefined' && window.GoogleService)
            || (typeof require !== 'undefined' ? (() => { try { return require('./services/google-service.js').GoogleService; } catch (_) { return null; } })() : null);
          if (service && typeof service.renderDriveWidget === 'function') {
            service.renderDriveWidget(w, body, save, node);
            return;
          }
          body.replaceChildren(
            el('div', { className: 'google-stub-card' },
              el('div', { className: 'google-stub-title', textContent: '📁 Google Drive' }),
              el('div', { className: 'google-stub-desc', textContent: 'Последние открытые документы. Настройте Client ID в параметрах.' }),
              el('button', {
                className: 'btn btn-primary',
                textContent: 'Настроить в параметрах',
                onclick: () => {
                  const panel = document.getElementById('settings-panel');
                  if (panel) panel.classList.add('open');
                  const btn = document.getElementById('tab-btn-google');
                  if (btn) btn.click();
                }
              })
            )
          );
        }
      });

      // 10. GOOGLE NEWS / RSS WIDGET (R2 Slot)
      this.register('news', {
        title: 'Новости Google RSS',
        icon: '📰',
        description: 'Главные заголовки ленты новостей',
        defaultW: 340,
        defaultH: 240,
        defaultConfig: { count: 5 },
        render(w, body, save, node) {
          const service = (typeof window !== 'undefined' && window.GoogleService)
            || (typeof require !== 'undefined' ? (() => { try { return require('./services/google-service.js').GoogleService; } catch (_) { return null; } })() : null);
          if (service && typeof service.renderNewsWidget === 'function') {
            service.renderNewsWidget(w, body, save, node);
            return;
          }
          body.replaceChildren(
            el('div', { className: 'google-stub-card' },
              el('div', { className: 'google-stub-title', textContent: '📰 Google News RSS' }),
              el('div', { className: 'google-stub-desc', textContent: 'Свежие заголовки новостей по выбранной теме.' })
            )
          );
        }
      });
    }
  }

  // Instantiate and expose globally
  const CrosWidgets = new CrosWidgetEngine();
  CrosWidgets.formatTime = formatTime;
  CrosWidgets.formatDate = formatDate;
  CrosWidgets.clampCoords = clampCoords;
  CrosWidgets.clampDimensions = clampDimensions;
  CrosWidgets.MIN_WIDTH = MIN_WIDTH;
  CrosWidgets.MIN_HEIGHT = MIN_HEIGHT;

  if (typeof window !== 'undefined') {
    window.CrosWidgets = CrosWidgets;
    window.WidgetRegistry = CrosWidgets;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CrosWidgets, CrosWidgetEngine, formatTime, formatDate };
  }
})();

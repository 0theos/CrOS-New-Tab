/* CrOS New Tab 0.3 — desktop layout, storage v3, shortcuts, modular widgets, wallpapers */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  const store = {
    get: (keys) => hasChrome
      ? new Promise((r) => chrome.storage.local.get(keys, r))
      : Promise.resolve(Object.fromEntries(keys.map((k) => [k, JSON.parse(localStorage.getItem(k) || 'null')]))),
    set: (obj) => {
      try {
        Object.entries(obj).forEach(([k, v]) => {
          if (typeof localStorage !== 'undefined' && localStorage.setItem) {
            localStorage.setItem(k, JSON.stringify(v));
          }
        });
      } catch (_) {}
      return hasChrome
        ? new Promise((r) => chrome.storage.local.set(obj, r))
        : Promise.resolve();
    },
  };

  let isNavigatingAway = false;

  const state = {
    version: 3,
    shortcuts: [],
    widgets: [],
    wallpaper: { type: 'default', value: '' },
    dim: 0.3,
    autoFullscreen: false,
    closeProtection: true,
    google: { clientId: '', mockMode: false },
    weather: { city: 'Moscow', lat: 55.7558, lon: 37.6173, units: 'celsius' },
    clock: { preset: 'classic' }
  };

  /**
   * Migrate storage from cros_v2 to cros_v3 adhering to PROJECT.md §1 & test specs.
   * Idempotent: if cros_v3 with version=3 exists, returns it intact.
   */
  function migrateStorage(data) {
    const existingV3 = data && data.cros_v3;
    if (existingV3 && typeof existingV3 === 'object' && existingV3.version >= 3) {
      existingV3.version = 3;
      if (!Array.isArray(existingV3.shortcuts)) existingV3.shortcuts = [];
      if (!Array.isArray(existingV3.widgets)) existingV3.widgets = [];
      if (!existingV3.wallpaper || typeof existingV3.wallpaper !== 'object') {
        if (typeof existingV3.wallpaper === 'string' && existingV3.wallpaper) {
          existingV3.wallpaper = {
            type: existingV3.wallpaper.startsWith('data:') ? 'image' : 'url',
            value: existingV3.wallpaper
          };
        } else {
          existingV3.wallpaper = { type: 'default', value: '' };
        }
      }
      if (typeof existingV3.dim !== 'number') existingV3.dim = 0.3;
      if (typeof existingV3.autoFullscreen !== 'boolean') existingV3.autoFullscreen = false;
      if (existingV3.closeProtection === undefined) existingV3.closeProtection = true;
      if (!existingV3.google || typeof existingV3.google !== 'object') {
        existingV3.google = { clientId: '', mockMode: false };
      }
      if (!existingV3.weather || typeof existingV3.weather !== 'object') {
        existingV3.weather = { city: 'Moscow', lat: 55.7558, lon: 37.6173, units: 'celsius' };
      }
      if (!existingV3.clock || typeof existingV3.clock !== 'object') existingV3.clock = { preset: 'classic' };
      return existingV3;
    }

    const v2 = (data && data.cros_v2 && typeof data.cros_v2 === 'object') ? data.cros_v2 : {};

    const defaultWidgets = [
      {
        id: 'clock-1',
        type: 'clock',
        title: 'Clock',
        x: 20,
        y: 20,
        w: 280,
        h: 140,
        enabled: true,
        config: { format24h: true, showSeconds: false }
      },
      {
        id: 'weather-1',
        type: 'weather',
        title: 'Weather',
        x: 320,
        y: 20,
        w: 300,
        h: 180,
        enabled: true,
        config: {}
      }
    ];

    let migratedWidgets = [];
    if (Array.isArray(v2.widgets)) {
      migratedWidgets = v2.widgets.map((w) => {
        const copy = Object.assign({}, w);
        if (copy.enabled === undefined) copy.enabled = true;
        if (!copy.config) copy.config = {};
        return copy;
      });
    } else {
      migratedWidgets = defaultWidgets;
    }

    let shortcuts = v2.shortcuts;
    if (!Array.isArray(shortcuts)) {
      shortcuts = [
        { id: 'sc-google', title: 'Google', url: 'https://www.google.com', icon: '🌐' },
        { id: 'sc-youtube', title: 'YouTube', url: 'https://www.youtube.com', icon: '▶️' }
      ];
    }

    let wallpaper = v2.wallpaper;
    if (!wallpaper || typeof wallpaper !== 'object' || !wallpaper.type) {
      if (typeof wallpaper === 'string' && wallpaper) {
        wallpaper = {
          type: wallpaper.startsWith('data:') ? 'image' : 'url',
          value: wallpaper
        };
      } else {
        wallpaper = { type: 'default', value: '' };
      }
    }

    let dim = 0.0;
    if (v2.dim != null) {
      try {
        dim = parseFloat(v2.dim);
        if (isNaN(dim)) dim = 0.0;
        dim = Math.max(0.0, Math.min(1.0, dim));
      } catch (_) {
        dim = 0.0;
      }
    }

    const autoFullscreen = Boolean(v2.autoFullscreen);

    return {
      version: 3,
      clock: { preset: 'classic' },
      shortcuts,
      widgets: migratedWidgets,
      wallpaper,
      dim,
      autoFullscreen,
      google: {
        clientId: '',
        mockMode: false
      },
      weather: {
        city: 'Moscow',
        lat: 55.7558,
        lon: 37.6173,
        units: 'celsius'
      }
    };
  }

  const save = () => {
    let v2Wallpaper = null;
    if (state.wallpaper) {
      if (typeof state.wallpaper === 'string') {
        v2Wallpaper = state.wallpaper;
      } else if (state.wallpaper.type === 'color' || state.wallpaper.type === 'image' || state.wallpaper.type === 'url') {
        v2Wallpaper = state.wallpaper.value;
      }
    }

    const v2State = {
      shortcuts: state.shortcuts,
      widgets: state.widgets,
      wallpaper: v2Wallpaper,
      dim: state.dim,
      autoFullscreen: state.autoFullscreen
    };

    return store.set({ cros_v3: state, cros_v2: v2State });
  };

  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.forEach((k) => n.append(k));
    return n;
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const normUrl = (u) => (/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u);
  // Shortcut targets: web, local files (path or file://), chrome:// pages, custom app schemes (steam://, vscode://, mailto: ...)
  const BLOCKED_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'blob:'];
  function linkUrl(u) {
    u = (u || '').trim();
    if (!u) return null;
    if (/^[a-z]:[\\/]/i.test(u)) u = 'file:///' + u.replace(/\\/g, '/');      // C:\dir\file
    else if (u.startsWith('/')) u = 'file://' + u;                            // /home/user/file
    else if (u.startsWith('~')) return null;
    try {
      const p = new URL(normUrl(u)).protocol;
      return BLOCKED_SCHEMES.includes(p) ? null : new URL(normUrl(u)).href;
    } catch { return null; }
  }
  function openLink(url, s) {
    if (s && s.type === 'app' && chrome.management && chrome.management.launchApp) {
      chrome.management.launchApp(s.appId);
      return;
    }
    const scheme = new URL(url).protocol;
    // file:// and chrome:// are not navigable from a page directly, but tabs API can open them
    if ((scheme === 'file:' || scheme === 'chrome:') && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url, active: true });
      return;
    }
    // Shortcut links ALWAYS open in a new tab
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  const safeUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(normUrl(u)).protocol) ? normUrl(u) : null; } catch { return null; } };

  /* ---------- Fullscreen ---------- */
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  /* ---------- Search ---------- */
  const HISTORY_KEY = 'cros_search_history';
  const MAX_HISTORY = 200;
  const loadHistory = () => {
    try { const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(h) ? h : []; } catch { return []; }
  };
  const saveHistory = (list) => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, MAX_HISTORY))); } catch (_) {}
    if (hasChrome) chrome.storage.local.set({ [HISTORY_KEY]: list.slice(0, MAX_HISTORY) });
  };
  function addHistory(q) {
    const list = loadHistory().filter((x) => x.q.toLowerCase() !== q.toLowerCase());
    const prev = loadHistory().find((x) => x.q.toLowerCase() === q.toLowerCase());
    list.unshift({ q, n: (prev ? prev.n : 0) + 1, t: Date.now() });
    saveHistory(list);
  }
  // Pull Google queries from browser history (needs the "history" permission)
  async function importGoogleHistory() {
    if (!(hasChrome && chrome.history && chrome.history.search)) return;
    try {
      const items = await new Promise((r) => chrome.history.search({ text: 'google.com/search', maxResults: 300, startTime: 0 }, r));
      const list = loadHistory();
      const seen = new Map(list.map((x) => [x.q.toLowerCase(), x]));
      (items || []).forEach((it) => {
        try {
          const u = new URL(it.url);
          if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname) || u.pathname !== '/search') return;
          const q = (u.searchParams.get('q') || '').trim();
          if (!q) return;
          const ex = seen.get(q.toLowerCase());
          if (ex) { ex.t = Math.max(ex.t || 0, it.lastVisitTime || 0); }
          else { const o = { q, n: it.visitCount || 1, t: it.lastVisitTime || 0 }; seen.set(q.toLowerCase(), o); list.push(o); }
        } catch (_) {}
      });
      list.sort((a, b) => (b.t || 0) - (a.t || 0));
      saveHistory(list);
    } catch (_) {}
  }
  function suggest(prefix) {
    const p = prefix.trim().toLowerCase();
    const list = loadHistory();
    const now = Date.now();
    return list
      .filter((x) => x.q.toLowerCase() !== p && (!p || x.q.toLowerCase().includes(p)))
      .map((x) => ({ x, score: (x.q.toLowerCase().startsWith(p) ? 1000 : 0) + x.n * 5 - (now - (x.t || 0)) / 8.64e7 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((o) => o.x.q);
  }
  // Every search/address opens in a NEW tab
  function runSearch(q) {
    q = q.trim();
    if (!q) return;
    const direct = /^(https?:\/\/|[\w-]+(\.[\w-]+)+(\/|$))/i.test(q) && !/\s/.test(q);
    if (direct) {
      const u = safeUrl(q);
      if (u) window.open(u, '_blank', 'noopener,noreferrer');
      return;
    }
    addHistory(q);
    const url = 'https://www.google.com/search?q=' + encodeURIComponent(q);
    if (hasChrome && chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url, active: true });
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  function initSearch() {
    const form = $('search-form'), input = $('search-input');
    const box = el('div', { className: 'search-suggest', hidden: true });
    form.append(box);
    let items = [], active = -1;
    const hide = () => { box.hidden = true; active = -1; };
    const paint = () => {
      box.replaceChildren();
      items.forEach((q, i) => {
        const b = el('div', { className: 'search-suggest-item' + (i === active ? ' active' : ''), textContent: q });
        b.addEventListener('mousedown', (e) => { e.preventDefault(); input.value = q; hide(); runSearch(q); });
        box.append(b);
      });
      box.hidden = !items.length;
    };
    const refresh = () => { items = suggest(input.value); active = -1; paint(); };
    input.addEventListener('input', refresh);
    input.addEventListener('focus', refresh);
    input.addEventListener('blur', () => setTimeout(hide, 100));
    input.addEventListener('keydown', (e) => {
      if (!items.length || box.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; input.value = items[active]; paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; input.value = items[active]; paint(); }
      else if (e.key === 'Escape') hide();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      hide();
      runSearch(q);
      input.value = '';
    });
    // Quick access: just start typing anywhere to focus
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length === 1) input.focus();
    });
    setTimeout(() => input.focus(), 50);
    importGoogleHistory();
  }

  /* ---------- Desktop shortcuts (Windows-style icon grid) ---------- */
  const CELL_W = 96, CELL_H = 108, GRID_LEFT = 8, GRID_TOP = 76;
  const gridRows = () => Math.max(1, Math.floor((innerHeight - GRID_TOP - 8) / CELL_H));
  const gridCols = () => Math.max(1, Math.floor((innerWidth - GRID_LEFT) / CELL_W));

  // First free cell, filling column by column from the top-left like Windows
  function freeCell(ignoreId) {
    const taken = new Set(state.shortcuts.filter((s) => s.id !== ignoreId && s.col != null).map((s) => s.col + ',' + s.row));
    const rows = gridRows();
    for (let col = 0; col < 200; col++) for (let row = 0; row < rows; row++) if (!taken.has(col + ',' + row)) return { col, row };
    return { col: 0, row: 0 };
  }
  const cellTaken = (col, row, id) => state.shortcuts.some((s) => s.id !== id && s.col === col && s.row === row);

  function menu(x, y, items) {
    document.querySelectorAll('.ctx-menu').forEach((m) => m.remove());
    const m = el('div', { className: 'ctx-menu' });
    items.forEach(([label, fn]) => {
      const b = el('button', { textContent: label });
      b.onclick = () => { m.remove(); fn(); };
      m.append(b);
    });
    document.body.append(m);
    m.style.left = Math.min(x, innerWidth - m.offsetWidth - 4) + 'px';
    m.style.top = Math.min(y, innerHeight - m.offsetHeight - 4) + 'px';
  }

  function renderShortcuts() {
    const box = $('shortcuts');
    box.replaceChildren();
    const rows = gridRows(), cols = gridCols();
    let moved = false;
    state.shortcuts.forEach((s) => {
      if (s.col == null || s.row >= rows || s.col >= cols) { Object.assign(s, freeCell(s.id)); moved = true; }
    });
    if (moved) save();
    state.shortcuts.forEach((s) => {
      const isApp = s.type === 'app';
      const url = isApp ? 'app:' + s.appId : linkUrl(s.url);
      if (!url) return;
      const icon = el('div', { className: 'shortcut-icon' });
      const letter = () => icon.replaceChildren(document.createTextNode(isApp ? '▣' : (s.title || '?')[0].toUpperCase()));
      const scheme = isApp ? 'app:' : new URL(url).protocol;
      if (scheme === 'http:' || scheme === 'https:' || (isApp && s.icon)) {
        const img = el('img', { alt: '', draggable: false });
        img.src = isApp ? s.icon : 'https://www.google.com/s2/favicons?sz=64&domain_url=' + encodeURIComponent(url);
        img.onerror = letter;
        icon.append(img);
      } else {
        icon.textContent = scheme === 'file:' ? '📁' : scheme === 'chrome:' ? '⚙' : '🔗';
      }
      const node = el('div', { className: 'shortcut', tabIndex: 0, title: url }, icon, el('div', { className: 'shortcut-title', textContent: s.title || url }));
      node.style.left = GRID_LEFT + s.col * CELL_W + 'px';
      node.style.top = GRID_TOP + s.row * CELL_H + 'px';
      const open = () => openLink(url, s);
      node.addEventListener('dblclick', open);
      node.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
      node.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        document.querySelectorAll('.shortcut.selected').forEach((n) => n.classList.remove('selected'));
        node.classList.add('selected');
        if (s.pinned) return; // pinned shortcuts cannot be moved
        const sx = e.clientX, sy = e.clientY, ox = node.offsetLeft, oy = node.offsetTop;
        let dragging = false;
        const mv = (ev) => {
          if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
          dragging = true;
          node.classList.add('dragging');
          const rawLeft = ox + ev.clientX - sx;
          const rawTop = oy + ev.clientY - sy;
          const targetCol = Math.min(gridCols() - 1, Math.max(0, Math.round((rawLeft - GRID_LEFT) / CELL_W)));
          const targetRow = Math.min(gridRows() - 1, Math.max(0, Math.round((rawTop - GRID_TOP) / CELL_H)));
          const snappedLeft = GRID_LEFT + targetCol * CELL_W;
          const snappedTop = GRID_TOP + targetRow * CELL_H;
          const dist = Math.hypot(rawLeft - snappedLeft, rawTop - snappedTop);
          if (dist < 28) {
            node.style.left = snappedLeft + 'px';
            node.style.top = snappedTop + 'px';
            node.classList.add('snapped-to-grid');
          } else {
            node.style.left = rawLeft + 'px';
            node.style.top = rawTop + 'px';
            node.classList.remove('snapped-to-grid');
          }
        };
        const up = () => {
          removeEventListener('pointermove', mv);
          removeEventListener('pointerup', up);
          if (!dragging) return;
          node.classList.remove('dragging');
          node.classList.remove('snapped-to-grid');
          const col = Math.min(gridCols() - 1, Math.max(0, Math.round((node.offsetLeft - GRID_LEFT) / CELL_W)));
          const row = Math.min(gridRows() - 1, Math.max(0, Math.round((node.offsetTop - GRID_TOP) / CELL_H)));
          if (!cellTaken(col, row, s.id)) { s.col = col; s.row = row; save(); }
          renderShortcuts();
        };
        addEventListener('pointermove', mv);
        addEventListener('pointerup', up);
      });
      node.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        node.classList.add('selected');
        menu(e.clientX, e.clientY, [
          ['Открыть', open],
          [s.pinned ? 'Открепить' : 'Закрепить', () => { s.pinned = !s.pinned; save(); }],
          ...(isApp ? [] : [['Открыть в новой вкладке', () => window.open(url, '_blank')]]),
          ['Удалить', () => { state.shortcuts = state.shortcuts.filter((x) => x.id !== s.id); save(); renderShortcuts(); }],
        ]);
      });
      box.append(node);
    });
  }

  function dialog(title, fields, onOk) {
    const dlg = el('dialog', { className: 'cros-dialog' }, el('h3', { textContent: title }));
    const form = el('form', { method: 'dialog' });
    const inputs = {};
    fields.forEach((f) => {
      const inp = f.options
        ? el('select', {}, ...f.options.map(([v, t]) => el('option', { value: v, textContent: t })))
        : el('input', { type: f.type || 'text', placeholder: f.placeholder || '', required: !!f.required });
      inputs[f.name] = inp;
      form.append(el('label', { textContent: f.label }), inp);
    });
    const cancel = el('button', { type: 'button', className: 'btn', textContent: 'Отмена' });
    cancel.onclick = () => dlg.close();
    form.append(el('div', { className: 'dialog-actions' }, cancel, el('button', { type: 'submit', className: 'btn btn-primary', textContent: 'Готово' })));
    form.addEventListener('submit', () => {
      const vals = {};
      for (const k in inputs) vals[k] = inputs[k].value.trim();
      onOk(vals);
    });
    dlg.append(form);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
    Object.values(inputs)[0]?.focus();
  }

  function addShortcutDialog() {
    dialog('Новый ярлык', [
      { name: 'title', label: 'Название', placeholder: 'YouTube' },
      { name: 'url', label: 'Адрес, файл или приложение', placeholder: 'youtube.com, /home/user/doc.pdf, C:\\Docs\\a.txt, chrome://settings, steam://', required: true },
    ], (v) => {
      const u = linkUrl(v.url);
      if (!u) return;
      state.shortcuts.push({ id: uid(), title: v.title || v.url.split(/[\\/]/).filter(Boolean).pop(), url: u, ...freeCell() });
      save(); renderShortcuts();
    });
  }

  // Installed Chrome/ChromeOS apps (uses the "management" permission)
  async function addAppDialog() {
    if (!(chrome.management && chrome.management.getAll)) return;
    const all = await new Promise((r) => chrome.management.getAll(r));
    const apps = all.filter((a) => a.isApp && a.enabled && a.type !== 'theme').sort((a, b) => a.name.localeCompare(b.name));
    if (!apps.length) { dialog('Приложения не найдены', [], () => {}); return; }
    dialog('Установленное приложение', [{ name: 'app', label: 'Приложение', options: apps.map((a) => [a.id, a.name]) }], (v) => {
      const a = apps.find((x) => x.id === v.app);
      if (!a) return;
      const icon = (a.icons || []).slice().sort((x, y) => y.size - x.size)[0];
      state.shortcuts.push({ id: uid(), type: 'app', appId: a.id, title: a.name, icon: icon ? icon.url : '', ...freeCell() });
      save(); renderShortcuts();
    });
  }

  /* ---------- Widgets System Integration ---------- */
  function renderWidgets() {
    if (window.CrosWidgets) {
      window.CrosWidgets.render();
    }
    renderWidgetsManagerList();
  }

  function addWidgetCatalogDialog() {
    if (!window.CrosWidgets) return;
    const catalog = window.CrosWidgets.getCatalog();
    const dlg = el('dialog', { className: 'cros-dialog catalog-dialog' },
      el('h3', { textContent: 'Каталог виджетов' }),
      el('div', { className: 'section-desc', textContent: 'Выберите виджет для добавления на рабочий стол:' })
    );

    const grid = el('div', { className: 'widget-catalog-grid' });
    catalog.forEach((item) => {
      const card = el('button', { type: 'button', className: 'widget-catalog-card' },
        el('span', { className: 'widget-catalog-icon', textContent: item.icon }),
        el('span', { className: 'widget-catalog-title', textContent: item.title }),
        el('span', { className: 'widget-catalog-desc', textContent: item.description })
      );

      card.onclick = () => {
        dlg.close();
        if (item.type === 'countdown') {
          dialog('Настройка таймера', [
            { name: 'title', label: 'Название события', placeholder: 'Новый год' },
            { name: 'date', label: 'Дата и время (ГГГГ-ММ-ДД ЧЧ:ММ)', placeholder: '2026-12-31 20:00', required: true }
          ], (v) => {
            const dt = (v.date || '').replace(' ', 'T');
            window.CrosWidgets.addWidget('countdown', v.title || 'Обратный отсчёт', { date: dt });
            save();
            renderWidgetsManagerList();
          });
        } else if (item.type === 'embed') {
          dialog('Веб-страница (iframe)', [
            { name: 'title', label: 'Заголовок', placeholder: 'Веб-фрейм' },
            { name: 'url', label: 'URL веб-страницы (https://)', placeholder: 'https://example.com', required: true }
          ], (v) => {
            const u = safeUrl(v.url);
            if (!u) return;
            window.CrosWidgets.addWidget('embed', v.title || 'Веб-страница', { url: u });
            save();
            renderWidgetsManagerList();
          });
        } else {
          window.CrosWidgets.addWidget(item.type, item.title);
          save();
          renderWidgetsManagerList();
        }
      };

      grid.append(card);
    });

    const closeBtn = el('button', { type: 'button', className: 'btn', textContent: 'Закрыть' });
    closeBtn.onclick = () => dlg.close();
    const actions = el('div', { className: 'dialog-actions' }, closeBtn);

    dlg.append(grid, actions);
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  function renderWidgetsManagerList() {
    const listEl = $('widget-manager-list');
    if (!listEl) return;
    listEl.replaceChildren();

    if (!state.widgets || !state.widgets.length) {
      listEl.append(el('div', { className: 'section-desc', textContent: 'Нет активных виджетов. Нажмите «+ Добавить».' }));
      return;
    }

    state.widgets.forEach((w) => {
      const isEnabled = w.enabled !== false;
      const cb = el('input', { type: 'checkbox', checked: isEnabled, title: 'Включить / скрыть виджет' });
      cb.onchange = () => {
        if (window.CrosWidgets) {
          window.CrosWidgets.toggleWidget(w.id, cb.checked);
        } else {
          w.enabled = cb.checked;
          save();
        }
      };

      const titleSpan = el('span', { className: 'widget-manager-title', textContent: w.title || w.type });
      const badge = el('span', { className: 'widget-manager-badge', textContent: w.type });
      const info = el('div', { className: 'widget-manager-info' }, cb, titleSpan, badge);

      const isPinned = !!w.pinned;
      const pinBtn = el('button', {
        className: 'widget-manager-pin' + (isPinned ? ' pinned' : ''),
        textContent: isPinned ? '📌' : '📍',
        title: isPinned ? 'Открепить виджет' : 'Закрепить виджет'
      });
      pinBtn.onclick = () => {
        w.pinned = !w.pinned;
        save();
        if (window.CrosWidgets) window.CrosWidgets.render();
        renderWidgetsManagerList();
      };

      const delBtn = el('button', { className: 'widget-manager-del', textContent: '✕', title: 'Удалить виджет' });
      delBtn.onclick = () => {
        if (window.CrosWidgets) {
          window.CrosWidgets.removeWidget(w.id);
        } else {
          state.widgets = state.widgets.filter((x) => x.id !== w.id);
          save();
          renderWidgets();
        }
        renderWidgetsManagerList();
      };

      const actions = el('div', { className: 'widget-manager-actions' }, pinBtn, delBtn);
      const item = el('div', { className: 'widget-manager-item' }, info, actions);
      listEl.append(item);
    });
  }

  /* ---------- Clock designs ---------- */
  const CLOCK_BASE = { format24h: true, showSeconds: false, showDate: true, card: true, size: 2.2, weight: 400, font: 'sans', color: '', radius: 20 };
  const CLOCK_PRESETS = {
    classic: { label: 'Классика', cfg: {} },
    minimal: { label: 'Минимал', cfg: { card: false, size: 3.6, weight: 200 } },
    bold: { label: 'Жирные', cfg: { card: false, size: 4.2, weight: 700, color: 'accent' } },
    mono: { label: 'Моно', cfg: { size: 2.6, weight: 500, font: 'mono', showSeconds: true, radius: 8 } },
    serif: { label: 'Серифы', cfg: { size: 3, weight: 400, font: 'serif', radius: 28 } },
    compact: { label: 'Компакт', cfg: { size: 1.6, showDate: false, radius: 999 } },
  };
  const CLOCK_FONTS = { sans: 'inherit', mono: "'Roboto Mono', ui-monospace, monospace", serif: "Georgia, 'Times New Roman', serif", round: "'Google Sans', 'Nunito', system-ui, sans-serif" };
  const clockCfg = () => Object.assign({}, CLOCK_BASE, (CLOCK_PRESETS[state.clock.preset] || CLOCK_PRESETS.classic).cfg, state.clock.custom || {});

  function positionSearch() {
    const card = $('clock-card'), form = $('search-form');
    if (!card || !form) return;
    form.style.top = Math.round(card.getBoundingClientRect().bottom + 20) + 'px';
  }

  function applyClock() {
    const c = clockCfg(), card = $('clock-card');
    if (!card) return;
    const st = card.style;
    st.setProperty('--clock-size', c.size + 'rem');
    st.setProperty('--clock-weight', c.weight);
    st.setProperty('--clock-font', CLOCK_FONTS[c.font] || 'inherit');
    st.setProperty('--clock-radius', c.radius + 'px');
    const col = c.color === 'accent' ? 'var(--theme-accent)' : c.color;
    if (col) { st.setProperty('--clock-color', col); st.setProperty('--clock-date-color', col); }
    else { st.removeProperty('--clock-color'); st.removeProperty('--clock-date-color'); }
    card.classList.toggle('no-card', !c.card);
    window.CROS_CLOCK = { format24h: c.format24h, showSeconds: c.showSeconds, showDate: c.showDate };
    if (window.updateClock) window.updateClock();
    positionSearch();
  }

  function renderClockSettings() {
    const mount = $('clock-settings-mount');
    if (!mount) return;
    mount.replaceChildren();
    const cur = clockCfg();
    const setCustom = (patch) => { state.clock.custom = Object.assign({}, state.clock.custom || {}, patch); save(); applyClock(); };

    const presets = el('div', { className: 'clock-presets' });
    Object.entries(CLOCK_PRESETS).forEach(([key, p]) => {
      const b = el('button', { type: 'button', className: 'clock-preset' + (state.clock.preset === key && !state.clock.custom ? ' active' : ''), textContent: p.label });
      b.onclick = () => { state.clock = { preset: key }; save(); applyClock(); renderClockSettings(); };
      presets.append(b);
    });

    const check = (label, key) => {
      const cb = el('input', { type: 'checkbox', checked: !!cur[key] });
      cb.onchange = () => setCustom({ [key]: cb.checked });
      return el('label', { className: 'clock-row' }, el('span', { textContent: label }), cb);
    };
    const range = (label, key, min, max, step) => {
      const r = el('input', { type: 'range', min, max, step, value: cur[key] });
      r.oninput = () => { state.clock.custom = Object.assign({}, state.clock.custom || {}, { [key]: +r.value }); applyClock(); };
      r.onchange = () => setCustom({ [key]: +r.value });
      return el('label', { className: 'clock-row' }, el('span', { textContent: label }), r);
    };
    const fontSel = el('select', {}, ...[['sans', 'Обычный'], ['round', 'Округлый'], ['mono', 'Моноширинный'], ['serif', 'С засечками']].map(([v, t]) => el('option', { value: v, textContent: t, selected: cur.font === v })));
    fontSel.onchange = () => setCustom({ font: fontSel.value });
    const colorIn = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur.color) ? cur.color : '#8ab4f8' });
    colorIn.onchange = () => setCustom({ color: colorIn.value });
    const themeColor = el('button', { type: 'button', className: 'btn', textContent: 'Тема' });
    themeColor.onclick = () => { setCustom({ color: '' }); renderClockSettings(); };
    const reset = el('button', { type: 'button', className: 'btn', textContent: 'Сбросить свои настройки' });
    reset.onclick = () => { state.clock = { preset: state.clock.preset }; save(); applyClock(); renderClockSettings(); };

    mount.append(el('div', { className: 'settings-section settings-extra' },
      el('div', { className: 'section-label', textContent: 'Часы' }),
      el('div', { className: 'section-desc', textContent: 'Готовые дизайны и свои настройки' }),
      presets,
      check('24-часовой формат', 'format24h'), check('Секунды', 'showSeconds'), check('Показывать дату', 'showDate'), check('Фон-карточка', 'card'),
      range('Размер', 'size', 1.2, 6, 0.1), range('Толщина', 'weight', 100, 800, 100), range('Скругление', 'radius', 0, 40, 2),
      el('label', { className: 'clock-row' }, el('span', { textContent: 'Шрифт' }), fontSel),
      el('div', { className: 'clock-row' }, el('span', { textContent: 'Цвет' }), el('span', {}, colorIn, themeColor)),
      el('div', { className: 'btn-row' }, reset)
    ));
  }

  /* ---------- Wallpaper ---------- */
  function applyWallpaper() {
    const wp = state.wallpaper;
    const wpEl = $('wallpaper');
    const dimEl = $('wallpaper-dim');
    if (!wpEl || !dimEl) return;

    let hasWp = false;
    let bgImg = '';
    let bgColor = '';

    if (typeof wp === 'string' && wp) {
      bgImg = `url("${wp.replace(/"/g, '%22')}")`;
      hasWp = true;
    } else if (wp && typeof wp === 'object') {
      if (wp.type === 'color' && wp.value) {
        bgColor = wp.value;
        hasWp = true;
      } else if ((wp.type === 'image' || wp.type === 'url') && wp.value) {
        bgImg = `url("${wp.value.replace(/"/g, '%22')}")`;
        hasWp = true;
      }
    }

    wpEl.style.backgroundImage = bgImg;
    wpEl.style.backgroundColor = bgColor;
    document.body.classList.toggle('has-wallpaper', hasWp);
    dimEl.style.opacity = hasWp ? (typeof state.dim === 'number' ? state.dim : 0.3) : 0;
  }

  function fileToWallpaper(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 2560, k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(); };
      img.src = url;
    });
  }

  /* ---------- Settings panel additions ---------- */
  function initSettings() {
    // 1. Settings Tab Navigation
    const tabBtns = document.querySelectorAll('.settings-tab-btn');
    const tabPanes = document.querySelectorAll('.settings-tab-pane');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        tabBtns.forEach((b) => b.classList.toggle('active', b === btn));
        tabPanes.forEach((pane) => {
          const matches = pane.id === `tab-pane-${target}`;
          pane.classList.toggle('active', matches);
          pane.style.display = matches ? 'block' : 'none';
        });
        if (target === 'widgets') {
          renderWidgetsManagerList();
        }
        if (target === 'google') {
          renderGoogleSettings();
        }
      });
    });

    renderClockSettings();

    // 2. Widgets tab catalog button
    const addWidgetBtn = $('btn-add-widget-catalog');
    if (addWidgetBtn) {
      addWidgetBtn.onclick = addWidgetCatalogDialog;
    }

    // 3. Mount Wallpaper Controls in Appearance Tab
    const wpMount = $('wallpaper-settings-mount');
    if (wpMount) {
      wpMount.replaceChildren();
      const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
      fileInput.addEventListener('change', async () => {
        if (!fileInput.files[0]) return;
        try {
          const dataUrl = await fileToWallpaper(fileInput.files[0]);
          state.wallpaper = { type: 'image', value: dataUrl };
          save();
          applyWallpaper();
        } catch (_) {}
        fileInput.value = '';
      });

      const upload = el('button', { className: 'btn', textContent: 'Загрузить файл' });
      upload.onclick = () => fileInput.click();

      const byUrl = el('button', { className: 'btn', textContent: 'По ссылке' });
      byUrl.onclick = () => dialog('Обои по ссылке', [{ name: 'url', label: 'URL изображения', required: true }], (v) => {
        const u = safeUrl(v.url);
        if (u) {
          state.wallpaper = { type: 'url', value: u };
          save();
          applyWallpaper();
        }
      });

      const reset = el('button', { className: 'btn', textContent: 'Сбросить' });
      reset.onclick = () => {
        state.wallpaper = { type: 'default', value: '' };
        save();
        applyWallpaper();
      };

      const dim = el('input', {
        type: 'range',
        className: 'cros-range',
        min: 0,
        max: 0.85,
        step: 0.05,
        value: typeof state.dim === 'number' ? state.dim : 0.3
      });
      dim.oninput = () => {
        state.dim = +dim.value;
        applyWallpaper();
      };
      dim.onchange = save;

      const sec = (title, ...kids) => el('div', { className: 'settings-section settings-extra' },
        el('div', { className: 'section-label', textContent: title }), ...kids);

      wpMount.append(
        sec('Обои рабочего стола',
          el('div', { className: 'btn-row' }, upload, byUrl, reset),
          el('div', { className: 'section-desc', textContent: 'Затемнение' }),
          dim,
          fileInput
        )
      );
    }

    // 4. Mount Desktop Controls Tab
    const desktopMount = $('desktop-settings-mount');
    if (desktopMount) {
      desktopMount.replaceChildren();

      // Fullscreen controls
      const autoFs = el('input', { type: 'checkbox', checked: !!state.autoFullscreen });
      autoFs.onchange = () => {
        state.autoFullscreen = autoFs.checked;
        save();
      };
      const fsBtn = el('button', { className: 'btn', textContent: 'Во весь экран (F11)' });
      fsBtn.onclick = toggleFullscreen;

      // Desktop shortcuts management
      const addSc = el('button', { className: 'btn', textContent: '+ Ярлык' });
      addSc.onclick = addShortcutDialog;
      const addApp = el('button', { className: 'btn', textContent: '+ Приложение Chrome' });
      addApp.onclick = addAppDialog;

      const sec = (title, ...kids) => el('div', { className: 'settings-section settings-extra' },
        el('div', { className: 'section-label', textContent: title }), ...kids);

      desktopMount.append(
        sec('Полноэкранный режим',
          el('div', { className: 'btn-row' }, fsBtn),
          el('label', { className: 'settings-check' }, autoFs, document.createTextNode('Входить в полный экран по первому клику'))
        ),
        sec('Ярлыки рабочего стола',
          el('div', { className: 'section-desc', textContent: 'Ссылки из ярлыков всегда открываются в новой вкладке.' }),
          el('div', { className: 'btn-row' }, addSc, addApp)
        )
      );
    }

    // 5. Mount Google Settings Tab (R2 Integration)
    renderGoogleSettings();
  }

  function renderGoogleSettings() {
    const mount = $('google-settings-mount');
    if (!mount) return;
    mount.replaceChildren();

    state.google = state.google || { clientId: '', mockMode: false };

    const sec = (title, ...kids) => el('div', { className: 'settings-section settings-extra' },
      el('div', { className: 'section-label', textContent: title }), ...kids);

    // 1. Client ID input & save button
    const clientIdInput = el('input', {
      type: 'text',
      className: 'cros-input google-input-client-id',
      placeholder: 'xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com',
      value: state.google.clientId || ''
    });

    const saveStatus = el('span', { className: 'google-save-status', textContent: '' });

    const saveBtn = el('button', {
      className: 'btn btn-primary',
      textContent: 'Сохранить',
      onclick: async () => {
        const val = clientIdInput.value.trim();
        state.google.clientId = val;
        if (window.GoogleService) {
          window.GoogleService.configure({ clientId: val });
        }
        await save();
        saveStatus.textContent = 'Сохранено ✓';
        setTimeout(() => { saveStatus.textContent = ''; }, 2500);
        renderGoogleSettings();
        if (window.CrosWidgets) window.CrosWidgets.render();
      }
    });

    const inputRow = el('div', { className: 'google-input-row' }, clientIdInput, saveBtn);

    // 2. Authentication Status & Login/Logout
    const authStatusBadge = el('div', { className: 'google-auth-status-badge' });
    const authActionBtn = el('button', { className: 'btn' });
    const authMessage = el('div', { className: 'google-auth-message' });

    const updateAuthDisplay = async () => {
      const isMock = !!state.google.mockMode;
      const isAuth = window.GoogleService ? await window.GoogleService.isAuthenticated() : false;
      const hasClientId = Boolean(state.google.clientId);

      if (isMock) {
        authStatusBadge.className = 'google-status-pill pill-mock';
        authStatusBadge.textContent = '🟡 Демо-режим (Mock data)';
        authActionBtn.style.display = 'none';
        authMessage.textContent = 'Виджеты отображают демонстрационные данные без Google Cloud аккаунта.';
      } else if (isAuth) {
        authStatusBadge.className = 'google-status-pill pill-online';
        authStatusBadge.textContent = '🟢 Подключено к Google';
        authActionBtn.style.display = 'inline-block';
        authActionBtn.textContent = 'Выйти';
        authActionBtn.className = 'btn btn-danger';
        authActionBtn.onclick = async () => {
          if (window.GoogleService) await window.GoogleService.logout();
          await updateAuthDisplay();
          if (window.CrosWidgets) window.CrosWidgets.render();
        };
        authMessage.textContent = 'Сессия активна. События календаря, почта и диск синхронизируются.';
      } else if (!hasClientId) {
        authStatusBadge.className = 'google-status-pill pill-offline';
        authStatusBadge.textContent = '⚪ Client ID не настроен';
        authActionBtn.style.display = 'none';
        authMessage.textContent = 'Введите ваш OAuth Client ID ниже или включите тестовый демо-режим.';
      } else {
        authStatusBadge.className = 'google-status-pill pill-offline';
        authStatusBadge.textContent = '⚪ Не авторизован';
        authActionBtn.style.display = 'inline-block';
        authActionBtn.textContent = 'Войти через Google';
        authActionBtn.className = 'btn btn-primary';
        authActionBtn.onclick = async () => {
          try {
            authActionBtn.disabled = true;
            authActionBtn.textContent = 'Авторизация…';
            if (window.GoogleService) {
              await window.GoogleService.login();
            }
            await updateAuthDisplay();
            if (window.CrosWidgets) window.CrosWidgets.render();
          } catch (e) {
            authMessage.textContent = 'Ошибка авторизации: ' + e.message;
          } finally {
            authActionBtn.disabled = false;
          }
        };
        authMessage.textContent = 'Нажмите для интерактивного входа через Google OAuth.';
      }
    };
    updateAuthDisplay();

    // 3. Mock Mode Toggle
    const mockCb = el('input', { type: 'checkbox', checked: !!state.google.mockMode });
    mockCb.onchange = async () => {
      state.google.mockMode = mockCb.checked;
      if (window.GoogleService) {
        window.GoogleService.configure({ mockMode: mockCb.checked });
      }
      await save();
      await updateAuthDisplay();
      if (window.CrosWidgets) window.CrosWidgets.render();
    };

    // 4. Redirect URI with Copy Button
    const redirectUrl = (window.GoogleService && window.GoogleService.getRedirectUrl())
      || (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getRedirectURL ? chrome.identity.getRedirectURL() : 'https://extension-id.chromiumapp.org/');

    const redirectCode = el('code', { className: 'google-redirect-code', textContent: redirectUrl });
    const copyBtn = el('button', {
      className: 'btn btn-sm',
      textContent: 'Копировать',
      onclick: () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(redirectUrl).then(() => {
            copyBtn.textContent = 'Скопировано!';
            setTimeout(() => { copyBtn.textContent = 'Копировать'; }, 2000);
          }).catch(() => {
            copyBtn.textContent = 'Ошибка';
          });
        } else {
          copyBtn.textContent = 'Скопировано';
        }
      }
    });

    const redirectBox = el('div', { className: 'google-redirect-box' }, redirectCode, copyBtn);

    // 5. Setup instructions
    const instructions = el('div', { className: 'google-instructions' },
      el('ol', {},
        el('li', {}, 'Откройте Google Cloud Console: console.cloud.google.com'),
        el('li', {}, 'Создайте проект и включите: Calendar API, Gmail API, Drive API.'),
        el('li', {}, 'В разделе «Экран согласия OAuth» выберите «Внешний», укажите контактный email и добавьте свой аккаунт в «Тестовые пользователи».'),
        el('li', {}, 'В «Учетные данные» -> «Создать» -> «Идентификатор клиента OAuth» выберите «Веб-приложение».'),
        el('li', {}, 'В «Разрешенные URL-адреса перенаправления» добавьте адрес:'),
        redirectBox,
        el('li', {}, 'Скопируйте Client ID, вставьте в поле выше и нажмите «Сохранить».')
      )
    );

    // 6. Ecosystem shortcuts helper
    const addShortcutsBtn = el('button', {
      className: 'btn',
      textContent: '+ Добавить ярлыки Google на рабочий стол',
      onclick: async () => {
        if (!window.GoogleService) return;
        const shortcutsCatalog = window.GoogleService.getGoogleShortcuts();
        let addedCount = 0;
        shortcutsCatalog.forEach((sc) => {
          if (!state.shortcuts.some((s) => s.url === sc.url)) {
            state.shortcuts.push(sc);
            addedCount++;
          }
        });
        if (addedCount > 0) {
          await save();
          renderShortcuts();
        }
        addShortcutsBtn.textContent = `Добавлено ${addedCount} ярлыков ✓`;
        setTimeout(() => { addShortcutsBtn.textContent = '+ Добавить ярлыки Google на рабочий стол'; }, 2500);
      }
    });

    mount.append(
      sec('Учетная запись Google',
        el('div', { className: 'google-status-row' }, authStatusBadge, authActionBtn),
        authMessage
      ),
      sec('OAuth Client ID',
        el('div', { className: 'section-desc', textContent: 'Идентификатор клиента веб-приложения из Google Cloud Console' }),
        inputRow,
        saveStatus
      ),
      sec('Тестовый режим (Mock data)',
        el('label', { className: 'settings-check' }, mockCb,
          el('div', {},
            el('strong', { textContent: 'Включить демо-режим (Mock data)' }),
            el('div', { className: 'section-desc', textContent: 'Полноценный просмотр виджетов Календаря, Gmail и Диска без учетной записи Cloud' })
          )
        )
      ),
      sec('Инструкция по настройке',
        instructions
      ),
      sec('Сервисы Google',
        el('div', { className: 'section-desc', textContent: 'Быстрые ссылки на Google One, Keep, Photos, Meet, Docs, Sheets и др.' }),
        el('div', { className: 'btn-row' }, addShortcutsBtn)
      )
    );
  }

  /* ---------- Init ---------- */
  async function initDesktop() {
    // 1. Storage migration (cros_v2 -> cros_v3)
    const res = await store.get(['cros_v3', 'cros_v2']);
    const migrated = migrateStorage(res);
    Object.assign(state, migrated);
    await save();

    // 2. Synchronize GoogleService configuration
    if (window.GoogleService) {
      window.GoogleService.configure({
        clientId: state.google ? state.google.clientId : '',
        mockMode: state.google ? !!state.google.mockMode : false
      });
    }

    // 3. Initialize desktop subsystems
    initSearch();
    renderShortcuts();

    if (window.CrosWidgets) {
      window.CrosWidgets.init({
        container: $('widgets'),
        getWidgets: () => state.widgets,
        onSave: () => {
          save();
          renderWidgetsManagerList();
        }
      });
    }

    applyWallpaper();
    applyClock();
    if (window.ResizeObserver) new ResizeObserver(positionSearch).observe($('clock-card'));
    initSettings();
    renderWidgetsManagerList();

    // Desktop Context Menu
    document.addEventListener('contextmenu', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      menu(e.clientX, e.clientY, [
        ['Новый ярлык', addShortcutDialog],
        ['Ярлык приложения…', addAppDialog],
        ['Новый виджет', addWidgetCatalogDialog],
        ['Настройки и обои', () => $('settings-toggle').click()],
      ]);
    });

    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.ctx-menu')) document.querySelectorAll('.ctx-menu').forEach((m) => m.remove());
      if (!e.target.closest('.shortcut')) document.querySelectorAll('.shortcut.selected').forEach((n) => n.classList.remove('selected'));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.ctx-menu').forEach((m) => m.remove());
    });

    let rt;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(renderShortcuts, 150);
      positionSearch();
    });

    // Browsers require a user gesture to enter fullscreen
    document.addEventListener('pointerdown', () => {
      if (state.autoFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }, { once: true });
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', initDesktop);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { migrateStorage, state, save };
  }
})();

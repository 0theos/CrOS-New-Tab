/* CrOS New Tab 0.2 — fullscreen, search, shortcuts, widgets, wallpapers */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

  const store = {
    get: (keys) => hasChrome
      ? new Promise((r) => chrome.storage.local.get(keys, r))
      : Promise.resolve(Object.fromEntries(keys.map((k) => [k, JSON.parse(localStorage.getItem(k) || 'null')]))),
    set: (obj) => hasChrome
      ? new Promise((r) => chrome.storage.local.set(obj, r))
      : (Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v))), Promise.resolve()),
  };

  const state = { shortcuts: [], widgets: [], wallpaper: null, dim: 0.3, autoFullscreen: false };
  const save = () => store.set({ cros_v2: state });

  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    kids.forEach((k) => n.append(k));
    return n;
  };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const normUrl = (u) => (/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : 'https://' + u);
  const safeUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(normUrl(u)).protocol) ? normUrl(u) : null; } catch { return null; } };

  /* ---------- Fullscreen ---------- */
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };

  /* ---------- Search ---------- */
  function initSearch() {
    const form = $('search-form'), input = $('search-input');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      const direct = /^(https?:\/\/|[\w-]+(\.[\w-]+)+(\/|$))/i.test(q) && !/\s/.test(q);
      if (direct) { location.href = normUrl(q); }
      else if (chrome.search && chrome.search.query) chrome.search.query({ text: q, disposition: 'CURRENT_TAB' });
      else location.href = 'https://www.google.com/search?q=' + encodeURIComponent(q);
    });
    // Quick access: type anywhere, or "/" to focus
    document.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '/' ) { e.preventDefault(); input.focus(); }
      else if (e.key.length === 1) input.focus();
    });
    setTimeout(() => input.focus(), 50);
  }

  /* ---------- Shortcuts ---------- */
  function renderShortcuts() {
    const box = $('shortcuts');
    box.replaceChildren();
    state.shortcuts.forEach((s) => {
      const url = safeUrl(s.url);
      if (!url) return;
      const icon = el('div', { className: 'shortcut-icon' });
      const img = el('img', { alt: '' });
      img.src = 'https://www.google.com/s2/favicons?sz=64&domain_url=' + encodeURIComponent(url);
      img.onerror = () => icon.replaceChildren(document.createTextNode((s.title || '?')[0].toUpperCase()));
      icon.append(img);
      const rm = el('button', { className: 'item-remove', textContent: '✕', title: 'Удалить' });
      rm.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        state.shortcuts = state.shortcuts.filter((x) => x.id !== s.id);
        save(); renderShortcuts();
      });
      box.append(el('a', { className: 'shortcut', href: url }, icon, el('div', { className: 'shortcut-title', textContent: s.title || url }), rm));
    });
    const add = el('button', { className: 'shortcut shortcut-add', title: 'Добавить ярлык' },
      el('div', { className: 'shortcut-icon', textContent: '+' }), el('div', { className: 'shortcut-title', textContent: 'Добавить' }));
    add.addEventListener('click', addShortcutDialog);
    box.append(add);
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
    Object.values(inputs)[0].focus();
  }

  function addShortcutDialog() {
    dialog('Новый ярлык', [
      { name: 'title', label: 'Название', placeholder: 'YouTube' },
      { name: 'url', label: 'Адрес', placeholder: 'youtube.com', required: true },
    ], (v) => {
      if (!safeUrl(v.url)) return;
      state.shortcuts.push({ id: uid(), title: v.title, url: normUrl(v.url) });
      save(); renderShortcuts();
    });
  }

  /* ---------- Widgets ---------- */
  const WIDGET_TYPES = [['note', 'Заметка'], ['todo', 'Список дел'], ['countdown', 'Обратный отсчёт'], ['embed', 'Веб-страница (iframe)']];
  const widgetTimers = [];

  function renderWidgets() {
    widgetTimers.splice(0).forEach(clearInterval);
    const box = $('widgets');
    box.replaceChildren();
    state.widgets.forEach((w) => {
      const body = el('div', { className: 'widget' }, el('div', { className: 'widget-title', textContent: w.title || '' }));
      const rm = el('button', { className: 'item-remove', textContent: '✕', title: 'Удалить виджет' });
      rm.addEventListener('click', () => {
        state.widgets = state.widgets.filter((x) => x.id !== w.id);
        save(); renderWidgets();
      });
      body.append(rm);
      WIDGET_BUILDERS[w.type]?.(w, body);
      box.append(body);
    });
  }

  const WIDGET_BUILDERS = {
    note(w, body) {
      const ta = el('textarea', { value: w.text || '', placeholder: 'Текст заметки…' });
      ta.addEventListener('input', () => { w.text = ta.value; save(); });
      body.append(ta);
    },
    todo(w, body) {
      w.items = w.items || [];
      const list = el('div');
      const draw = () => {
        list.replaceChildren();
        w.items.forEach((it, i) => {
          const cb = el('input', { type: 'checkbox', checked: !!it.done });
          cb.onchange = () => { it.done = cb.checked; save(); draw(); };
          const del = el('button', { textContent: '✕' });
          del.onclick = () => { w.items.splice(i, 1); save(); draw(); };
          list.append(el('div', { className: 'todo-item' + (it.done ? ' done' : '') }, cb, el('span', { textContent: it.text }), del));
        });
      };
      const inp = el('input', { type: 'text', placeholder: 'Новая задача, Enter' });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && inp.value.trim()) { w.items.push({ text: inp.value.trim(), done: false }); inp.value = ''; save(); draw(); }
      });
      draw();
      body.append(list, inp);
    },
    countdown(w, body) {
      const out = el('div', { className: 'countdown-value' });
      const tick = () => {
        const d = new Date(w.date).getTime() - Date.now();
        if (isNaN(d)) { out.textContent = '—'; return; }
        if (d <= 0) { out.textContent = 'Наступило!'; return; }
        const days = Math.floor(d / 864e5), h = Math.floor(d / 36e5) % 24, m = Math.floor(d / 6e4) % 60;
        out.textContent = `${days}д ${h}ч ${m}м`;
      };
      tick();
      widgetTimers.push(setInterval(tick, 30000));
      body.append(out);
    },
    embed(w, body) {
      const url = safeUrl(w.url || '');
      if (url) body.append(el('iframe', { src: url, referrerPolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups' }));
    },
  };

  function addWidgetDialog() {
    dialog('Новый виджет', [
      { name: 'type', label: 'Тип', options: WIDGET_TYPES },
      { name: 'title', label: 'Заголовок', placeholder: 'Мой виджет' },
      { name: 'extra', label: 'Для отсчёта — дата и время (ГГГГ-ММ-ДД ЧЧ:ММ); для iframe — адрес', placeholder: '2026-12-31 20:00 или example.com' },
    ], (v) => {
      const w = { id: uid(), type: v.type, title: v.title };
      if (v.type === 'countdown') w.date = v.extra.replace(' ', 'T');
      if (v.type === 'embed') { if (!safeUrl(v.extra)) return; w.url = normUrl(v.extra); }
      state.widgets.push(w);
      save(); renderWidgets();
    });
  }

  /* ---------- Wallpaper ---------- */
  function applyWallpaper() {
    $('wallpaper').style.backgroundImage = state.wallpaper ? `url("${state.wallpaper.replace(/"/g, '%22')}")` : '';
    $('wallpaper-dim').style.opacity = state.wallpaper ? state.dim : 0;
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
    const panel = $('settings-panel');
    const fileInput = el('input', { type: 'file', accept: 'image/*', hidden: true });
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files[0]) return;
      try { state.wallpaper = await fileToWallpaper(fileInput.files[0]); save(); applyWallpaper(); } catch { /* ignore */ }
      fileInput.value = '';
    });
    const upload = el('button', { className: 'btn', textContent: 'Загрузить файл' });
    upload.onclick = () => fileInput.click();
    const byUrl = el('button', { className: 'btn', textContent: 'По ссылке' });
    byUrl.onclick = () => dialog('Обои по ссылке', [{ name: 'url', label: 'URL изображения', required: true }], (v) => {
      const u = safeUrl(v.url);
      if (u) { state.wallpaper = u; save(); applyWallpaper(); }
    });
    const reset = el('button', { className: 'btn', textContent: 'Сбросить' });
    reset.onclick = () => { state.wallpaper = null; save(); applyWallpaper(); };
    const dim = el('input', { type: 'range', className: 'cros-range', min: 0, max: 0.85, step: 0.05, value: state.dim });
    dim.oninput = () => { state.dim = +dim.value; applyWallpaper(); };
    dim.onchange = save;

    const autoFs = el('input', { type: 'checkbox', checked: state.autoFullscreen });
    autoFs.onchange = () => { state.autoFullscreen = autoFs.checked; save(); };
    const fsBtn = el('button', { className: 'btn', textContent: 'Во весь экран (F11)' });
    fsBtn.onclick = toggleFullscreen;

    const addSc = el('button', { className: 'btn', textContent: '+ Ярлык' });
    addSc.onclick = addShortcutDialog;
    const addW = el('button', { className: 'btn', textContent: '+ Виджет' });
    addW.onclick = addWidgetDialog;

    const sec = (title, ...kids) => el('div', { className: 'settings-section settings-extra' },
      el('div', { className: 'section-label', textContent: title }), ...kids);
    panel.append(
      sec('Обои', el('div', { className: 'btn-row' }, upload, byUrl, reset), el('div', { className: 'section-desc', textContent: 'Затемнение' }), dim, fileInput),
      sec('Полноэкранный режим', el('div', { className: 'btn-row' }, fsBtn),
        el('label', { className: 'settings-check' }, autoFs, document.createTextNode('Входить в полный экран по первому клику'))),
      sec('Содержимое', el('div', { className: 'btn-row' }, addSc, addW)),
    );
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', async () => {
    const res = await store.get(['cros_v2']);
    Object.assign(state, res.cros_v2 || {});
    initSearch();
    renderShortcuts();
    renderWidgets();
    applyWallpaper();
    initSettings();
    $('widget-add').addEventListener('click', addWidgetDialog);
    $('fullscreen-toggle').addEventListener('click', toggleFullscreen);
    // Browsers require a user gesture to enter fullscreen
    document.addEventListener('pointerdown', () => {
      if (state.autoFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    }, { once: true });
  });
})();

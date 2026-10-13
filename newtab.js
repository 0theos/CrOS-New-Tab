/**
 * CrOS Material 3 Digital Clock & Browser Theme Color Sync
 */

// 1. Clock Logic
function updateClock() {
  const now = new Date();

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const dateEl = document.getElementById('clock-date');

  if (hoursEl && hoursEl.textContent !== hours) {
    hoursEl.textContent = hours;
  }

  if (minutesEl && minutesEl.textContent !== minutes) {
    minutesEl.textContent = minutes;
  }

  if (dateEl) {
    const locale = navigator.language || 'ru-RU';
    const formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    const dateStr = formatter.format(now);
    const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    if (dateEl.textContent !== formattedDate) {
      dateEl.textContent = formattedDate;
    }
  }
}

updateClock();
const delayToNextSecond = 1000 - (new Date().getMilliseconds());
setTimeout(() => {
  updateClock();
  setInterval(updateClock, 1000);
}, delayToNextSecond);


// 2. Color Utility Functions
function parseColorToRgb(colorStr) {
  if (!colorStr) return null;
  colorStr = colorStr.trim();

  // Hex format (#rgb or #rrggbb)
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      };
    }
  }

  // RGB / RGBA format
  const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10)
    };
  }

  return null;
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}


// 3. Theme Application Engine
function applyThemeColor(colorInput, sourceName = 'пользовательский') {
  const rgb = parseColorToRgb(colorInput);
  if (!rgb) return;

  const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

  // Calculate relative luminance: (0.2126 * R + 0.7152 * G + 0.0722 * B)
  const lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
  const isDark = lum < 135;

  const root = document.documentElement;

  // Set page background to exact browser theme color
  root.style.setProperty('--theme-bg', hex);

  if (isDark) {
    root.style.setProperty('--theme-text', '#ffffff');
    root.style.setProperty('--theme-text-subtle', 'rgba(255, 255, 255, 0.72)');
    root.style.setProperty('--theme-card-bg', 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--theme-card-border', 'rgba(255, 255, 255, 0.12)');
    root.style.setProperty('--theme-shadow', '0 4px 20px rgba(0, 0, 0, 0.25)');
  } else {
    root.style.setProperty('--theme-text', '#1f1f1f');
    root.style.setProperty('--theme-text-subtle', 'rgba(0, 0, 0, 0.65)');
    root.style.setProperty('--theme-card-bg', 'rgba(0, 0, 0, 0.05)');
    root.style.setProperty('--theme-card-border', 'rgba(0, 0, 0, 0.08)');
    root.style.setProperty('--theme-shadow', '0 4px 20px rgba(0, 0, 0, 0.06)');
  }

  // Update UI indicators
  const hexEl = document.getElementById('active-hex');
  if (hexEl) hexEl.textContent = hex.toUpperCase();

  const statusEl = document.getElementById('theme-status-info');
  if (statusEl) statusEl.textContent = `Цвет: ${hex.toUpperCase()} (${sourceName})`;

  // Save to chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      browser_theme_color: hex,
      browser_theme_source: sourceName
    });
  } else {
    localStorage.setItem('browser_theme_color', hex);
  }
}


// 4. Browser Theme Detection Engine
async function detectBrowserTheme() {
  // Method A: Check for Chrome Themes installed via chrome.management
  if (typeof chrome !== 'undefined' && chrome.management && chrome.management.getAll) {
    try {
      const extensions = await new Promise(res => chrome.management.getAll(res));
      const activeTheme = extensions.find(e => e.type === 'theme' && e.enabled);

      if (activeTheme) {
        console.log('[CrOS NewTab] Найдена установленная тема Chrome:', activeTheme.name);
        const knownThemes = {
          'Classic Blue': '#2a56c6',
          'Just Black': '#202124',
          'Slate': '#4f5b66',
          'Oceanic': '#2e7d6b',
          'Sea Foam': '#80cbc4',
          'Rose Gold': '#b76e79',
          'Banana': '#ffe135',
          'High Contrast': '#000000',
          'Nord': '#2e3440',
          'Dracula': '#282a36'
        };

        if (knownThemes[activeTheme.name]) {
          applyThemeColor(knownThemes[activeTheme.name], `тема "${activeTheme.name}"`);
          return;
        }
      }
    } catch (e) {
      console.warn('Management API error:', e);
    }
  }

  // Method B: CSS System AccentColor Detection
  const probe = document.createElement('div');
  probe.style.cssText = 'color: AccentColor !important; position: absolute; visibility: hidden;';
  document.body.appendChild(probe);
  const accentComputed = getComputedStyle(probe).color;
  document.body.removeChild(probe);

  const rgb = parseColorToRgb(accentComputed);
  if (rgb && !(rgb.r === 0 && rgb.g === 0 && rgb.b === 0) && !(rgb.r === 255 && rgb.g === 255 && rgb.b === 255)) {
    applyThemeColor(rgbToHex(rgb.r, rgb.g, rgb.b), 'системный акцент');
    return;
  }

  // Method C: Chrome Default (prefers-color-scheme)
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyThemeColor(isDark ? '#202124' : '#ffffff', 'по умолчанию');
}


// 5. Initialize & Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  // Restore saved theme color if available
  let savedColor = null;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const res = await new Promise(r => chrome.storage.local.get(['browser_theme_color', 'browser_theme_source'], r));
    if (res && res.browser_theme_color) {
      savedColor = res.browser_theme_color;
      applyThemeColor(savedColor, res.browser_theme_source || 'сохраненный');
    }
  } else {
    savedColor = localStorage.getItem('browser_theme_color');
    if (savedColor) applyThemeColor(savedColor, 'сохраненный');
  }

  if (!savedColor) {
    await detectBrowserTheme();
  }

  // Auto-detect button
  document.getElementById('btn-autodetect')?.addEventListener('click', async () => {
    await detectBrowserTheme();
  });

  // Native EyeDropper API (1-click sampling of browser frame / toolbar)
  const btnEyedropper = document.getElementById('btn-eyedropper');
  if (btnEyedropper) {
    if ('EyeDropper' in window) {
      btnEyedropper.addEventListener('click', async () => {
        try {
          const eyeDropper = new window.EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            applyThemeColor(result.sRGBHex, 'пипетка');
          }
        } catch (err) {
          // User canceled selection or not allowed
          console.log('EyeDropper canceled:', err);
        }
      });
    } else {
      btnEyedropper.style.display = 'none';
    }
  }

  // Preset Chrome 2023 Refresh Theme Swatches
  const chromePalettes = [
    '#202124', // Chrome Dark
    '#ffffff', // Chrome White
    '#2a56c6', // Classic Blue
    '#1a73e8', // Google Blue
    '#00897b', // Teal / Sea Foam
    '#2e7d32', // Forest Green
    '#ff8f00', // Amber / Sun
    '#e53935', // Coral / Rose
    '#7c4dff', // Purple
    '#9c27b0', // Fuchsia
    '#4f5b66', // Slate
    '#8d6e63', // Desert Warm
    '#37474f', // Deep Charcoal
    '#006064'  // Deep Cyan
  ];

  const swatchesContainer = document.getElementById('swatches-container');
  if (swatchesContainer) {
    chromePalettes.forEach(hex => {
      const btn = document.createElement('button');
      btn.className = 'swatch-btn';
      btn.style.backgroundColor = hex;
      btn.title = hex;
      btn.addEventListener('click', () => {
        applyThemeColor(hex, 'палитра');
      });
      swatchesContainer.appendChild(btn);
    });
  }

  // Floating Widget Toggle
  const widgetWrap = document.getElementById('theme-widget');
  const triggerBtn = document.getElementById('theme-trigger');

  triggerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    widgetWrap?.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (widgetWrap && !widgetWrap.contains(e.target)) {
      widgetWrap.classList.remove('open');
    }
  });

  // Listen to prefers-color-scheme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['browser_theme_color', 'browser_theme_source'], (data) => {
        if (!data.browser_theme_color || data.browser_theme_source === 'по умолчанию') {
          applyThemeColor(e.matches ? '#202124' : '#ffffff', 'по умолчанию');
        }
      });
    }
  });
});

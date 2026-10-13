/**
 * CrOS Material 3 New Tab — Clock & Harmonic Palette System
 */

// ==========================================
// 1. Digital Clock Logic
// ==========================================
function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');

  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const dateEl = document.getElementById('clock-date');

  if (hoursEl && hoursEl.textContent !== hours) hoursEl.textContent = hours;
  if (minutesEl && minutesEl.textContent !== minutes) minutesEl.textContent = minutes;

  if (dateEl) {
    const locale = navigator.language || 'ru-RU';
    const formatter = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    const dateStr = formatter.format(now);
    const formattedDate = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    if (dateEl.textContent !== formattedDate) dateEl.textContent = formattedDate;
  }
}

updateClock();
setTimeout(() => {
  updateClock();
  setInterval(updateClock, 1000);
}, 1000 - new Date().getMilliseconds());


// ==========================================
// 2. Color Conversion & Harmonic Palette Math
// ==========================================
function hexToRgb(hex) {
  hex = hex.replace('#', '').trim();
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length !== 6) return null;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  h = (h % 360 + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 60) { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
  else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
  else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
  else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
  else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}


// ==========================================
// 3. Harmonic Theme Applicator
// ==========================================
function applyHarmonicTheme(hexColor, isAuto = false) {
  const root = document.documentElement;

  if (isAuto) {
    root.removeAttribute('data-custom-theme');
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (isDark) {
      root.style.setProperty('--theme-bg', '#1e1f22');
      root.style.setProperty('--theme-surface', 'rgba(255, 255, 255, 0.07)');
      root.style.setProperty('--theme-surface-high', 'rgba(255, 255, 255, 0.12)');
      root.style.setProperty('--theme-border', 'rgba(255, 255, 255, 0.10)');
      root.style.setProperty('--theme-accent', '#8ab4f8');
      root.style.setProperty('--theme-text', '#f2f2f2');
      root.style.setProperty('--theme-text-subtle', '#9aa0a6');
      root.style.setProperty('--theme-ambient', 'rgba(138, 180, 248, 0.05)');
    } else {
      root.style.setProperty('--theme-bg', '#f8f9fa');
      root.style.setProperty('--theme-surface', 'rgba(0, 0, 0, 0.04)');
      root.style.setProperty('--theme-surface-high', 'rgba(0, 0, 0, 0.08)');
      root.style.setProperty('--theme-border', 'rgba(0, 0, 0, 0.08)');
      root.style.setProperty('--theme-accent', '#1a73e8');
      root.style.setProperty('--theme-text', '#1f1f1f');
      root.style.setProperty('--theme-text-subtle', '#5f6368');
      root.style.setProperty('--theme-ambient', 'rgba(26, 115, 232, 0.04)');
    }

    savePreference('auto', null);
    return;
  }

  const rgb = hexToRgb(hexColor);
  if (!rgb) return;

  root.setAttribute('data-custom-theme', 'true');
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const isDark = hsl.l < 0.55;

  // Harmonic color generation derived from the base color
  const lSurface = isDark ? Math.min(0.96, hsl.l + 0.08) : Math.max(0.88, hsl.l - 0.06);
  const lSurfaceHigh = isDark ? Math.min(0.98, hsl.l + 0.15) : Math.max(0.82, hsl.l - 0.12);

  // Vibrant accent for highlights, date, active rings
  const lAccent = isDark ? 0.72 : 0.42;
  const sAccent = Math.max(0.55, Math.min(1.0, hsl.s * 1.35));

  // Contrasting text with harmonious tint
  const lText = isDark ? 0.95 : 0.12;
  const lSubtle = isDark ? 0.74 : 0.40;

  const rgbSurface = hslToRgb(hsl.h, hsl.s * 0.9, lSurface);
  const rgbSurfaceHigh = hslToRgb(hsl.h, hsl.s * 0.9, lSurfaceHigh);
  const rgbAccent = hslToRgb(hsl.h, sAccent, lAccent);
  const rgbText = hslToRgb(hsl.h, hsl.s * 0.18, lText);
  const rgbSubtle = hslToRgb(hsl.h, hsl.s * 0.18, lSubtle);

  root.style.setProperty('--theme-bg', hexColor);
  root.style.setProperty('--theme-surface', `rgba(${rgbSurface[0]}, ${rgbSurface[1]}, ${rgbSurface[2]}, ${isDark ? 0.6 : 0.7})`);
  root.style.setProperty('--theme-surface-high', `rgba(${rgbSurfaceHigh[0]}, ${rgbSurfaceHigh[1]}, ${rgbSurfaceHigh[2]}, 0.85)`);
  root.style.setProperty('--theme-border', `rgba(${rgbAccent[0]}, ${rgbAccent[1]}, ${rgbAccent[2]}, 0.22)`);
  root.style.setProperty('--theme-accent', rgbToHex(rgbAccent[0], rgbAccent[1], rgbAccent[2]));
  root.style.setProperty('--theme-text', rgbToHex(rgbText[0], rgbText[1], rgbText[2]));
  root.style.setProperty('--theme-text-subtle', rgbToHex(rgbSubtle[0], rgbSubtle[1], rgbSubtle[2]));
  root.style.setProperty('--theme-ambient', `rgba(${rgbAccent[0]}, ${rgbAccent[1]}, ${rgbAccent[2]}, 0.08)`);

  savePreference('custom', hexColor);
}

function savePreference(mode, color) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ cros_palette_mode: mode, cros_palette_color: color });
  } else {
    localStorage.setItem('cros_palette_mode', mode);
    if (color) localStorage.setItem('cros_palette_color', color);
  }
}


// ==========================================
// 4. Color Wheel Canvas & Controls
// ==========================================
class ColorWheelPicker {
  constructor(canvas, slider, hexInput, previewBadge, onColorChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.slider = slider;
    this.hexInput = hexInput;
    this.previewBadge = previewBadge;
    this.onColorChange = onColorChange;

    this.currentH = 210;
    this.currentS = 0.5;
    this.currentL = 0.2;
    this.isDragging = false;

    this.init();
  }

  init() {
    this.drawWheel();

    // Mouse / Touch events on wheel
    const handlePick = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      const x = clientX - rect.left - cx;
      const y = clientY - rect.top - cy;

      const dist = Math.sqrt(x * x + y * y);
      const maxRadius = cx - 2;

      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      this.currentH = angle;
      this.currentS = Math.min(1, dist / maxRadius);

      this.updateColor();
    };

    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      handlePick(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDragging) handlePick(e);
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      this.isDragging = true;
      handlePick(e);
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging) handlePick(e);
    }, { passive: false });

    window.addEventListener('touchend', () => {
      this.isDragging = false;
    });

    // Slider event
    this.slider.addEventListener('input', () => {
      this.currentL = parseInt(this.slider.value, 10) / 100;
      this.updateColor();
    });

    // Text input event
    this.hexInput.addEventListener('input', () => {
      let val = this.hexInput.value.trim();
      if (!val.startsWith('#')) val = '#' + val;
      const rgb = hexToRgb(val);
      if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        this.currentH = hsl.h;
        this.currentS = hsl.s;
        this.currentL = hsl.l;
        this.slider.value = Math.round(hsl.l * 100);
        this.drawWheel();
        this.previewBadge.style.backgroundColor = val;
        this.onColorChange(val);
      }
    });
  }

  setColor(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    this.currentH = hsl.h;
    this.currentS = hsl.s;
    this.currentL = hsl.l;
    this.slider.value = Math.round(hsl.l * 100);
    this.updateColor(false);
  }

  updateColor(triggerCallback = true) {
    const rgb = hslToRgb(this.currentH, this.currentS, this.currentL);
    const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);

    this.drawWheel();
    this.previewBadge.style.backgroundColor = hex;
    this.hexInput.value = hex.toUpperCase();

    if (triggerCallback) {
      this.onColorChange(hex);
    }
  }

  drawWheel() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = cx - 2;

    const imgData = this.ctx.createImageData(w, h);
    const data = imgData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= radius) {
          let angle = Math.atan2(dy, dx) * (180 / Math.PI);
          if (angle < 0) angle += 360;
          const sat = dist / radius;
          const [r, g, b] = hslToRgb(angle, sat, 0.5);

          const idx = (y * w + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }
    this.ctx.putImageData(imgData, 0, 0);

    // Crosshair dot
    const rad = this.currentH * (Math.PI / 180);
    const d = this.currentS * radius;
    const px = cx + Math.cos(rad) * d;
    const py = cy + Math.sin(rad) * d;

    this.ctx.beginPath();
    this.ctx.arc(px, py, 5, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(px, py, 3, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
  }
}


// ==========================================
// 5. Initial Setup & UI Event Wiring
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  const settingsBtn = document.getElementById('settings-toggle');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsClose = document.getElementById('settings-close');
  const paletteSquares = document.querySelectorAll('.palette-square');
  const customSection = document.getElementById('custom-picker-section');
  const rainbowSquare = document.getElementById('rainbow-square');

  const wheelCanvas = document.getElementById('color-wheel-canvas');
  const lightnessSlider = document.getElementById('lightness-slider');
  const hexInput = document.getElementById('custom-hex-input');
  const previewBadge = document.getElementById('color-preview-badge');
  const eyedropperBtn = document.getElementById('eyedropper-btn');

  // Initialize Color Wheel
  const colorPicker = new ColorWheelPicker(
    wheelCanvas,
    lightnessSlider,
    hexInput,
    previewBadge,
    (hex) => {
      applyHarmonicTheme(hex, false);
      highlightActiveSquare(rainbowSquare);
    }
  );

  // Eyedropper API handler
  if (eyedropperBtn) {
    if ('EyeDropper' in window) {
      eyedropperBtn.addEventListener('click', async () => {
        try {
          const eyeDropper = new window.EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            colorPicker.setColor(result.sRGBHex);
            applyHarmonicTheme(result.sRGBHex, false);
            highlightActiveSquare(rainbowSquare);
          }
        } catch (err) {
          console.log('EyeDropper canceled:', err);
        }
      });
    } else {
      eyedropperBtn.style.display = 'none';
    }
  }

  function highlightActiveSquare(activeEl) {
    paletteSquares.forEach(sq => sq.classList.remove('active'));
    if (activeEl) activeEl.classList.add('active');
  }

  // Preset square clicks
  paletteSquares.forEach(sq => {
    sq.addEventListener('click', () => {
      const preset = sq.getAttribute('data-preset');
      const color = sq.getAttribute('data-color');

      if (sq === rainbowSquare) {
        // Toggle Custom Picker
        const isVisible = customSection.classList.toggle('visible');
        if (isVisible) {
          highlightActiveSquare(rainbowSquare);
        }
        return;
      }

      customSection.classList.remove('visible');
      highlightActiveSquare(sq);

      if (preset === 'auto') {
        applyHarmonicTheme(null, true);
      } else if (color) {
        applyHarmonicTheme(color, false);
        colorPicker.setColor(color);
      }
    });
  });

  // Settings Panel Toggle
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsPanel.classList.toggle('open');
  });

  settingsClose.addEventListener('click', () => {
    settingsPanel.classList.remove('open');
  });

  document.addEventListener('click', (e) => {
    if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
      settingsPanel.classList.remove('open');
    }
  });

  // Restore saved theme or default to Auto
  let savedMode = 'auto';
  let savedColor = null;

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    const res = await new Promise(r => chrome.storage.local.get(['cros_palette_mode', 'cros_palette_color'], r));
    if (res && res.cros_palette_mode) {
      savedMode = res.cros_palette_mode;
      savedColor = res.cros_palette_color;
    }
  } else {
    savedMode = localStorage.getItem('cros_palette_mode') || 'auto';
    savedColor = localStorage.getItem('cros_palette_color');
  }

  if (savedMode === 'custom' && savedColor) {
    applyHarmonicTheme(savedColor, false);
    colorPicker.setColor(savedColor);

    // Check if it matches a preset
    let matched = false;
    paletteSquares.forEach(sq => {
      if (sq.getAttribute('data-color') === savedColor) {
        highlightActiveSquare(sq);
        matched = true;
      }
    });
    if (!matched) {
      highlightActiveSquare(rainbowSquare);
    }
  } else {
    applyHarmonicTheme(null, true);
    highlightActiveSquare(document.querySelector('.square-auto'));
  }

  // System theme change listener (for Auto mode)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const isAuto = !document.documentElement.hasAttribute('data-custom-theme');
    if (isAuto) {
      applyHarmonicTheme(null, true);
    }
  });
});

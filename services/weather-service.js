/**
 * CrOS New Tab — Open-Meteo Weather Service (v0.3.0)
 *
 * Manifest V3 Compliant, pure vanilla JS, zero external libraries.
 * Free Open-Meteo APIs (no API key required):
 * 1. Geocoding API: https://geocoding-api.open-meteo.com/v1/search
 * 2. Forecast API: https://api.open-meteo.com/v1/forecast
 *
 * Capabilities:
 * - City search & geocoding with localized names
 * - Current weather & 3-5 day daily forecast
 * - Full WMO code (0..99) translation to Russian descriptions & weather icons
 * - Geolocation autodetection with graceful fallback
 * - Offline caching in chrome.storage.local / localStorage
 * - Resilient degradation on network errors (never throws unhandled rejections)
 * - Interactive widget renderer for CrosWidgets
 */

(() => {
  'use strict';

  const GEOCODING_API_BASE = 'https://geocoding-api.open-meteo.com/v1/search';
  const FORECAST_API_BASE = 'https://api.open-meteo.com/v1/forecast';
  const STORAGE_CACHE_KEY = 'cros_weather_cache';
  const STORAGE_V3_KEY = 'cros_v3';

  const DEFAULT_CITY = 'Москва';
  const DEFAULT_LAT = 55.7558;
  const DEFAULT_LON = 37.6173;

  /**
   * Comprehensive WMO Weather Codes (0 to 99) mapping.
   * Maps to Russian descriptions and distinct day/night emoji icons.
   */
  const WMO_MAP = {
    0: { ru: 'Ясно', en: 'Clear sky', dayIcon: '☀️', nightIcon: '🌙' },
    1: { ru: 'Преимущественно ясно', en: 'Mainly clear', dayIcon: '🌤️', nightIcon: '🌤️' },
    2: { ru: 'Переменная облачность', en: 'Partly cloudy', dayIcon: '⛅', nightIcon: '☁️' },
    3: { ru: 'Пасмурно', en: 'Overcast', dayIcon: '☁️', nightIcon: '☁️' },
    45: { ru: 'Туман', en: 'Fog', dayIcon: '🌫️', nightIcon: '🌫️' },
    48: { ru: 'Изморозь', en: 'Depositing rime fog', dayIcon: '🌫️', nightIcon: '🌫️' },
    51: { ru: 'Слабая морось', en: 'Light drizzle', dayIcon: '🌦️', nightIcon: '🌧️' },
    53: { ru: 'Умеренная морось', en: 'Moderate drizzle', dayIcon: '🌦️', nightIcon: '🌧️' },
    55: { ru: 'Плотная морось', en: 'Dense drizzle', dayIcon: '🌧️', nightIcon: '🌧️' },
    56: { ru: 'Ледяная морось', en: 'Freezing drizzle', dayIcon: '🌧️❄️', nightIcon: '🌧️❄️' },
    57: { ru: 'Плотная ледяная морось', en: 'Dense freezing drizzle', dayIcon: '🌧️❄️', nightIcon: '🌧️❄️' },
    61: { ru: 'Небольшой дождь', en: 'Slight rain', dayIcon: '🌧️', nightIcon: '🌧️' },
    63: { ru: 'Умеренный дождь', en: 'Moderate rain', dayIcon: '🌧️', nightIcon: '🌧️' },
    65: { ru: 'Сильный дождь', en: 'Heavy rain', dayIcon: '🌧️', nightIcon: '🌧️' },
    66: { ru: 'Легкий ледяной дождь', en: 'Light freezing rain', dayIcon: '🌧️❄️', nightIcon: '🌧️❄️' },
    67: { ru: 'Сильный ледяной дождь', en: 'Heavy freezing rain', dayIcon: '🌧️❄️', nightIcon: '🌧️❄️' },
    71: { ru: 'Небольшой снегопад', en: 'Slight snow', dayIcon: '🌨️', nightIcon: '🌨️' },
    73: { ru: 'Умеренный снегопад', en: 'Moderate snow', dayIcon: '🌨️', nightIcon: '🌨️' },
    75: { ru: 'Сильный снегопад', en: 'Heavy snow', dayIcon: '❄️', nightIcon: '❄️' },
    77: { ru: 'Снежные зерна', en: 'Snow grains', dayIcon: '❄️', nightIcon: '❄️' },
    80: { ru: 'Слабый ливень', en: 'Slight rain showers', dayIcon: '🌦️', nightIcon: '🌧️' },
    81: { ru: 'Умеренный ливень', en: 'Moderate rain showers', dayIcon: '🌧️', nightIcon: '🌧️' },
    82: { ru: 'Сильный ливень', en: 'Violent rain showers', dayIcon: '⛈️', nightIcon: '⛈️' },
    85: { ru: 'Слабый снегопад', en: 'Slight snow showers', dayIcon: '🌨️', nightIcon: '🌨️' },
    86: { ru: 'Сильный снегопад', en: 'Heavy snow showers', dayIcon: '🌨️', nightIcon: '🌨️' },
    95: { ru: 'Гроза', en: 'Thunderstorm', dayIcon: '⛈️', nightIcon: '⛈️' },
    96: { ru: 'Гроза с небольшим градом', en: 'Thunderstorm with slight hail', dayIcon: '⛈️⚡', nightIcon: '⛈️⚡' },
    99: { ru: 'Гроза с сильным градом', en: 'Thunderstorm with heavy hail', dayIcon: '⛈️⚡', nightIcon: '⛈️⚡' }
  };

  const RUSSIAN_WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  /**
   * Safe asynchronous storage wrapper (MV3 chrome.storage.local with localStorage fallback).
   */
  const Storage = {
    get(keys) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            chrome.storage.local.get(keys, (res) => resolve(res || {}));
            return;
          } catch (_) {}
        }
        if (typeof localStorage !== 'undefined') {
          const res = {};
          const list = Array.isArray(keys) ? keys : (typeof keys === 'string' ? [keys] : Object.keys(keys || {}));
          list.forEach((k) => {
            try {
              const val = localStorage.getItem(k);
              if (val !== null) res[k] = JSON.parse(val);
            } catch (_) {}
          });
          resolve(res);
          return;
        }
        resolve({});
      });
    },

    set(items) {
      return new Promise((resolve) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            chrome.storage.local.set(items, () => resolve());
            return;
          } catch (_) {}
        }
        if (typeof localStorage !== 'undefined') {
          Object.keys(items || {}).forEach((k) => {
            try {
              localStorage.setItem(k, JSON.stringify(items[k]));
            } catch (_) {}
          });
          resolve();
          return;
        }
        resolve();
      });
    }
  };

  /**
   * DOM creation helper
   */
  const el = (tag, props = {}, ...children) => {
    if (typeof document === 'undefined') {
      return { append: () => {}, setAttribute: () => {}, style: {}, classList: { add: () => {}, toggle: () => {} }, addEventListener: () => {} };
    }
    const node = Object.assign(document.createElement(tag), props);
    children.forEach((c) => {
      if (c != null) node.append(c);
    });
    return node;
  };

  /**
   * Weather Service API Controller
   */
  class WeatherService {
    constructor() {
      this.wmoMap = WMO_MAP;
    }

    /**
     * Map WMO code to human-readable description and icon.
     * @param {number} code - WMO code (0..99)
     * @param {number|boolean} [isDay=1] - Day/night indicator (1 = day, 0 = night)
     * @param {string} [lang='ru'] - Language code ('ru' or 'en')
     * @returns {{ text: string, icon: string }}
     */
    getWeatherCodeDescription(code, isDay = 1, lang = 'ru') {
      const entry = WMO_MAP[code];
      const isDayTime = isDay !== 0 && isDay !== false;

      if (!entry) {
        return {
          text: lang === 'en' ? 'Unknown weather' : 'Неизвестно',
          icon: '🌡️'
        };
      }

      const text = (lang === 'en' && entry.en) ? entry.en : entry.ru;
      const icon = isDayTime ? entry.dayIcon : entry.nightIcon;

      return { text, icon };
    }

    /**
     * Construct Open-Meteo Geocoding URL.
     * @param {string} city - Search query
     * @param {number} [count=5] - Maximum number of results
     * @returns {string}
     */
    buildGeocodingUrl(city, count = 5) {
      const params = new URLSearchParams({
        name: (city || '').trim(),
        count: String(count),
        language: 'ru',
        format: 'json'
      });
      return `${GEOCODING_API_BASE}?${params.toString()}`;
    }

    /**
     * Construct Open-Meteo Forecast URL.
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {number} [days=4] - Forecast days
     * @returns {string}
     */
    buildForecastUrl(lat, lon, days = 4) {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current_weather: 'true',
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min',
        timezone: 'auto',
        forecast_days: String(days),
        wind_speed_unit: 'ms'
      });
      return `${FORECAST_API_BASE}?${params.toString()}`;
    }

    /**
     * Search cities by name using Open-Meteo Geocoding API.
     * @param {string} query - City query string
     * @returns {Promise<Array<{ id: number, name: string, country: string, latitude: number, longitude: number, admin1: string }>>}
     */
    async searchCity(query) {
      if (!query || typeof query !== 'string' || !query.trim()) {
        return [];
      }

      const trimmed = query.trim();
      const url = this.buildGeocodingUrl(trimmed, 5);

      try {
        let signal;
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          signal = AbortSignal.timeout(8000);
        }

        const resp = await fetch(url, { signal });
        if (!resp.ok) {
          return [];
        }

        const data = await resp.json();
        const results = (data && data.results) || [];

        return results.map((item) => ({
          id: item.id,
          name: item.name,
          country: item.country || item.country_code || '',
          countryCode: item.country_code || '',
          admin1: item.admin1 || '',
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          timezone: item.timezone || ''
        }));
      } catch (err) {
        console.warn('[WeatherService] Geocoding search failed:', err.message || err);
        return [];
      }
    }

    /**
     * Parse raw Open-Meteo JSON into structured, UI-ready forecast format.
     * @param {Object} data - Raw Open-Meteo response
     * @returns {Object}
     */
    parseForecastResponse(data) {
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid weather data structure');
      }

      const current = data.current || {};
      const currentWeather = data.current_weather || {};

      // Flexible extraction supporting both current and current_weather endpoints
      const rawTemp = current.temperature_2m !== undefined ? current.temperature_2m : currentWeather.temperature;
      const temp = rawTemp !== undefined && rawTemp !== null ? Number(rawTemp) : 0;

      const weatherCode = current.weather_code !== undefined
        ? Number(current.weather_code)
        : (currentWeather.weathercode !== undefined ? Number(currentWeather.weathercode) : 0);

      const rawWind = current.wind_speed_10m !== undefined
        ? current.wind_speed_10m
        : (currentWeather.windspeed !== undefined ? currentWeather.windspeed : 0);
      const windSpeed = Number(rawWind) || 0;

      const isDay = current.is_day !== undefined
        ? current.is_day
        : (currentWeather.is_day !== undefined ? currentWeather.is_day : 1);

      const wmoInfo = this.getWeatherCodeDescription(weatherCode, isDay, 'ru');
      const wmoInfoEn = this.getWeatherCodeDescription(weatherCode, isDay, 'en');

      // Daily forecast items
      const daily = data.daily || {};
      const times = daily.time || [];
      const maxTemps = daily.temperature_2m_max || [];
      const minTemps = daily.temperature_2m_min || [];
      const codes = daily.weather_code || daily.weathercode || [];

      const forecastList = [];
      const todayStr = new Date().toISOString().slice(0, 10);

      for (let i = 0; i < times.length; i++) {
        const dateStr = times[i];
        const fCode = codes[i] !== undefined ? Number(codes[i]) : 0;
        const fMax = maxTemps[i] !== undefined ? Math.round(Number(maxTemps[i])) : null;
        const fMin = minTemps[i] !== undefined ? Math.round(Number(minTemps[i])) : null;

        const dateObj = new Date(dateStr);
        let weekdayLabel = '';
        if (dateStr === todayStr) {
          weekdayLabel = 'Сегодня';
        } else if (i === 1) {
          weekdayLabel = 'Завтра';
        } else {
          weekdayLabel = RUSSIAN_WEEKDAYS[dateObj.getDay()] || dateStr;
        }

        const fInfo = this.getWeatherCodeDescription(fCode, 1, 'ru');

        const signMax = fMax != null && fMax > 0 ? `+${fMax}` : `${fMax}`;
        const signMin = fMin != null && fMin > 0 ? `+${fMin}` : `${fMin}`;

        forecastList.append ? null : forecastList.push({
          date: dateStr,
          weekday: weekdayLabel,
          tempMax: fMax,
          tempMin: fMin,
          tempFormatted: `${signMax}° / ${signMin}°`,
          weatherCode: fCode,
          description: fInfo.text,
          icon: fInfo.icon
        });
      }

      const signTemp = temp > 0 ? `+${Math.round(temp)}` : `${Math.round(temp)}`;

      return {
        current: {
          temp: Math.round(temp * 10) / 10,
          tempFormatted: `${signTemp}°`,
          weatherCode,
          windSpeed: Math.round(windSpeed * 10) / 10,
          windSpeedFormatted: `${(Math.round(windSpeed * 10) / 10).toFixed(1)} м/с`,
          apparentTemp: current.apparent_temperature !== undefined ? Math.round(Number(current.apparent_temperature)) : null,
          humidity: current.relative_humidity_2m !== undefined ? Math.round(Number(current.relative_humidity_2m)) : null,
          precipitation: current.precipitation !== undefined ? Number(current.precipitation) : null,
          isDay: isDay ? 1 : 0,
          description: wmoInfo.text,
          descriptionEn: wmoInfoEn.text,
          icon: wmoInfo.icon
        },
        forecast: forecastList
      };
    }

    /**
     * Fetch weather forecast by geographic coordinates.
     * Guaranteed graceful error handling: returns cached data on network failure or structured error.
     * @param {number} lat - Latitude
     * @param {number} lon - Longitude
     * @param {Object} [options={}] - Options (city, days)
     * @returns {Promise<Object>}
     */
    async getWeather(lat, lon, options = {}) {
      const city = options.city || DEFAULT_CITY;
      const days = options.days || 4;

      const latitude = Number(lat) || DEFAULT_LAT;
      const longitude = Number(lon) || DEFAULT_LON;
      const url = this.buildForecastUrl(latitude, longitude, days);

      try {
        let signal;
        if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
          signal = AbortSignal.timeout(8000);
        }

        const resp = await fetch(url, { signal });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const rawData = await resp.json();
        const parsed = this.parseForecastResponse(rawData);

        // Update persistent cache
        await this.saveCache({
          city,
          lat: latitude,
          lon: longitude,
          data: parsed
        });

        return {
          ...parsed,
          city,
          lat: latitude,
          lon: longitude,
          isCached: false,
          offline: false,
          error: false
        };
      } catch (err) {
        console.warn('[WeatherService] Fetch failed, falling back to cache:', err.message || err);

        // Fallback to cache on network failure
        const cached = await this.getCache();
        if (cached && cached.data) {
          return {
            ...cached.data,
            city: cached.city || city,
            lat: cached.lat || latitude,
            lon: cached.lon || longitude,
            isCached: true,
            offline: true,
            error: false,
            cachedTimestamp: cached.timestamp,
            message: 'Отображаются сохранённые данные (офлайн)'
          };
        }

        // Complete failure without any cache
        return {
          error: true,
          offline: true,
          isCached: false,
          city,
          message: 'Нет связи с сервером погоды. Проверьте подключение к сети.'
        };
      }
    }

    /**
     * Convenience method to fetch weather by city name.
     * @param {string} cityName
     * @returns {Promise<Object>}
     */
    async getWeatherByCity(cityName) {
      if (!cityName || typeof cityName !== 'string' || !cityName.trim()) {
        return { error: true, message: 'Не указано название города' };
      }

      const query = cityName.trim();
      const matches = await this.searchCity(query);

      if (!matches || matches.length === 0) {
        // Fallback to cached city if available
        const cached = await this.getCache();
        if (cached && cached.data) {
          return {
            ...cached.data,
            city: cached.city || query,
            isCached: true,
            offline: true,
            error: false,
            message: 'Город не найден онлайн. Отображаются сохранённые данные.'
          };
        }
        return { error: true, message: `Город «${query}» не найден` };
      }

      const match = matches[0];
      return this.getWeather(match.latitude, match.longitude, { city: match.name });
    }

    /**
     * Autodetect user's current location via navigator.geolocation.
     * @param {number} [timeoutMs=8000]
     * @returns {Promise<{ success: boolean, latitude?: number, longitude?: number, reason?: string }>}
     */
    detectLocation(timeoutMs = 8000) {
      return new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          resolve({ success: false, reason: 'Geolocation is not supported by this environment' });
          return;
        }

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            resolve({
              success: true,
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude
            });
          },
          (err) => {
            resolve({
              success: false,
              code: err.code,
              reason: err.message || 'Permission denied or timeout'
            });
          },
          { timeout: timeoutMs, maximumAge: 600000 }
        );
      });
    }

    /**
     * Retrieve latest cached weather from storage.
     * @returns {Promise<Object|null>}
     */
    async getCache() {
      try {
        const stored = await Storage.get([STORAGE_CACHE_KEY]);
        return stored[STORAGE_CACHE_KEY] || null;
      } catch (_) {
        return null;
      }
    }

    /**
     * Save weather data into persistent storage cache.
     * @param {Object} cachePayload
     */
    async saveCache(cachePayload) {
      try {
        const entry = {
          city: cachePayload.city || DEFAULT_CITY,
          lat: cachePayload.lat || DEFAULT_LAT,
          lon: cachePayload.lon || DEFAULT_LON,
          timestamp: Date.now(),
          data: cachePayload.data
        };
        await Storage.set({ [STORAGE_CACHE_KEY]: entry });
      } catch (err) {
        console.warn('[WeatherService] Cache save error:', err);
      }
    }

    /**
     * Full interactive Weather Widget Renderer for CrosWidgets integration.
     * @param {Object} w - Widget state object
     * @param {HTMLElement} body - Widget body container
     * @param {Function} [saveFn] - State save callback
     */
    async renderWidget(w, body, saveFn = () => {}) {
      w.config = w.config || {};
      const config = w.config;

      let city = config.city || DEFAULT_CITY;
      let lat = config.lat != null ? config.lat : DEFAULT_LAT;
      let lon = config.lon != null ? config.lon : DEFAULT_LON;

      // Loading State skeleton
      body.replaceChildren(
        el('div', { className: 'weather-widget loading' },
          el('div', { className: 'weather-header' },
            el('span', { className: 'weather-city-title', textContent: `📍 ${city}` })
          ),
          el('div', { className: 'weather-loading-text', textContent: 'Загрузка прогноза…' })
        )
      );

      // Fetch weather
      const weather = await this.getWeather(lat, lon, { city });

      // Render Loaded or Degraded Widget UI
      const container = el('div', { className: 'weather-widget' });

      // 1. Search Bar (expandable)
      const searchBox = el('div', { className: 'weather-search-bar', style: 'display: none;' });
      const searchInput = el('input', {
        type: 'text',
        className: 'weather-search-input',
        placeholder: 'Поиск города (Enter)…'
      });
      const searchResults = el('div', { className: 'weather-search-dropdown', style: 'display: none;' });

      searchBox.append(searchInput, searchResults);

      // Search Handler with debouncing
      let searchTimeout = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = searchInput.value.trim();
        if (q.length < 2) {
          searchResults.style.display = 'none';
          searchResults.replaceChildren();
          return;
        }

        searchTimeout = setTimeout(async () => {
          const list = await this.searchCity(q);
          searchResults.replaceChildren();
          if (list.length === 0) {
            searchResults.append(el('div', { className: 'weather-search-item empty', textContent: 'Ничего не найдено' }));
          } else {
            list.forEach((item) => {
              const itemRow = el('div', {
                className: 'weather-search-item',
                textContent: `${item.name}${item.country ? ', ' + item.country : ''}`
              });
              itemRow.addEventListener('click', async () => {
                // Apply selection
                city = item.name;
                lat = item.latitude;
                lon = item.longitude;

                config.city = city;
                config.lat = lat;
                config.lon = lon;

                // Sync with cros_v3 state
                try {
                  const stored = await Storage.get([STORAGE_V3_KEY]);
                  if (stored && stored[STORAGE_V3_KEY]) {
                    stored[STORAGE_V3_KEY].weather = {
                      city,
                      lat,
                      lon,
                      units: config.units || 'celsius'
                    };
                    await Storage.set({ [STORAGE_V3_KEY]: stored[STORAGE_V3_KEY] });
                  }
                } catch (_) {}

                saveFn();
                searchBox.style.display = 'none';
                this.renderWidget(w, body, saveFn);
              });
              searchResults.append(itemRow);
            });
          }
          searchResults.style.display = 'block';
        }, 300);
      });

      // 2. Widget Header Row
      const citySpan = el('span', { className: 'weather-city-title', textContent: `📍 ${weather.city || city}` });

      const editBtn = el('button', {
        type: 'button',
        className: 'weather-icon-btn',
        title: 'Сменить город',
        textContent: '🔍'
      });
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = searchBox.style.display !== 'none';
        searchBox.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) {
          searchInput.value = '';
          searchInput.focus();
        }
      });

      const refreshBtn = el('button', {
        type: 'button',
        className: 'weather-icon-btn',
        title: 'Обновить прогноз',
        textContent: '🔄'
      });
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.renderWidget(w, body, saveFn);
      });

      const headerActions = el('div', { className: 'weather-header-actions' }, editBtn, refreshBtn);
      const header = el('div', { className: 'weather-header' }, citySpan, headerActions);

      container.append(header, searchBox);

      // 3. Offline / Cache Warning Notice
      if (weather.isCached || weather.offline) {
        const offlineBadge = el('div', {
          className: 'weather-offline-badge',
          textContent: weather.message || 'Офлайн (сохранённые данные)'
        });
        container.append(offlineBadge);
      }

      // 4. Content State: Error without cache vs Normal/Cached Weather Display
      if (weather.error && !weather.current) {
        const errorCard = el('div', { className: 'weather-error-card' },
          el('div', { className: 'weather-error-msg', textContent: weather.message || 'Ошибка загрузки данных' }),
          el('button', {
            type: 'button',
            className: 'btn btn-primary weather-retry-btn',
            textContent: 'Повторить'
          })
        );
        errorCard.querySelector('.weather-retry-btn').onclick = () => this.renderWidget(w, body, saveFn);
        container.append(errorCard);
      } else if (weather.current) {
        const cur = weather.current;

        // Current weather row
        const currentContainer = el('div', { className: 'weather-current' });
        const leftBox = el('div', { className: 'weather-current-main' },
          el('span', { className: 'weather-icon', textContent: cur.icon || '🌤️' }),
          el('span', { className: 'weather-temp', textContent: cur.tempFormatted || `${cur.temp}°` })
        );

        const rightBox = el('div', { className: 'weather-current-details' },
          el('div', { className: 'weather-desc', textContent: cur.description || 'Ясно' }),
          el('div', { className: 'weather-wind', textContent: `Ветер: ${cur.windSpeedFormatted}` })
        );

        currentContainer.append(leftBox, rightBox);
        container.append(currentContainer);

        // Daily forecast chips (3-5 days)
        if (Array.isArray(weather.forecast) && weather.forecast.length > 0) {
          const forecastRow = el('div', { className: 'weather-forecast' });
          weather.forecast.slice(0, 4).forEach((day) => {
            const dayChip = el('div', { className: 'forecast-day' },
              el('span', { className: 'forecast-weekday', textContent: day.weekday }),
              el('span', { className: 'forecast-icon', textContent: day.icon }),
              el('span', { className: 'forecast-temp', textContent: day.tempFormatted })
            );
            forecastRow.append(dayChip);
          });
          container.append(forecastRow);
        }
      }

      body.replaceChildren(container);
    }
  }

  // Compatibility aliases
  WeatherService.prototype.build_forecast_url = WeatherService.prototype.buildForecastUrl;
  WeatherService.prototype.build_geocoding_url = WeatherService.prototype.buildGeocodingUrl;
  WeatherService.prototype.parse_forecast_response = WeatherService.prototype.parseForecastResponse;
  WeatherService.prototype.get_wmo_description = function (code) {
    return this.getWeatherCodeDescription(code, 1, 'en');
  };

  // Instantiate singleton instance
  const weatherServiceInstance = new WeatherService();

  // Expose to window for browser/extension context
  if (typeof window !== 'undefined') {
    window.WeatherService = weatherServiceInstance;
  }

  // Export for Node/CommonJS test environments
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      WeatherService: weatherServiceInstance,
      WeatherServiceClass: WeatherService,
      WMO_MAP
    };
  }
})();

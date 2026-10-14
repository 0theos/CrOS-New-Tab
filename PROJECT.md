# Project: CrOS New Tab (v0.4.0)

Кастомизируемая новая вкладка и полноценный рабочий стол для ChromeOS с виджетами, закреплением виджетов, невидимой магнитной сеткой, интеграцией Google Services, прогнозом погоды Open-Meteo, ярлыками, открывающимися в новой вкладке, и адаптивным Material 3 дизайном.

---

## Architecture

CrOS New Tab v0.4 спроектирован как чистое расширение Chrome Manifest V3 без внешних зависимостей, сборщиков и фреймворков.

- **Manifest & Platform**: Manifest V3 (`manifest.json`), без тяжелых фоновых воркеров.
- **UI Container**: `newtab.html` — единая точка входа для новой вкладки с адаптивной разметкой рабочего стола. Часы выровнены по центру прямо под строкой поиска.
- **Theme & Palette**: `newtab.js` — генерация динамической палитры Material 3, цветовой круг, EyeDropper, синхронизация часов.
- **Desktop & Layout**: `features.js` — магнитная сетка ярлыков, drag & drop с привязкой, открытие ярлыков строго в новой вкладке, обои, диалоги настроек.
- **Widget Engine**: `widgets.js` — модульный реестр виджетов с поддержкой перетаскивания, магнитного прилипания к невидимой сетке, изменения размеров (ResizeObserver), закрепления виджетов (скрытие крестика и блокировка перемещения), включения/отключения и независимого рендеринга.
- **External Services**:
  - `services/google-service.js`: Интеграция с Google Identity (`chrome.identity.launchWebAuthFlow`), поддержка настраиваемого Client ID, вызовы Google Calendar, Gmail, Google Drive API, Google News RSS, режим mock-ответов для тестов.
  - `services/weather-service.js`: Клиент Open-Meteo (бесплатный API без ключа), геокодирование городов, геолокация, кэширование и WMO-интерпретация.

---

## Code Layout

```text
/home/otheos/CrOS-New-Tab/
├── manifest.json              # MV3 конфигурация расширения (v0.4.0)
├── newtab.html                # Основной HTML рабочий стол
├── newtab.js                  # Часы, динамическая палитра Material 3
├── features.js                # Ярлыки, магнитная сетка, обои, модальные окна
├── features.css               # Стили рабочего стола, карточек, диалогов, тем, закрепления
├── widgets.js                 # Модульный движок виджетов (закрепление, сетка, Clock, Weather, Note, etc.)
├── services/
│   ├── google-service.js      # Google OAuth, Calendar, Gmail, Drive, RSS
│   └── weather-service.js     # Open-Meteo клиент, геокодирование, кэш
├── icons/                     # Иконки расширения (16, 48, 128)
├── scripts/
│   └── sync-github.sh         # Безопасный скрипт синхронизации (ветка feature/CrOS_0.4)
├── tests/                     # E2E тесты
├── .gitignore                 # Исключение .agents/, логов и временных файлов
├── README.md                  # Документация v0.4
└── PROJECT.md                 # Документация проекта и архитектурный индекс
```

---

## Feature Inventory

Every feature from the Survey phase is mapped to a designated milestone.

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Git Branch & Protection | Создание ветки feature/CrOS_0.3, блокировка пуша в main, .gitignore | M1 | Survey / R5 |
| 2 | MV3 Manifest & Permissions | manifest.json v0.3.0, tabs, identity, alarms, host_permissions | M2 | Survey / AC |
| 3 | Service Worker & Close Protection | background.js с перехватом tabs.onRemoved / windows.onRemoved, beforeunload | M2 | Survey / R4 |
| 4 | Kiosk & Policy Documentation | Инструкция по ChromeOS Kiosk / корпоративным политикам, честные ограничения | M2 | Survey / R4 |
| 5 | Storage Migration (v2 -> v3) | Автоматическая миграция cros_v2 в cros_v3 без потери ярлыков и обоев | M3 | Survey / R1 |
| 6 | Modular Widget System | Реестр виджетов (widgets.js), drag-and-drop, resize, скрытие/показ, сохранение | M3 | Survey / R1 |
| 7 | Clock & Date Widget | Отдельный настраиваемый виджет даты и времени на рабочем столе | M3 | Survey / R1 |
| 8 | Preserve v0.2 Features | Сохранение ярлыков, обоев, димминга, поиска, полноэкранного режима, палитры | M3 | Survey / R1 |
| 9 | Open-Meteo Weather Service | Клиент Open-Meteo без ключа, геокодирование, WMO коды, кэш, graceful fallback | M4 | Survey / R3 |
| 10 | Weather Widget & UI | Карточка погоды на рабочем столе с текущей погодой, прогнозом и настройками города | M4 | Survey / R3 |
| 11 | Google Identity & Custom Client ID | OAuth через launchWebAuthFlow, ввод Client ID в UI, понятная инструкция | M5 | Survey / R2 |
| 12 | Google Calendar Widget | Виджет предстоящих событий из Google Calendar API v3 с mock-режимом | M5 | Survey / R2 |
| 13 | Gmail Widget | Виджет непрочитанных писем Gmail API v1 с mock-режимом | M5 | Survey / R2 |
| 14 | Google Drive Widget | Виджет последних файлов Google Drive API v3 с mock-режимом | M5 | Survey / R2 |
| 15 | Google News & Shortcuts | RSS-виджет новостей через нативный DOMParser, ярлыки Google One/Keep/Photos | M5 | Survey / R2 |
| 16 | E2E Testing Suite (Tiers 1-4) | Автоматизированный тестовый набор от требований (Category-Partition, BVA) | E2E Track | Survey / AC |
| 17 | Final E2E Pass & Adversarial Hardening | 100% прохождение E2E тестов, валидация chromium/syntax, Tier 5 hardening | M6 | Survey / AC |
| 18 | GitHub Push to feature/CrOS_0.3 | Фиксация коммита и отправка в origin feature/CrOS_0.3 | M6 | Survey / R5 |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Git Workflow & Repo Safety | Ветка feature/CrOS_0.3, .gitignore, sync-github.sh, PROJECT.md | none | PLANNED |
| M2 | MV3 Service Worker & Anti-Close | manifest.json v0.3.0, background.js, beforeunload, README kiosk doc | M1 | PLANNED |
| M3 | Desktop, Storage v3 & Widgets | cros_v3 миграция, widgets.js, Clock widget, сохранение v0.2 функций | M2 | PLANNED |
| M4 | Open-Meteo Weather Integration | weather-service.js, Weather widget, геокодирование, оффлайн-кэш | M3 | PLANNED |
| M5 | Google Integration & News | google-service.js, OAuth UI, Calendar/Gmail/Drive widgets, News RSS | M4 | PLANNED |
| E2E | E2E Test Suite Track | Тестовый раннер, Tiers 1-4 тестовые сценарии, TEST_READY.md | M1 | IN_PROGRESS |
| M6 | Final Verification & Git Sync | 100% E2E Pass, Tier 5 Hardening, headless валидация, push в origin | M5, E2E | PLANNED |

---

## Interface Contracts

### 1. Storage Contract (`chrome.storage.local`)
- Ключ `cros_v3`:
  ```json
  {
    "version": 3,
    "shortcuts": [{"id": "...", "title": "...", "url": "...", "icon": "..."}],
    "widgets": [
      {
        "id": "widget-1",
        "type": "clock|weather|calendar|gmail|drive|news|note|todo|countdown|embed",
        "title": "...",
        "x": 100, "y": 100, "w": 280, "h": 180,
        "enabled": true,
        "config": {}
      }
    ],
    "wallpaper": {"type": "default|color|url|image", "value": "..."},
    "dim": 0,
    "autoFullscreen": false,
    "closeProtection": true,
    "google": {
      "clientId": "",
      "mockMode": false
    },
    "weather": {
      "city": "",
      "lat": null,
      "lon": null,
      "units": "celsius"
    }
  }
  ```

### 2. Google Service (`services/google-service.js`)
- `GoogleService.configure({ clientId, mockMode })`
- `GoogleService.isAuthenticated()` -> `Promise<boolean>`
- `GoogleService.login()` -> `Promise<string (token)>`
- `GoogleService.logout()` -> `Promise<void>`
- `GoogleService.getCalendarEvents(maxResults)` -> `Promise<Array<{id, summary, start, htmlLink}>>`
- `GoogleService.getGmailUnread()` -> `Promise<{unreadCount, messages: Array<{id, snippet, from, subject}>}>`
- `GoogleService.getDriveFiles(maxResults)` -> `Promise<Array<{id, name, mimeType, webViewLink, iconLink}>>`
- `GoogleService.getNews(topic)` -> `Promise<Array<{title, link, pubDate, source}>>`

### 3. Weather Service (`services/weather-service.js`)
- `WeatherService.searchCity(query)` -> `Promise<Array<{name, country, latitude, longitude}>>`
- `WeatherService.getWeather(lat, lon)` -> `Promise<{current: {temp, weatherCode, windSpeed}, forecast: [...]}>`
- `WeatherService.getWeatherCodeDescription(code)` -> `{text: string, icon: string}`

### 4. Background Service Worker (`background.js`)
- Обработка `chrome.tabs.onRemoved` и `chrome.windows.onRemoved`.
- Если закрывается последняя вкладка рабочего стола, инициируется открытие новой вкладки с `chrome.runtime.getURL('newtab.html')`.

---

## Контроль версий (Git / GitHub)

**СТРОГОЕ ПРАВИЛО**: Вся разработка и пуши ведутся **только** в ветку `feature/CrOS_0.3`.
Прямой пуш в ветку `main` категорически **ЗАПРЕЩЕН**.

```bash
# Синхронизация с GitHub
./scripts/sync-github.sh "Описание изменений"
```
Скрипт проверяет текущую ветку и блокирует отправку, если активна ветка `main`.
Отправка разрешена исключительно в `origin feature/CrOS_0.3`.

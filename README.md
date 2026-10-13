# 🧩 CrOS Modular Assistant

[![Platform](https://img.shields.io/badge/Platform-ChromeOS%20%7C%20Chrome-blue)](https://www.google.com/chromebook/)
[![Manifest](https://img.shields.io/badge/Manifest-V3-success)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Style](https://img.shields.io/badge/Style-Material%20Design%203-blueviolet)](https://m3.material.io/)

Модульное, адаптивное расширение для Google Chrome на Chromebook (ChromeOS).
Автоматически считывает и применяет цветовую гамму системы (светлая/темная тема, Material You палитра) и предоставляет расширяемую систему подключаемых модулей интеракции.

---

## ⚡ Быстрый старт на Chromebook

1. В браузере Chrome откройте `chrome://extensions`.
2. Включите **«Режим разработчика»** (вверху справа).
3. Нажмите **«Загрузить распакованное расширение»** и выберите папку:
   ```
   /home/otheos/chromebook-modular-extension
   ```
4. Закрепите значок расширения на панели задач или используйте боковую панель ChromeOS (Side Panel).

---

## 📂 Структура проекта

```
chromebook-modular-extension/
├── manifest.json              # Конфигурация Manifest V3
├── PROJECT.md                 # Полная спецификация и регламент работы
├── README.md                  # Краткое руководство
├── icons/                     # Иконки (16x16, 48x48, 128x128)
├── styles/
│   ├── theme.css              # Адаптивная тема ChromeOS (M3, auto dark/light)
│   └── shared.css             # Компоненты UI (кнопки, табы, карточки)
├── core/
│   ├── theme-manager.js       # Реактивный движок тем и акцентов
│   ├── storage.js             # Асинхронное хранилище с fallback
│   └── event-bus.js           # Шина событий
├── modules/
│   ├── module-registry.js     # Реестр и жизненный цикл модулей
│   ├── index.js               # Точка регистрации модулей
│   ├── quick-notes/           # Блокнот с привязкой к сайту и глобально
│   ├── page-actions/          # Действия на странице (Markdown, статистика, темный фильтр)
│   ├── color-inspector/       # Пипетка цветов и переключатель гаммы CrOS
│   ├── user-snippets/         # Визуальный конструктор модулей
│   └── template/              # Шаблон для создания новых модулей
├── popup/                     # Всплывающее окно
├── sidepanel/                 # Боковая панель ChromeOS
├── options/                   # Страница настроек
├── background/                # Фоновый Service Worker
└── scripts/
    └── sync-github.sh         # Скрипт синхронизации версий с GitHub
```

---

## 🔄 Правило контроля версий (GitHub Sync)

При каждом завершении рабочего сеанса отправляйте новую версию в GitHub:
```bash
./scripts/sync-github.sh "Ваше описание изменений"
```
Подробнее в [PROJECT.md](file:///home/otheos/chromebook-modular-extension/PROJECT.md).

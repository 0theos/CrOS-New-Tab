#!/usr/bin/env bash
# CrOS Modular Assistant — GitHub Sync Script
# Использование: ./scripts/sync-github.sh "Описание изменений"

set -e

COMMIT_MSG="${1:-Update extension version and modules}"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

echo "=================================================="
echo "🚀 CrOS Modular Assistant — Синхронизация с GitHub"
echo "=================================================="

# 1. Проверка git статуса
if [ -z "$(git status --porcelain)" ]; then
  echo "✓ Рабочая директория чиста. Нет несохраненных изменений."
else
  echo "📦 Добавление изменений в коммит..."
  git add .
  git commit -m "$COMMIT_MSG"
  echo "✓ Коммит создан: '$COMMIT_MSG'"
fi

# 2. Проверка удаленного репозитория
REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)

if [ -z "$REMOTE_URL" ]; then
  echo "⚠️ Внимание: Удаленный репозиторий 'origin' еще не привязан к GitHub."
  echo "Для первой привязки выполните:"
  echo "  git remote add origin https://github.com/0theos/<ИМЯ_РЕПОЗИТОРИЯ>.git"
  echo "  git push -u origin $BRANCH"
else
  echo "🌐 Отправка новой версии на GitHub ($REMOTE_URL, ветка $BRANCH)..."
  git push origin "$BRANCH"
  echo "✓ Новая версия успешно отправлена на GitHub!"
fi

echo "=================================================="

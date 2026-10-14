#!/usr/bin/env bash
# CrOS Modular Assistant — GitHub Sync Script
# Использование: ./scripts/sync-github.sh "Описание изменений"

set -e

COMMIT_MSG="${1:-Update extension version and modules}"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
TARGET_BRANCH="${CURRENT_BRANCH:-feature/CrOS_0.4}"

echo "=================================================="
echo "🚀 CrOS Modular Assistant — Синхронизация с GitHub"
echo "=================================================="

# 1. Проверка текущей ветки (Repo Safety Guard)
if [ -z "$CURRENT_BRANCH" ]; then
  echo "❌ Ошибка: Не удалось определить текущую ветку Git." >&2
  exit 1
fi

if [ "$CURRENT_BRANCH" = "main" ]; then
  echo "❌ Ошибка безопасности: Прямой пуш в ветку 'main' строго запрещен политикой проекта." >&2
  echo "Пожалуйста, создайте или переключитесь на feature-ветку перед отправкой изменений:" >&2
  echo "  git checkout feature/CrOS_0.4" >&2
  exit 1
fi

echo "✓ Проверка ветки пройдена: активна '$TARGET_BRANCH'"

# 2. Проверка git статуса и добавление изменений
git add -A ":!.agents" ":!*.agents" 2>/dev/null || git add -A
if git diff --cached --quiet; then
  echo "✓ Нет изменений для коммита."
else
  echo "📦 Добавление изменений в коммит..."
  git commit -m "$COMMIT_MSG"
  echo "✓ Коммит создан: '$COMMIT_MSG'"
fi

# 3. Проверка удаленного репозитория
REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)

if [ -z "$REMOTE_URL" ]; then
  echo "⚠️ Внимание: Удаленный репозиторий 'origin' еще не привязан к GitHub."
  echo "Для первой привязки выполните:"
  echo "  git remote add origin https://github.com/0theos/<ИМЯ_РЕПОЗИТОРИЯ>.git"
  echo "  git push -u origin $TARGET_BRANCH"
else
  echo "🌐 Отправка новой версии на GitHub ($REMOTE_URL, ветка $TARGET_BRANCH)..."
  git push origin "$TARGET_BRANCH"
  echo "✓ Новая версия успешно отправлена на GitHub ($TARGET_BRANCH)!"
fi

echo "=================================================="

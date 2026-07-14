# Roadmaps: перенос на test/dev

## Что меняется

Дорожные карты перестают храниться только в браузере. API и PostgreSQL становятся источником данных для текущего пользователя, поэтому один набор карт открывается одинаково во всех браузерах. Демо-карты не добавляются и не импортируются.

## Файлы

- `server/api/app/roadmaps.py`
- `server/api/app/db.py`
- `server/api/app/main.py`
- `frontend/src/api.js`
- `frontend/src/sections/RoadmapsSection.jsx`
- `frontend/src/sections/roadmapState.js`

Также перенесите актуальные `frontend/src/utils/roadmapDependencies.{js,test.js}` и `frontend/src/components/common/{Skeleton,ErrorBoundary}.jsx`, если test/dev ещё не содержит версию с исправленными линиями связей и оболочкой загрузки.

## Развёртывание

1. Сделайте архив каталога приложения и резервную копию базы.
2. Установите файлы, затем пересоберите `dashboard-api`: `docker compose -f server/docker-compose.yml up -d --build dashboard-api`.
3. В `frontend` выполните `npm ci && npm run build`; артефакты попадут в `frontend-dist`.
4. Проверьте здоровье: `curl -kfsS https://<host>/api/health`.

## Перенос старых карт

При первом открытии раздела приложение читает прежний ключ `dashboard_roadmaps_v1` только для переноса. Карты с известными demo ID исключаются. Импорт использует `ON CONFLICT DO NOTHING`, поэтому повторный запуск не дублирует данные и не перезаписывает серверные изменения.

## Проверка

Откройте Roadmaps в браузере с существующими картами, затем под той же учётной записью во втором браузере. Создание, правка и удаление должны быть видны после обновления в обоих браузерах.

# Dashboard Project Notes

Обновлено: 2026-05-15.

## Путь и запуск

Проект находится в `/home/viktor/Документы/Project/dashdoard`.

Запуск backend/web/db:

```bash
cd /home/viktor/Документы/Project/dashdoard/server
docker compose up -d --build
docker compose ps
```

После изменений backend пересобирать:

```bash
cd /home/viktor/Документы/Project/dashdoard/server
docker compose up -d --build dashboard-api
```

Frontend отдается Caddy из смонтированной папки проекта, поэтому после правок `dashboard.html`, `service-worker.js`, `manifest.webmanifest` и иконок обычно достаточно обновить страницу/PWA. Для service worker на iPhone иногда нужно закрыть PWA и открыть заново.

## Структура

- `dashboard.html` - основной frontend, React через CDN/Babel, без сборщика.
- `dashboard-config.js` - runtime config, сейчас `apiBaseUrl: "/api"`.
- `dashboard-config.example.js` - пример runtime config.
- `manifest.webmanifest`, `service-worker.js`, `pwa-*` - PWA-обвязка, иконки и push handler.
- `server/api/app/main.py` - FastAPI backend.
- `server/api/app/vapid_private.pem` - приватный VAPID-ключ для web push; не коммитить в git.
- `server/api/requirements.txt` - зависимости backend.
- `server/docker-compose.yml` - PostgreSQL, FastAPI, Caddy.
- `server/Caddyfile` - отдает frontend, проксирует `/api/*`, задает headers для PWA.
- `server/db/init/001_schema.sql` - базовая SQL-схема/seed для первого старта.

## Основные разделы frontend

Все разделы находятся в `dashboard.html`:

- `TasksSection` - «Текущие задачи».
- `EventsSection` - «Ключевые события».
- `SyncsSection` - «Заметки», технический id `syncs`.
- `UcpSection` - УПЦ.
- `AmbpSection` - АМБП, бизнес-план активности.
- `DevelopmentPlanSection` - «План развития».
- `UsersSection` - админский раздел пользователей и приглашений.

Навигация описана в `SECTIONS`, рендер секций в `SECTION_COMPONENTS`.

## Данные и API

Frontend грузит данные через `GET /api/bootstrap`.

`bootstrap` возвращает:

- `team` - активные пользователи для выбора исполнителей;
- `tasks`;
- `events`;
- `eventTasks`;
- `syncStickers`;
- `ucpTasks`;
- `developmentTasks`;
- `ambpTopics`.

Auth:

- access token хранится в памяти frontend;
- refresh token хранится в HttpOnly cookie;
- `DASHBOARD_API_TOKEN` остается аварийным сервисным токеном и не передается во frontend config;
- регистрация коллег идет через invite-ссылки из раздела «Пользователи».

## PWA

Проект полностью переведен на PWA, iOS/Xcode-клиент удален.

- Есть `manifest.webmanifest` со standalone-режимом, цветами и иконками.
- `service-worker.js` сейчас работает в rescue/no-cache режиме: не перехватывает `fetch`, удаляет старые `dashboard-pwa-*` кеши и всегда дает приложению грузить свежий HTML.
- В service worker добавлены handlers для `push` и `notificationclick`.
- В верхней панели есть индикатор Online/Offline, кнопка установки PWA и кнопка включения push-уведомлений.
- На iPhone PWA использует `viewport-fit=cover`, safe-area отступы, компактный topbar и нижнюю tab-bar навигацию.
- Web Push на iPhone работает только в установленной PWA с экрана «Домой», не в обычной вкладке Safari.

Push endpoints:

- `GET /api/push/vapid-public-key` - проверить, настроены ли VAPID-ключи.
- `POST /api/push/subscriptions` - сохранить подписку устройства.
- `DELETE /api/push/subscriptions` - удалить подписку устройства.
- `POST /api/push/test` - отправить тестовое уведомление текущему пользователю.

## Что уже реализовано

### Текущие задачи

- Создание, редактирование, удаление задач.
- Drag/drop на desktop; на мобильном статус меняется через компактные элементы управления.
- Фильтры по этапу, исполнителю и приоритету адаптированы под мобильный экран.
- Готовые задачи скрываются из блока активных задач.
- Карточка редактирования задачи адаптирована под PWA: не открывает клавиатуру сама, центрируется, имеет date picker для срока.
- Удаление подтверждается кастомным `ConfirmDialog`.
- Исполнители берутся из реальных пользователей приложения через `bootstrap.team`.

### Ключевые события

- Создание, редактирование и удаление событий.
- Создание, редактирование, удаление задач события.
- У событий и задач события есть `description`.
- На мобильном события показываются вертикальным списком вместо широкой timeline.

### УПЦ

- Создание, редактирование и удаление задач УПЦ.
- Контрольные точки поддерживают описание и подтверждающие материалы.
- Исполнители УПЦ используют реальных пользователей из `team`.

### Заметки

- Раздел называется «Заметки», технический id оставлен `syncs`, API оставлен `/sync-stickers`.
- На desktop заметки остаются рабочей областью со стикерами; на мобильном отображаются списком карточек.

### План развития

- Задачи плана развития поддерживают поля: название, описание, образ результата, метрика успеха, срок, статус/комментарий.
- На desktop задачи собраны в компактные карточки, подробности открываются по клику.

### АМБП

- Раздел для достижения показателей бизнес-плана.
- Поддерживаются темы с планом/фактом выручки, воронкой продаж и комментариями по активностям.

### Пользователи

- Раздел доступен admin.
- Можно создавать приглашения.
- Есть редактируемая карточка пользователя: имя, роль, активность.
- Админ не может деактивировать сам себя.

## Важные нюансы

- Старый `TEAM` в `dashboard.html` оставлен как fallback/demo-константа, но рабочие выборы исполнителей не должны использовать его напрямую.
- Если в селекте исполнителей снова видны Алексей/Мария/Дмитрий, значит frontend получил пустой `team` и где-то вернулся fallback - проверить `normalizeTeam`, `SECTION_COMPONENTS`, `/api/bootstrap`.
- После `python3 -m py_compile` появляется `server/api/app/__pycache__`; это мусор, его можно удалять.
- `dashboard-api` expose-ит порт 8000 внутри docker-сети, но не публикует его наружу.
- В `server/docker-compose.yml` сейчас лежат реальные секреты; при появлении git лучше вынести их в `.env` и исключить из коммитов.

Health проверять так:

```bash
docker exec dashboard-api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5).read().decode())"
docker exec dashboard-web wget -qO- http://dashboard-api:8000/health
```

## Последняя проверка

На 2026-05-15:

- iOS/Xcode-папка `dashboard-ios` удалена.
- Фактический мусор `server/api/app/__pycache__` удален.
- `dashboard-api`, `dashboard-db`, `dashboard-web` работают в Docker.
- `GET /api/push/vapid-public-key` возвращает `enabled: true`.
- `POST /api/push/test` работает; если `subscriptions: 0`, устройство еще не подписалось на push.

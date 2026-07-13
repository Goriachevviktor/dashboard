# Mind Map: применение на test и dev

Перенесите те же изменения приложения на test, проверьте их, затем повторите на dev.

## Источник изменений

Рабочая ветка: `feat/personal-mindmaps`. Реализация находится в коммитах от `aa3525a` до `5dae90e`. Перед применением сопоставьте изменения в файлах `server/api/app/mindmaps.py`, `server/api/app/db.py`, `server/api/app/main.py`, `frontend/src/api.js`, `frontend/src/App.jsx`, `frontend/src/sections/MindMapSection.jsx` и `frontend/src/sections/mindMapState.js`.

## Сборка и запуск

```bash
git fetch origin
git checkout <commit-with-personal-mind-maps>
cd frontend
npm ci
npx eslint src/sections/MindMapSection.jsx src/sections/mindMapState.js src/sections/mindMapState.test.js
node --test src/sections/mindMapState.test.js
npm run build
cd ../server
docker compose up -d --build
```

## Проверка работоспособности

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

Ожидаемый ответ:

```json
{"status":"ok"}
```

## Кэш главной ссылки

В `server/Caddyfile` настройте корневую страницу так, чтобы браузер не сохранял старый `index.html`:

```caddyfile
@app_shell path / /index.html
header @app_shell Cache-Control "no-store, no-cache, must-revalidate, max-age=0"
header @app_shell Clear-Site-Data "\"cache\""
```

После изменения перезапустите только веб-контейнер:

```bash
cd server
docker compose restart dashboard-web
```

## Ручная приемка

1. Войдите под пользователем A и откройте **Mind Map**. У нового пользователя должен быть пустой каталог, без стандартных карт.
2. Создайте карту, добавьте узел, обновите страницу и войдите снова. Карта и узел должны сохраниться.
3. Войдите под пользователем B. Карта пользователя A не должна отображаться.
4. Удалите карту пользователя A, обновите страницу и убедитесь, что каталог остается пустым.

Не переносите данные из `dashboard.mindmap.maps.v1` или `dashboard.mindmap.maps.v2` в браузерном хранилище. Источник данных - серверная БД.

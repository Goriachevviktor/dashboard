# Dashboard — Frontend

React 19 + Vite 8. Фронтенд для PWA-дашборда руководителя.

## Разработка

```bash
npm install
npm run dev       # http://localhost:5174 (прокси /api → localhost:8080)
```

## Сборка

```bash
npm run build     # output → ../frontend-dist/
```

Собранные файлы подхватывает Caddy из `../frontend-dist/`.

## Структура

```
src/
  App.jsx              # корневой компонент, роутинг по разделам
  api.js               # все API-запросы
  utils.js             # хелперы, хуки
  constants.jsx        # список разделов с иконками
  sections/            # 10 разделов дашборда
  components/common/   # StatCard, Avatar, AssigneePicker, Charts, ConfirmDialog
  screens/             # AuthScreen, RegisterScreen
```

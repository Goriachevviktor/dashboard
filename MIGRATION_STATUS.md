# Статус миграции на Vite + React

## Общий прогресс

```
Бэкенд рефакторинг  ████████████████████  100%
Фронтенд миграция   ████████████░░░░░░░░   60%
```

---

## ✅ Бэкенд (всё готово)

| Задача | Статус | Описание |
|--------|--------|----------|
| Секреты в .env | ✅ | docker-compose.yml очищен, server/.env создан |
| Индексы БД | ✅ | owner_id/assignee_id на всех таблицах |
| Схема БД | ✅ | db/init/000_base_schema.sql выделена |
| Разбивка main.py | ✅ | 11 модулей: auth, tasks, events, ucp, development, ambp, push, stickers, utils, db, config |
| Дедупликация | ✅ | normalize_member_ids объединена в utils.py |
| Логирование | ✅ | logging.basicConfig в main.py |

---

## 🔄 Фронтенд (в процессе)

### Инфраструктура
| Файл | Статус |
|------|--------|
| `frontend/` Vite проект | ✅ создан |
| `vite.config.js` с proxy /api | ✅ |
| `package.json` + зависимости | ✅ |
| `src/api.js` | ✅ dashboardRequest + buildApi |
| `src/utils.js` | ✅ хелперы, хуки |
| `src/constants.jsx` | ✅ SECTIONS с новыми разделами |

### Общие компоненты
| Файл | Статус |
|------|--------|
| `components/common/ConfirmDialog.jsx` | ✅ |
| `components/common/Avatar.jsx` | ✅ |
| `components/common/StatCard.jsx` | ✅ |
| `components/common/AssigneePicker.jsx` | ✅ |
| `components/common/Charts.jsx` | ✅ KpiRadarChart + BurndownChart |

### Экраны
| Файл | Статус |
|------|--------|
| `screens/AuthScreen.jsx` | ✅ |
| `screens/RegisterScreen.jsx` | ✅ |

### Секции (перенесены из dashboard.html)
| Файл | Статус | Строк |
|------|--------|-------|
| `sections/TasksSection.jsx` | ✅ | 998 |
| `sections/TaskArchiveSection.jsx` | ✅ | 138 |
| `sections/EventsSection.jsx` | ✅ | 894 |
| `sections/SyncsSection.jsx` | ✅ | 429 |
| `sections/UcpSection.jsx` | ✅ | 303 |
| `sections/AmbpSection.jsx` | ✅ | 304 |
| `sections/PlanSection.jsx` | ✅ | 432 |
| `sections/UsersSection.jsx` | ✅ | 237 |
| `sections/RoadmapsSection.jsx` | ✅ **НОВЫЙ** | 200 |
| `sections/MindMapSection.jsx` | ✅ **НОВЫЙ** | 208 |

---

## ⏳ Осталось сделать

### #10 App.jsx (главный компонент)
- [ ] **10a** — Auth state: токен, юзер, восстановление сессии
- [ ] **10b** — API клиент: authRequest + buildApi через useMemo
- [ ] **10c** — Sidebar + Topbar UI
- [ ] **10d** — Section router: SECTION_COMPONENTS + рендер секции

### #11 Entrypoint
- [ ] **11a** — `index.html`: PWA-мета теги, Inter шрифт, manifest
- [ ] **11b** — `main.jsx`: убрать дефолт Vite, регистрация service worker
- [ ] **11c** — CSS: убрать дефолтные стили, добавить глобальный reset

### #12 Сборка
- [ ] **12a** — `npm run build` → собрать все ошибки
- [ ] **12b** — Исправить ошибки (импорты, JSX, хуки)

### #13 Docker + Caddy
- [ ] **13a** — Финальный `npm run build` → `frontend-dist/`
- [ ] **13b** — Обновить `Caddyfile`: отдавать `frontend-dist/`
- [ ] **13c** — Обновить `docker-compose.yml`: volume `frontend-dist/`

---

## Структура frontend/src/

```
frontend/src/
├── App.jsx                      ⏳ не создан
├── main.jsx                     ⏳ дефолтный шаблон
├── api.js                       ✅
├── utils.js                     ✅
├── constants.jsx                ✅
├── components/
│   └── common/
│       ├── Avatar.jsx           ✅
│       ├── AssigneePicker.jsx   ✅
│       ├── Charts.jsx           ✅
│       ├── ConfirmDialog.jsx    ✅
│       └── StatCard.jsx         ✅
├── screens/
│   ├── AuthScreen.jsx           ✅
│   └── RegisterScreen.jsx       ✅
└── sections/
    ├── TasksSection.jsx         ✅
    ├── TaskArchiveSection.jsx   ✅
    ├── EventsSection.jsx        ✅
    ├── SyncsSection.jsx         ✅
    ├── UcpSection.jsx           ✅
    ├── AmbpSection.jsx          ✅
    ├── PlanSection.jsx          ✅
    ├── UsersSection.jsx         ✅
    ├── RoadmapsSection.jsx      ✅ новый
    └── MindMapSection.jsx       ✅ новый
```

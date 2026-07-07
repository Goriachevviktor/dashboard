# Frontend Apple-Light Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести оболочку и 4 раздела (Задачи, События, Дорожные карты, Заметки) на светлый Apple-стиль через модуль дизайн-токенов `theme.js`, не меняя мобильную вёрстку и функциональность.

**Architecture:** Новый модуль `frontend/src/theme.js` — единственный источник палитры/радиусов/теней/стилей контролов (JS-константы, подставляются в инлайновые стили — существующий идиом). Секции рестайлятся только в десктопных ветках; общие константы, питающие мобильные ветки, дублируются как `LEGACY_*` со старыми значениями. Спека: `docs/superpowers/specs/2026-07-07-frontend-apple-light-redesign-design.md` — читать перед началом.

**Tech Stack:** React 19, Vite 8 (rolldown), plain JSX inline styles, ESLint, node:test

**Verification model:** стилевые правки не имеют юнит-тестов — каждый таск завершается `npx eslint` + `npm run build` + визуальной проверкой в браузере (Vite dev: `cd frontend && npm run dev` → http://localhost:5174, требует запущенный docker-стек для API). Мобильную проверять через DevTools device toolbar (ширина ≤ 820px) — вид должен остаться прежним.

---

## File Map

- Create: `frontend/src/theme.js` — все токены и style-фабрики
- Modify: `frontend/src/App.jsx` — оболочка (десктоп-сайдбар + шапка)
- Modify: `frontend/src/components/common/StatCard.jsx` — opt-in pastel-вариант
- Modify: `frontend/src/components/common/ConfirmDialog.jsx` — единый стиль модалок + фикс градиента
- Modify: `frontend/src/sections/TasksSection.jsx` — десктоп-ветки + модалки (десктоп-значения тернарников)
- Modify: `frontend/src/sections/EventsSection.jsx` — то же
- Modify: `frontend/src/sections/RoadmapsSection.jsx` — то же
- Modify: `frontend/src/sections/SyncsSection.jsx` — то же

---

### Task 1: Модуль дизайн-токенов theme.js

**Files:**
- Create: `frontend/src/theme.js`

- [ ] **Step 1: Создать `frontend/src/theme.js` с полным содержимым**

```js
// Дизайн-токены редизайна 2026-07 (спека: docs/superpowers/specs/2026-07-07-frontend-apple-light-redesign-design.md).
// Используются ТОЛЬКО в десктопных ветках — мобильные ветки остаются на старых значениях (LEGACY_* в секциях).

export const FONT_STACK = `-apple-system, BlinkMacSystemFont, "Inter", sans-serif`;

export const COLORS = {
  bgGradient: "linear-gradient(180deg,#fbfdff,#f5f8fd)",
  surface: "#fff",
  ink: "#1d1d1f",
  textMid: "#3a3a3c",
  textSecondary: "#6e6e73",
  textMuted: "#86868b",
  textFaint: "#a1a1a6",
  accent: "#007aff",
  accentSoft: "#e8f2ff",
  hairline: "rgba(15,23,42,.06)",
  hairlineStrong: "rgba(15,23,42,.08)",
  // Пары «заливка / текст на белом»
  red: "#ff3b30",    redText: "#e03131",
  orange: "#ff9500", orangeText: "#c77b09",
  green: "#34c759",  greenText: "#1d9a5b",
  gray: "#8e8e93",   grayText: "#8e8e93",
};

// Пастельные стат-карточки: surface + тон подписи + тон значения
export const PASTELS = {
  blue:   { surface: "#eaf3ff", label: "#5296e0", value: "#0b57b0" },
  indigo: { surface: "#eef0ff", label: "#7d84e8", value: "#3f46c8" },
  green:  { surface: "#e9faf1", label: "#4cbf82", value: "#177648" },
  amber:  { surface: "#fff4e6", label: "#e8a23d", value: "#b05e07" },
  gray:   { surface: "#f4f4f6", label: "#8e8e93", value: "#48484a" },
};

export const RADII = { card: 16, modal: 22, control: 10, input: 11, pill: 999, column: 14, kanbanCard: 12 };

export const SHADOWS = {
  card: "0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(56,120,248,.07)",
  modal: "0 32px 80px rgba(15,23,42,.18)",
  accentBtn: "0 2px 8px rgba(0,122,255,.28)",
  segment: "0 1px 3px rgba(0,0,0,.08)",
};

export const GLASS = {
  sidebar: { background: "rgba(255,255,255,.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" },
  topbar:  { background: "rgba(255,255,255,.6)",  backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" },
  modalCard: { background: "rgba(255,255,255,.85)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)", border: "1px solid rgba(255,255,255,.9)" },
  modalOverlay: { background: "rgba(15,23,42,.30)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" },
};

// z-index шкала — значения совпадают с текущими, чтобы не менять поведение наложения
export const Z = { mobileNav: 120, modal: 300, modalNested: 320, confirm: 700, taskModal: 1000 };

export const AVATAR_GRADIENT = "linear-gradient(135deg,#38bdf8,#818cf8)";

// ── Семантические карты разделов ──

export const PRIORITY_COLOR = { "Высокий": COLORS.redText, "Средний": COLORS.orangeText, "Низкий": COLORS.greenText };

export const COLUMN_TEXT = { "Беклог": COLORS.gray, "В работе": COLORS.accent, "Готов": COLORS.greenText, "Готово": COLORS.greenText, "Архив": COLORS.gray };
export const COLUMN_DOT = { "Беклог": COLORS.gray, "В работе": COLORS.accent, "Готов": COLORS.green, "Готово": COLORS.green, "Архив": COLORS.gray };
export const COLUMN_SURFACE = { "Беклог": "rgba(118,118,128,.06)", "В работе": "rgba(0,122,255,.05)", "Готов": "rgba(52,199,89,.06)", "Готово": "rgba(52,199,89,.06)", "Архив": "rgba(118,118,128,.06)" };

export const EVENT_TYPE_COLOR = {
  "Совещание": "#007aff", "Мероприятие": "#af52de", "Релиз": "#34c759",
  "Дедлайн": "#ff3b30", "Планирование": "#ff9500", "УПЦ": "#30b0c7", "План развития": "#5856d6",
};

export const ROADMAP_BAR_COL = {
  done:     { bar: "#34c759", soft: "#d9f4e2" },
  progress: { bar: "#007aff", soft: "#d6e9ff" },
  planned:  { bar: "#c7c7cc", soft: "#ebebf0" },
};
export const ROADMAP_MILESTONE_COLORS = ["#5856d6", "#007aff", "#34c759", "#ff9500", "#ff3b30", "#30b0c7", "#af52de", "#8e8e93"];
export const ROADMAP_STATUS_COLOR = { active: COLORS.greenText, draft: COLORS.orangeText, archived: COLORS.gray };

export const STICKER_COLORS = [
  { id: "sky",    label: "Голубой",    surface: "#eaf3ff", accent: "#007aff", text: "#007aff", border: "rgba(0,122,255,.18)" },
  { id: "mint",   label: "Мятный",     surface: "#e9faf1", accent: "#34c759", text: "#1d9a5b", border: "rgba(52,199,89,.22)" },
  { id: "amber",  label: "Янтарный",   surface: "#fff4e6", accent: "#ff9500", text: "#c77b09", border: "rgba(255,149,0,.25)" },
  { id: "violet", label: "Лавандовый", surface: "#f5efff", accent: "#af52de", text: "#af52de", border: "rgba(175,82,222,.22)" },
  { id: "rose",   label: "Розовый",    surface: "#ffeef2", accent: "#ff2d55", text: "#ff2d55", border: "rgba(255,45,85,.22)" },
];

// ── Style-фабрики контролов ──

export const segmentedWrapStyle = {
  display: "inline-flex", background: "rgba(118,118,128,.12)", borderRadius: 9, padding: 2,
};

export function segmentedItemStyle(active, textColor = COLORS.ink) {
  return {
    padding: "5px 14px", borderRadius: 7, border: "none", cursor: "pointer",
    fontFamily: FONT_STACK, fontSize: 11, fontWeight: active ? 600 : 400,
    background: active ? "#fff" : "transparent",
    boxShadow: active ? SHADOWS.segment : "none",
    color: active ? textColor : COLORS.textMid,
    transition: "background .15s, box-shadow .15s",
  };
}

export function pillButtonStyle(kind = "primary") {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 16px",
    borderRadius: RADII.pill, border: "none", cursor: "pointer",
    fontFamily: FONT_STACK, fontSize: 12, fontWeight: 600,
  };
  if (kind === "primary") return { ...base, background: COLORS.accent, color: "#fff", boxShadow: SHADOWS.accentBtn };
  if (kind === "danger")  return { ...base, background: "rgba(118,118,128,.08)", color: COLORS.redText };
  return { ...base, background: "rgba(118,118,128,.08)", color: COLORS.textMid }; // neutral
}

export const inputStyle = {
  width: "100%", padding: "10px 13px", borderRadius: RADII.input,
  border: "1px solid " + COLORS.hairlineStrong, background: "rgba(255,255,255,.85)",
  fontSize: 13, color: COLORS.ink, fontFamily: FONT_STACK, outline: "none", boxSizing: "border-box",
};

export const labelStyle = {
  fontSize: 10, fontWeight: 700, color: COLORS.textFaint, letterSpacing: .5,
  textTransform: "uppercase", marginBottom: 8, display: "block",
};

export function modalOverlayStyle(zIndex) {
  return {
    position: "fixed", inset: 0, zIndex, display: "flex",
    alignItems: "center", justifyContent: "center", padding: 20, ...GLASS.modalOverlay,
  };
}

export function modalCardStyle(maxWidth = 500) {
  return {
    width: `min(92vw, ${maxWidth}px)`, maxHeight: "92vh", display: "flex", flexDirection: "column",
    borderRadius: RADII.modal, boxShadow: SHADOWS.modal, overflow: "hidden",
    animation: "modalIn .18s ease", ...GLASS.modalCard,
  };
}

export const modalCloseButtonStyle = {
  width: 28, height: 28, borderRadius: "50%", border: "none",
  background: "rgba(118,118,128,.12)", color: COLORS.textSecondary, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

export function chipStyle(active, activeColor = COLORS.accent) {
  return {
    display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 11px",
    borderRadius: RADII.pill, border: "none", cursor: "pointer",
    fontFamily: FONT_STACK, fontSize: 11, fontWeight: active ? 600 : 400,
    background: active ? COLORS.accentSoft : "transparent",
    color: active ? activeColor : COLORS.textMid,
  };
}
```

- [ ] **Step 2: Проверить, что модуль импортируется без ошибок**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && node -e "import('./src/theme.js').then(m => console.log(Object.keys(m).length, 'exports OK'))"`
Expected: `>= 20 exports OK` (число экспортов и строка OK, без ошибок)

- [ ] **Step 3: ESLint**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npx eslint src/theme.js`
Expected: пусто (0 ошибок)

- [ ] **Step 4: Commit**

```bash
cd /Users/viktorgoracev/Documents/Project/Dashboard/new
git add frontend/src/theme.js
git commit -m "feat(redesign): add theme.js design tokens"
```

---

### Task 2: Оболочка — App.jsx (десктоп-сайдбар и шапка)

**Files:**
- Modify: `frontend/src/App.jsx` (сайдбар ~строки 226–275, шапка ~строки 281–307, корневой фон ~строка 223, лоадеры ~строки 210, 320)

Мобильная нижняя навигация (строки ~327–342) и мобильные ветки НЕ трогать.

- [ ] **Step 1: Импортировать токены**

В начало `App.jsx` добавить:

```js
import { COLORS, FONT_STACK, GLASS, AVATAR_GRADIENT, SHADOWS, RADII } from './theme.js';
```

- [ ] **Step 2: Применить точечные замены (только десктоп-ветки)**

| Место | Было | Стало |
|---|---|---|
| Корневой div (стр. ~223) | `background: "#f0f6ff"` | `background: COLORS.bgGradient` |
| Лоадеры (стр. 210, 320) | `background: "#f0f6ff", color: "#64748b"` | `background: "#fbfdff", color: COLORS.textMuted` |
| Сайдбар контейнер (стр. 227) | `background: "#1e3a6e"` | `...GLASS.sidebar, borderRight: "1px solid " + COLORS.hairline` |
| Лого-квадрат (стр. 229) | `linear-gradient(135deg,#3b82f6,#60a5fa)` | `AVATAR_GRADIENT` |
| Título «Дашборд» (стр. 232) | `color: "#fff"` / `color: "#7fb3f5"` | `color: COLORS.ink` / `color: COLORS.textMuted` |
| Подпись «Навигация» (стр. 235) | `color: "#4a7dbe"` | `color: COLORS.textFaint` |
| Пункт меню активный (стр. 242) | `background: "rgba(255,255,255,.13)", color "#fff"` | `background: COLORS.accentSoft, color: COLORS.accent` |
| Пункт меню неактивный | `color: "#7fb3f5"`, hover `rgba(255,255,255,.06)` | `color: COLORS.textMid`, hover `rgba(118,118,128,.08)` |
| Полоска-индикатор активного (стр. 245) | весь div | удалить |
| Иконка пункта (стр. 246) | `#fff` / `#7fb3f5` | `COLORS.accent` / `COLORS.textFaint` |
| Границы блоков сайдбара (стр. 228, 253) | `rgba(255,255,255,.08)` | `COLORS.hairline` |
| Кнопка «Свернуть» (стр. 256) | `color: "#4a7dbe"` | `color: COLORS.textFaint` |
| Юзер-блок (стр. 262) | `background: "rgba(255,255,255,.06)"` | `background: "rgba(118,118,128,.08)"` |
| Имя/роль юзера (стр. 265–266) | `#fff` / `#7fb3f5` | `COLORS.ink` / `COLORS.textMuted` |
| Кнопка выйти (стр. 268) | `rgba(255,255,255,.08)", color: "#7fb3f5"` | `rgba(118,118,128,.1)", color: COLORS.textMuted` |
| Аватары (стр. 263, 305) | `linear-gradient(135deg,#3b82f6,#60a5fa)` / `(#2563eb,#60a5fa)` | `AVATAR_GRADIENT` |
| Шапка контейнер (стр. 281, десктоп-значения) | `background: "#fff", borderBottom: "1px solid #e2edf8"` | `...GLASS.topbar, borderBottom: "1px solid " + COLORS.hairline` |
| Заголовок раздела (стр. 283, десктоп) | `fontSize: 18, fontWeight 750, color "#1e3a6e", letterSpacing -.3` | `fontSize: 26, fontWeight: 800, color: COLORS.ink, letterSpacing: -.5` |
| Описание раздела (стр. 284) | `color: "#94a3b8"` | `color: COLORS.textMuted` |
| Online/Offline пилюля (стр. 287) | рамка+заливка `#bbf7d0/#f0fdf4` и т.п. | без рамки и заливки: `{ display:"flex", alignItems:"center", gap:6, fontSize:11.5, fontWeight:600, color: isOnline ? COLORS.greenText : COLORS.redText }`, точка `background: isOnline ? COLORS.green : COLORS.red` |
| Дата (стр. 297) | `color: "#64748b"` | `color: COLORS.textMuted` |
| Разделитель (стр. 298) | `background: "#e2edf8"` | `background: COLORS.hairlineStrong` |
| Push-кнопка (стр. 300, десктоп) | рамочная с цветами состояний | нейтральная пилюля `background: "rgba(118,118,128,.08)"`, текст: enabled → `COLORS.greenText`, error/denied → `COLORS.redText`, иначе `COLORS.textMid`; `border: "none"` |

`fontFamily: "Inter"` в изменяемых элементах заменить на `FONT_STACK`. При `sidebarCollapsed` вид сохраняет те же новые цвета.

- [ ] **Step 3: ESLint + build**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npx eslint src/App.jsx && npm run build`
Expected: eslint пусто, build PASS

- [ ] **Step 4: Визуальная проверка**

Запустить `npm run dev`, открыть http://localhost:5174, залогиниться. Проверить: светлый стеклянный сайдбар, активный пункт голубой, крупный заголовок, Online — зелёный текст с точкой. Сжать окно до <820px: мобильная шапка и нижняя навигация — как раньше.

- [ ] **Step 5: Commit**

```bash
cd /Users/viktorgoracev/Documents/Project/Dashboard/new
git add frontend/src/App.jsx
git commit -m "feat(redesign): restyle desktop shell to light glass"
```

---

### Task 3: Общие компоненты — StatCard (pastel-вариант) и ConfirmDialog

**Files:**
- Modify: `frontend/src/components/common/StatCard.jsx`
- Modify: `frontend/src/components/common/ConfirmDialog.jsx`

- [ ] **Step 1: StatCard — добавить opt-in проп `pastel`**

Заменить содержимое `StatCard.jsx` на:

```jsx
import { PASTELS, FONT_STACK } from '../../theme.js';

export default function StatCard({ label, value, sub, color, compact = false, onClick = null, active = false, pastel = null }) {
  const interactive = typeof onClick === "function";
  const tone = pastel ? (PASTELS[pastel] || PASTELS.blue) : null;

  const baseStyle = tone
    ? { background: tone.surface, borderRadius: 16, padding: compact ? "9px 10px" : "12px 14px", flex: 1, minWidth: compact ? 0 : 140, border: active ? "1.5px solid " + tone.value : "1.5px solid transparent", cursor: interactive ? "pointer" : "default", fontFamily: FONT_STACK }
    : { background: active ? "#eff6ff" : "#fff", borderRadius: compact ? 10 : 14, padding: compact ? "9px 10px" : "20px 22px", flex: 1, minWidth: compact ? 0 : 180, border: active ? "1.5px solid #2563eb" : "1.5px solid transparent", boxShadow: compact ? "0 1px 3px rgba(37,99,235,.05)" : "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", cursor: interactive ? "pointer" : "default" };

  const labelColor = tone ? tone.label : (active ? "#2563eb" : "#94a3b8");
  const valueColor = tone ? tone.value : (color || "#1e3a6e");
  const subColor = tone ? tone.label : (active ? "#2563eb" : "#64748b");

  return (
    <div
      onClick={onClick || undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={baseStyle}
    >
      <div style={{ fontSize: compact ? 8 : (tone ? 9 : 11), fontWeight: 700, color: labelColor, letterSpacing: compact ? .35 : .6, textTransform: "uppercase", marginBottom: compact ? 4 : (tone ? 2 : 8), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
      <div style={{ fontSize: compact ? 20 : (tone ? 24 : 32), fontWeight: 800, color: valueColor, lineHeight: 1, letterSpacing: tone ? -.5 : 0 }}>{value}</div>
      {sub && <div style={{ fontSize: compact ? 9 : (tone ? 10 : 12), color: subColor, marginTop: compact ? 3 : (tone ? 2 : 5), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div>}
    </div>
  );
}
```

Без пропа `pastel` рендер побайтово прежний — разделы вне объёма (Архив, УПЦ, АМБП, План) не меняются.

- [ ] **Step 2: ConfirmDialog — единый стиль модалок + фикс градиента**

В `ConfirmDialog.jsx`:

```js
import { COLORS, FONT_STACK, modalOverlayStyle, modalCardStyle, Z } from '../../theme.js';
```

Замены:
- Оверлей (стр. 17–28): весь style → `modalOverlayStyle(Z.confirm)`.
- Карточка (стр. 34–42): style → `{ ...modalCardStyle(440), display: "block" }`.
- `accent`/`accentSoft` (стр. 13–14): `tone === "danger" ? COLORS.redText : COLORS.accent` и `tone === "danger" ? "#ffebeb" : COLORS.accentSoft`.
- Заголовок (стр. 65): `color: COLORS.ink`, fontWeight 800, letterSpacing −0.4.
- Текст (стр. 68): `color: COLORS.textSecondary`.
- Блок itemTitle (стр. 74–87): `background: "rgba(118,118,128,.08)", border: "1px solid " + COLORS.hairline, color: COLORS.ink`.
- Футер-граница (стр. 94): `borderTop: "1px solid " + COLORS.hairline`.
- Кнопка «Отмена» (стр. 97): `{ padding: "8px 18px", borderRadius: 999, border: "none", background: "rgba(118,118,128,.12)", color: COLORS.ink, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_STACK }`.
- Кнопка подтверждения (стр. 104) — **фикс бага** (был градиент `${accent}→#dc2626` даже для tone="primary"): `{ padding: "8px 20px", borderRadius: 999, border: "none", background: accent, color: "#fff", fontSize: 13, fontWeight: 650, cursor: "pointer", fontFamily: FONT_STACK, boxShadow: tone === "danger" ? "0 2px 8px rgba(239,68,68,.28)" : "0 2px 8px rgba(0,122,255,.28)" }`.

- [ ] **Step 3: ESLint + build**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npx eslint src/components/common/StatCard.jsx src/components/common/ConfirmDialog.jsx && npm run build`
Expected: PASS

- [ ] **Step 4: Визуальная проверка**

В dev-сервере: открыть «Текущие задачи», удалить тестовую задачу → диалог подтверждения в стекле с красной пилюлей. Открыть «Архив»/«УПЦ» → StatCard выглядят по-старому.

- [ ] **Step 5: Commit**

```bash
cd /Users/viktorgoracev/Documents/Project/Dashboard/new
git add frontend/src/components/common/StatCard.jsx frontend/src/components/common/ConfirmDialog.jsx
git commit -m "feat(redesign): unified modal style in ConfirmDialog, pastel StatCard variant"
```

---

### Task 4: «Текущие задачи» — TasksSection (десктоп)

**Files:**
- Modify: `frontend/src/sections/TasksSection.jsx`

Мобильные ветки (`isMobile === true`) везде сохраняют текущие значения — при замене констант вводить legacy или тернарники.

- [ ] **Step 1: Импорт токенов и консолидация констант**

```js
import { COLORS, FONT_STACK, PRIORITY_COLOR, COLUMN_TEXT, COLUMN_DOT, COLUMN_SURFACE, SHADOWS, RADII, segmentedWrapStyle, segmentedItemStyle, pillButtonStyle, chipStyle, modalOverlayStyle, modalCardStyle, modalCloseButtonStyle, Z } from '../theme.js';
```

Файл содержит 3 дублированных определения `priColor` (стр. 51, 403, 559) и 2 `colColor` (стр. 52, 404) + `colColor` на стр. 699. Для мобильных путей оставить старые значения как `LEGACY_PRI_COLOR` / `LEGACY_COL_COLOR` на уровне модуля (один раз, с комментарием `// мобильная ветка, удалить при рестайле мобильной`):

```js
const LEGACY_PRI_COLOR = { "Высокий": "#ef4444", "Средний": "#f59e0b", "Низкий": "#10b981" };
const LEGACY_COL_COLOR = { "Беклог": "#94a3b8", "В работе": "#2563eb", "Готов": "#10b981", "Архив": "#64748b" };
```

Внутри компонентов: `const priColor = isMobile ? LEGACY_PRI_COLOR : PRIORITY_COLOR;` и аналогично `colColor = isMobile ? LEGACY_COL_COLOR : COLUMN_TEXT;`. Локальные дубли удалить.

- [ ] **Step 2: Стат-карточки → pastel (стр. 978–984)**

К каждому StatCard добавить `pastel={...}` только для десктопа: `pastel={isMobile ? null : "blue"}` (Всего), `"gray"` (Беклог), `"indigo"` (В работе), `"green"` (Готово), `"amber"` (Без исполнителя). Проп `color` оставить (используется мобильным рендером).

- [ ] **Step 3: Тулбар доски (стр. 987–1043)**

| Место | Было | Стало |
|---|---|---|
| Контейнер доски (987) | старая тень/радиус | `borderRadius: RADII.card, boxShadow: SHADOWS.card` |
| «Доска задач» (991) | `color: "#1e3a6e"` | `color: COLORS.ink, fontWeight: 700, letterSpacing: -.2` |
| Разделители (994, 1012) | `#e2edf8` | `COLORS.hairlineStrong` |
| Подписи фильтров (998, 1016) | `color: "#94a3b8"` | `color: COLORS.textFaint` |
| `filterBtnStyle` (фильтр исполнителей) | рамочные кнопки | заменить на `chipStyle(active)` из theme |
| Фильтр приоритета (1017–1023) | кнопки `filterBtnStyle` | сегментированный контрол: обёртка `segmentedWrapStyle`, каждая кнопка `segmentedItemStyle(filterPriority===p, p === "all" ? COLORS.ink : PRIORITY_COLOR[p])` |
| «Добавить задачу» (1028) | градиентная кнопка | `pillButtonStyle("primary")` (иконку + оставить) |
| Хинт «Показано N из M» (1039) | `#2563eb` | `COLORS.accent` |

- [ ] **Step 4: Колонки канбана (стр. 1046–1097)**

| Место | Было | Стало |
|---|---|---|
| Колонка (1055) | `background: colBg[col]`, рамка `colBorder[col]` | `background: COLUMN_SURFACE[col]`, `border: "none"`, `borderRadius: RADII.column`; drag-over: `border: "1.5px dashed " + COLUMN_DOT[col]` (взамен сплошной) |
| Header колонки (1058–1062) | цветной текст+белый бейдж на заливке | точка `background: COLUMN_DOT[col]`; название `color: COLORS.ink, fontWeight: 700`; счётчик — текст `color: COLUMN_TEXT[col], fontWeight: 600` без background; `borderBottom: "1px solid " + COLORS.hairline` |
| «Отпустите здесь» (1066) | `colColor[col]` | `COLUMN_DOT[col]` |
| Пустая колонка (1074) | `#b0c4de` | `COLORS.textFaint` |

Локальные `colBg`/`colDropBg`/`colBorder` удалить (десктоп) — если их использует мобильный рендер, оставить с префиксом LEGACY.

- [ ] **Step 5: KanbanCard (стр. ~559–680, десктоп-значения)**

| Место | Было | Стало |
|---|---|---|
| Карточка (587) | рамка `#e8f1fd`, синеватые тени | `border: "1px solid " + (overdue ? "rgba(224,49,49,.35)" : COLORS.hairline)`, `borderRadius: RADII.kanbanCard`, тень `0 1px 2px rgba(15,23,42,.03)`; overdue: фон `#fff` (убрать розовый `#fff7f7`) |
| Hover (589–590) | синие тени/рамки | тень `0 4px 16px rgba(15,23,42,.08)`, рамка hairlineStrong (overdue — красная) |
| Точка приоритета (595) | `priColor` | удалить (приоритет теперь текстом справа) |
| Заголовок (596) | `color: "#1e3a6e"` | `color: COLORS.ink, fontWeight: 650` |
| Бейдж приоритета (597) | пилюля с заливкой `+"18"` | цветной текст: `{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[task.priority], flexShrink: 0 }` |
| Бейдж «Просрочено» (598) | пилюля `#fee2e2` | текст `color: COLORS.redText, fontWeight: 700` без background |
| Описание (623) | `#64748b`, ссылка `#2563eb` | `COLORS.textMuted`, ссылка `COLORS.accent` |
| Чипы Автор/Исп./Соисп. (650–661) | пилюли с заливками | строка мета-текста: `fontSize: 10.5, color: COLORS.textMuted`, формат `Автор: Имя · Исп.: Имя · Соисп.: Имя, Имя` (без background/border) |
| Срок в футере | синий/красный старые | `COLORS.textMuted`, просрочен — `COLORS.redText, fontWeight: 600` |
| Done-карточка | — | `opacity: .75` когда `isDoneColumn(task.column)` |

- [ ] **Step 6: Модалки TaskDetailModal (стр. 7–390) и AddTaskModal (стр. 393–…) — десктоп-значения тернарников**

Общие замены (в обеих модалках, только desktop-значения; где стиль общий без isMobile — обернуть в тернарник со старым значением для мобилы):

| Элемент | Стало (десктоп) |
|---|---|
| Оверлей | `modalOverlayStyle(Z.taskModal)` / `modalOverlayStyle(200)` — мобильные padding-поля сохранить |
| Карточка | `modalCardStyle(560)` / `modalCardStyle(500)` |
| Header | заголовок `fontSize: 18, fontWeight: 800, color: COLORS.ink, letterSpacing: -.4`; бейджи приоритет/колонка под заголовком → цветной текст `PRIORITY_COLOR`/`COLUMN_TEXT` без заливки; кнопка закрытия `modalCloseButtonStyle`; `borderBottom: "1px solid " + COLORS.hairline` |
| labelStyle | `labelStyle` из theme |
| inputStyle | `inputStyle` из theme; focus-рамка `#93c5fd` → `COLORS.accent` |
| Приоритет/Колонка (сегменты, стр. 256, 266) | `segmentButtonStyle` заменить на `segmentedWrapStyle` + `segmentedItemStyle(active, PRIORITY_COLOR[p] / COLUMN_TEXT[c])` |
| Чипы Автор/Исполнитель/Соисполнители (216–225, 345–…) | нейтральный текст `COLORS.textMuted` без заливок; кнопки соисполнителей — `chipStyle(active)` |
| Футер | `borderTop: "1px solid " + COLORS.hairline`; «Отмена» — нейтральная пилюля (как в ConfirmDialog Step 2); submit — `pillButtonStyle("primary")` |
| Ошибка валидации | `color: COLORS.redText` |

- [ ] **Step 7: AssigneePicker (frontend/src/components/common/AssigneePicker.jsx)**

Используется в карточках канбана. Заменить в нём цвета на токены: границы `#e2edf8`-семейства → `COLORS.hairlineStrong`, текст `#1e3a6e` → `COLORS.ink`, вторичный `#64748b`/`#94a3b8` → `COLORS.textMuted`/`COLORS.textFaint`, `fontFamily: "Inter"` → `FONT_STACK` (добавить импорт `import { COLORS, FONT_STACK } from '../../theme.js';`). Аватары участников (цвет из `member.color`) не трогать. Компонент используется только десктопным канбаном — мобильных веток в нём нет.

- [ ] **Step 8: ESLint + build + tests**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npx eslint src/sections/TasksSection.jsx src/components/common/AssigneePicker.jsx && npm run build && node --test src/utils/roadmapDependencies.test.js`
Expected: всё PASS

- [ ] **Step 9: Визуальная проверка**

Dev-сервер, раздел «Текущие задачи» (десктоп): пастельные стат-карточки, сегментированный фильтр, нейтральные колонки, приоритет текстом, drag&drop работает, обе модалки в стекле. Мобильная ширина: список задач и модалки — как раньше.

- [ ] **Step 10: Commit**

```bash
cd /Users/viktorgoracev/Documents/Project/Dashboard/new
git add frontend/src/sections/TasksSection.jsx frontend/src/components/common/AssigneePicker.jsx
git commit -m "feat(redesign): restyle Tasks desktop board and modals"
```

---

### Task 5: «Ключевые события» — EventsSection (десктоп)

**Files:**
- Modify: `frontend/src/sections/EventsSection.jsx`

- [ ] **Step 1: Импорт + TYPE_COLOR**

```js
import { COLORS, FONT_STACK, EVENT_TYPE_COLOR, SHADOWS, RADII, segmentedWrapStyle, segmentedItemStyle, pillButtonStyle, chipStyle, modalOverlayStyle, modalCardStyle, modalCloseButtonStyle, inputStyle, labelStyle, Z } from '../theme.js';
```

`TYPE_COLOR` (стр. 17) используется и мобильной веткой (стр. 673–685). Сохранить старую карту как `LEGACY_TYPE_COLOR`, а `TYPE_COLOR` определить как `isMobile ? LEGACY_TYPE_COLOR : EVENT_TYPE_COLOR` внутри компонента (перенести из module-scope в компонент, где доступен `isMobile`).

```js
const LEGACY_TYPE_COLOR = { "Совещание":"#2563eb","Мероприятие":"#8b5cf6","Релиз":"#10b981","Дедлайн":"#ef4444","Планирование":"#f59e0b","УПЦ":"#0f766e","План развития":"#7c3aed" };
```

- [ ] **Step 2: Стат-карточки (стр. 620–623)**

`pastel={isMobile ? null : "blue"}` (Событий в году), `"green"` (Завершено), `"indigo"` (Предстоит), `"amber"` (Просрочено/До конца года).

- [ ] **Step 3: Карточка таймлайна и тулбар (стр. 627–658)**

| Место | Было | Стало (десктоп) |
|---|---|---|
| Карточка (627) | старая тень | `borderRadius: RADII.card, boxShadow: SHADOWS.card` |
| «Дорожная карта 2026» (629) | `#1e3a6e` | `COLORS.ink, fontWeight: 700, letterSpacing: -.2` |
| Чипы типов (640) | рамка + заливка `c+"14"` | `chipStyle(active, c)` + цветная точка; неактивный текст `COLORS.textSecondary` |
| «Показать прошлое» (650) | рамочная кнопка | `pillButtonStyle("neutral")`; активна — `background: COLORS.accentSoft, color: COLORS.accent` |
| «Добавить событие» (654) | градиент | `pillButtonStyle("primary")` |

- [ ] **Step 4: Таймлайн (стр. 691–760)**

| Место | Было | Стало |
|---|---|---|
| Трек (715) | `#e8f1fd` | `COLORS.hairlineStrong` — фактически `rgba(15,23,42,.08)` |
| Прогресс (716) | `linear-gradient(90deg,#2563eb,#60a5fa)` | `linear-gradient(90deg,#38bdf8,#007aff)` |
| Насечки месяцев (719) | `#d1d5db` | `rgba(15,23,42,.12)` |
| Маркер «Сегодня» (724–725) | синий `#2563eb`/`#eff6ff` | `border: "3px solid " + COLORS.accent`, halo `rgba(0,122,255,.15)`; подпись `color: COLORS.accent, background: COLORS.accentSoft` |
| `roadmapLabelStyle` (метки событий) | старые рамки | белая метка: `background: "#fff", border: "1px solid " + COLORS.hairlineStrong, boxShadow: "0 1px 3px rgba(15,23,42,.05)", color: COLORS.ink, borderRadius: 8`; выбранная: `background: COLORS.accentSoft, border: "1px solid " + COLORS.accent, color: COLORS.accent` |
| Подписи месяцев (740–753) | `#94a3b8`, текущий `#2563eb` | `COLORS.textFaint`, текущий `COLORS.accent` |
| Линии-выноски меток | цвет типа, opacity .4 | без изменений (уже соответствует) |

- [ ] **Step 5: Карточка выбранного события (стр. 779–830)**

| Место | Было | Стало |
|---|---|---|
| Чекбокс-кнопка (785) | рамка+заливка `+"18"` | оставить заливку-квадрат `TYPE_COLOR+"18"` → `COLORS.accentSoft`-аналог: `background: TYPE_COLOR[type] + "14"`, done — `background: COLORS.green` |
| Заголовок (789) | `#1e3a6e` | `COLORS.ink, fontWeight: 750, letterSpacing: -.3` |
| Бейдж типа (792) | пилюля `+"18"` | цветной текст `color: TYPE_COLOR[type], fontWeight: 700` без background |
| «Автоматически»/«Завершено» (793–794) | пилюли | текст `COLORS.textMuted` / `COLORS.greenText` без background |
| Чипы участников (798–806) | цветные пилюли `member.color+"14"` | аватар + имя: убрать background/padding, текст `color: COLORS.textMid` |
| «Редактировать» (813) | синяя рамочная | `pillButtonStyle("neutral")` |
| «Удалить» (819) | красная рамочная | `pillButtonStyle("danger")` |
| «Добавить задачу» (824) | градиент | `pillButtonStyle("primary")` |

Список задач события ниже (строки ~831–893): карточки задач — `border: "1px solid " + COLORS.hairline`, заголовки `COLORS.ink`, вторичный текст `COLORS.textMuted`.

- [ ] **Step 6: Модалки EventModal / AddTaskModal / EventTaskModal (стр. 336–612)**

В каждой из трёх модалок:
- Оверлей → `modalOverlayStyle(Z.modal)` (для EventTaskModal — `modalOverlayStyle(Z.modalNested)`).
- Карточка → `modalCardStyle(500)`.
- Header: заголовок `fontSize: 18, fontWeight: 800, color: COLORS.ink, letterSpacing: -.4`, сабтайтл `COLORS.textMuted`, кнопка закрытия `modalCloseButtonStyle`, `borderBottom: "1px solid " + COLORS.hairline`.
- Инпуты → `inputStyle`, лейблы → `labelStyle` из theme; focus-подсветка границы → `COLORS.accent`; ошибки валидации → `COLORS.redText`.
- Тип события: селект/кнопки → сегментированный контрол `segmentedWrapStyle` + `segmentedItemStyle(type===t, TYPE_COLOR[t])`.
- Участники → кнопки `chipStyle(selected)` с аватаром внутри.
- Футер: `borderTop: "1px solid " + COLORS.hairline`; «Отмена» — `{ padding: "8px 18px", borderRadius: 999, border: "none", background: "rgba(118,118,128,.12)", color: COLORS.ink, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_STACK }`; submit — `pillButtonStyle("primary")`.

- [ ] **Step 7: ESLint + build**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npx eslint src/sections/EventsSection.jsx && npm run build`
Expected: PASS

- [ ] **Step 8: Визуальная проверка**

Десктоп: новые цвета типов, чипы без рамок, белые метки на таймлайне, карточка события с пилюлями. Мобильная ширина: список событий со СТАРЫМИ цветами типов (`LEGACY_TYPE_COLOR`) и прежним видом.

- [ ] **Step 9: Commit**

```bash
cd /Users/viktorgoracev/Documents/Project/Dashboard/new
git add frontend/src/sections/EventsSection.jsx
git commit -m "feat(redesign): restyle Events timeline and modals"
```

---

### Task 6: «Дорожные карты» — RoadmapsSection (десктоп)

**Files:**
- Modify: `frontend/src/sections/RoadmapsSection.jsx`

Внимание: в файле есть незакоммиченные изменения FS-зависимостей — работать поверх них, не откатывать.

- [ ] **Step 1: Константы (стр. 28–47)**

Заменить значения на импорты из theme (сохранив имена, чтобы не трогать использования):

```js
import { COLORS, FONT_STACK, ROADMAP_BAR_COL, ROADMAP_MILESTONE_COLORS, ROADMAP_STATUS_COLOR, SHADOWS, RADII, segmentedWrapStyle, segmentedItemStyle, pillButtonStyle, modalOverlayStyle, modalCardStyle, modalCloseButtonStyle, inputStyle, labelStyle, Z } from '../theme.js';

const STATUS_META = {
  active:   { label: "Активна",   color: ROADMAP_STATUS_COLOR.active,   bg: "transparent" },
  draft:    { label: "Черновик",  color: ROADMAP_STATUS_COLOR.draft,    bg: "transparent" },
  archived: { label: "Архив",     color: ROADMAP_STATUS_COLOR.archived, bg: "transparent" },
};
const BAR_COL = ROADMAP_BAR_COL;
const MILESTONE_COLORS = ROADMAP_MILESTONE_COLORS;
const DEFAULT_MILESTONE_COLOR = MILESTONE_COLORS[0];
```

Места, где рендерится статус с `bg`, перевести на цветной текст без background.

- [ ] **Step 2: Сквозная замена палитры файла (десктоп-рендер)**

Правило спеки: мобильный рендер без изменений. Мобильная версия раздела — списочная и использует те же константы. Поэтому завести на уровне модуля:

```js
// мобильная ветка, удалить при рестайле мобильной
const LEGACY_BAR_COL = {
  done:     { bar: "#22b07d", soft: "#cdeede" },
  progress: { bar: "#3b6fe0", soft: "#cfddf8" },
  planned:  { bar: "#aeb9d0", soft: "#dde3ee" },
};
const LEGACY_MILESTONE_COLORS = ["#6d5bd0", "#3b6fe0", "#22b07d", "#f3a236", "#ec5b6b", "#2bb6c4", "#8a96ad", "#e11d48"];
```

и в местах мобильного рендера выбирать `isMobile ? LEGACY_BAR_COL : BAR_COL` (аналогично для вех).

Точечные hex-замены по файлу (только в десктопных JSX-ветках):

| Было | Стало |
|---|---|
| `#3b6fe0` (акцент раздела, 19 мест) | `COLORS.accent` |
| `#22b07d` (вне BAR_COL) | `COLORS.green` (заливки) / `COLORS.greenText` (текст) |
| `#6d5bd0` (вне MILESTONE_COLORS) | `#5856d6` |
| `#1e3a6e` (заголовки) | `COLORS.ink` |
| `#94a3b8` / `#64748b` / `#475569` | `COLORS.textFaint` / `COLORS.textMuted` / `COLORS.textMid` |
| `#e2edf8` / `#e8f0fa` (границы) | `COLORS.hairline` |
| `#f8fbff` (подложки) | `rgba(118,118,128,.03)` |
| `#dbeafe` (границы-подсветки) | `COLORS.accentSoft` |
| `fontFamily: "Inter"` | `fontFamily: FONT_STACK` |

- [ ] **Step 3: Линии Gantt (утверждённые в мокапах v4)**

1. **FS-зависимости** (SVG-оверлей из FS-фичи, стр. ~1759–1782): линиям задать `stroke: "#a1a1a6", strokeWidth: 1, strokeDasharray: "2 2"`; наконечнику стрелки — `strokeDasharray: "none"`, уменьшенный размер (~5×3.5px при текущем масштабе).
2. **Вертикаль «сегодня»:** сплошная `background: COLORS.red` (`#ff3b30`), ширина 1.5px, сверху красная точка 7px (найти текущий рендер линии "сегодня" в TimelineView и заменить цвет/добавить точку; пунктира НЕ применять).
3. **Направляющая вехи:** вертикаль под ромбом — `borderLeft: "1px dashed"` в цвет вехи с opacity .45.
4. **Легенда:** добавить образцы «Зависимость» (пунктирная линия со стрелкой, inline-SVG из мокапа v4) и «Сегодня» (красная черта 2×12px), рядом с существующими образцами статусов полос.

- [ ] **Step 4: Тулбар и сетка**

| Место | Было | Стало |
|---|---|---|
| «Экспорт JSON» (стр. ~2444), «Связать» (2498), «Добавить веху» (2507) | рамочные кнопки | `pillButtonStyle("neutral")`; активный link-mode («Отменить связь») — `background: COLORS.accentSoft, color: COLORS.accent` |
| «Добавить задачу» (2511) | градиент | `pillButtonStyle("primary")` |
| Шапка месяцев/кварталов сетки | старые заливки | `background: "rgba(118,118,128,.05)"`, подписи `COLORS.textMuted`, текущий месяц `COLORS.accent` жирным |
| Линии сетки | старые | `COLORS.hairline`, чётные строки `rgba(118,118,128,.02)` |

- [ ] **Step 5: Модалки раздела (BarFormModal ~стр. 810–1070, модалка вех ~2311, модалка роадмапа)**

В каждой модалке раздела:
- Оверлей → `modalOverlayStyle(Z.modal)`, карточка → `modalCardStyle(520)`.
- Header: заголовок `fontSize: 18, fontWeight: 800, color: COLORS.ink, letterSpacing: -.4`, кнопка закрытия `modalCloseButtonStyle`, `borderBottom: "1px solid " + COLORS.hairline`.
- Инпуты → `inputStyle`, лейблы → `labelStyle`; ошибки → `COLORS.redText`.
- Футер: «Отмена» — нейтральная пилюля `{ padding: "8px 18px", borderRadius: 999, border: "none", background: "rgba(118,118,128,.12)", color: COLORS.ink, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT_STACK }`; submit — `pillButtonStyle("primary")`.
- Список предшественников (FS-фича) в BarFormModal: чипы задач — `chipStyle(selected)`, кнопки удаления связи — красный текст `COLORS.redText`.

Выбор цвета вехи — кружки 28px с галочкой на выбранном (вместо кнопок): 

```jsx
{MILESTONE_COLORS.map(c => (
  <button key={c} onClick={() => setColor(c)} aria-label={c}
    style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: "none", cursor: "pointer",
      boxShadow: color === c ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : "none",
      display: "flex", alignItems: "center", justifyContent: "center" }}>
    {color === c && <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 7.2 5.8 10 11 4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
  </button>
))}
```

Селект статуса роадмапа → сегментированный контрол `segmentedItemStyle(active, STATUS_META[value].color)`.

- [ ] **Step 6: ESLint + build + FS-тесты**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npx eslint src/sections/RoadmapsSection.jsx && npm run build && node --test src/utils/roadmapDependencies.test.js`
Expected: всё PASS (6 тестов зелёные)

- [ ] **Step 7: Визуальная проверка**

Десктоп: полосы green/blue/gray, пунктирные зависимости, красная сплошная «сегодня», пунктирные направляющие вех, пилюли тулбара, легенда с новыми образцами. Проверить drag полосы, drag вехи, режим «Связать», двойной клик → модалка в стекле, экспорт JSON (цвета в экспорте — новые). Мобильная ширина: списочный вид со старыми цветами.

- [ ] **Step 8: Commit**

```bash
cd /Users/viktorgoracev/Documents/Project/Dashboard/new
git add frontend/src/sections/RoadmapsSection.jsx
git commit -m "feat(redesign): restyle Roadmaps gantt, lines and modals"
```

---

### Task 7: «Заметки» — SyncsSection (десктоп)

**Files:**
- Modify: `frontend/src/sections/SyncsSection.jsx`

- [ ] **Step 1: Константы цветов (стр. 9–15)**

```js
import { COLORS, FONT_STACK, STICKER_COLORS as THEME_STICKER_COLORS, SHADOWS, RADII, pillButtonStyle, modalOverlayStyle, modalCardStyle, modalCloseButtonStyle, inputStyle, labelStyle, Z } from '../theme.js';

// мобильная ветка, удалить при рестайле мобильной
const LEGACY_STICKER_COLORS = [
  { id: "sky", label: "Голубой", surface: "#eff6ff", accent: "#2563eb", border: "#bfdbfe" },
  { id: "mint", label: "Мятный", surface: "#ecfdf5", accent: "#10b981", border: "#a7f3d0" },
  { id: "amber", label: "Янтарный", surface: "#fffbeb", accent: "#f59e0b", border: "#fde68a" },
  { id: "violet", label: "Лавандовый", surface: "#f5f3ff", accent: "#8b5cf6", border: "#ddd6fe" },
  { id: "rose", label: "Розовый", surface: "#fff1f2", accent: "#e11d48", border: "#fecdd3" },
];
```

В компоненте: `const STICKER_COLORS = isMobile ? LEGACY_STICKER_COLORS : THEME_STICKER_COLORS;` (у THEME-варианта есть доп. поле `text` — использовать для текста спикера).

- [ ] **Step 2: Доска (стр. 292–426, десктоп)**

| Место | Было | Стало |
|---|---|---|
| Фон доски (312) | `linear-gradient(180deg,#f8fbff,#f1f7ff)` | `#fbfdff` |
| Сетка (316) | линейная `linear-gradient(...) 28px` | точечная: `backgroundImage: "radial-gradient(rgba(15,23,42,.10) 1px, transparent 1px)", backgroundSize: "22px 22px"` |
| «Workspace» (317) | `#93a9ca` | `#c7c7cc` |
| «Создать заметку» (299) | градиент | `pillButtonStyle("primary")` |
| Стикер (321–336) | радиус 18, синяя тень | `borderRadius: 16`, `border: "1px solid " + color.border`, `boxShadow: "0 8px 24px " + color.accent + "1A, 0 1px 3px rgba(15,23,42,.05)"` |
| Header стикера (352) | dashed граница `color.border` | оставить dashed, цвет `color.border` (rgba-вариант из theme) |
| Спикер (356) | `color.accent` | `color.text` |
| Тема (357) | `#1e3a6e` | `COLORS.ink` |
| Кнопка × (361) | `rgba(255,255,255,.72)`, `#94a3b8` | `rgba(255,255,255,.8)`, `COLORS.textFaint` |
| Textarea (372) | `#475569` | `COLORS.textMid`, `fontFamily: FONT_STACK` |
| Resize-уголок (390–403) | как было | граница `color.border` |
| Empty-state (412–421) | `#eff6ff/#60a5fa/#1e3a6e/#94a3b8` | `COLORS.accentSoft / COLORS.accent / COLORS.ink / COLORS.textMuted` |

- [ ] **Step 3: CreateStickerModal (стр. 115–198)**

- Оверлей → `modalOverlayStyle(Z.modalNested)`; карточка → `modalCardStyle(500)`.
- Header: 18/800 ink + сабтайтл `COLORS.textMuted`; закрытие — `modalCloseButtonStyle`.
- Инпуты/лейблы — из theme; ошибка — `COLORS.redText`.
- Выбор цвета: кнопки с подписями → кружки 28px с галочкой (код из Task 6 Step 5, `STICKER_COLORS.map(c => ...)` по `c.accent`), `aria-label={c.label}`.
- Футер: «Отмена» — нейтральная пилюля, «Создать стикер» — `pillButtonStyle("primary")`.
- Модалка используется и мобильной веткой — стеклянный стиль применяется одинаково (isMobile-специфика в этой модалке отсутствует, допущение зафиксировано в спеке: правки isMobile-тернарников нужны только там, где они уже есть).

- [ ] **Step 4: ESLint + build**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npx eslint src/sections/SyncsSection.jsx && npm run build`
Expected: PASS

- [ ] **Step 5: Визуальная проверка**

Десктоп: точечная сетка, гармонизированные стикеры, drag/resize работают, модалка с кружками цвета. Мобильная ширина: карточки заметок — старые цвета (`LEGACY_STICKER_COLORS`).

- [ ] **Step 6: Commit**

```bash
cd /Users/viktorgoracev/Documents/Project/Dashboard/new
git add frontend/src/sections/SyncsSection.jsx
git commit -m "feat(redesign): restyle Notes board and sticker modal"
```

---

### Task 8: Финальная верификация

**Files:**
- Verify: всё изменённое

- [ ] **Step 1: Полный прогон проверок**

Run: `cd /Users/viktorgoracev/Documents/Project/Dashboard/new/frontend && npx eslint src/ && npm run build && node --test src/utils/roadmapDependencies.test.js`
Expected: всё PASS

- [ ] **Step 2: Сквозная браузерная проверка (десктоп)**

Dev-сервер или собранный вариант (`cd server && docker compose restart dashboard-web`, http://localhost:8080). Пройти все 4 раздела + оболочку: консоль без ошибок (pageerror), все модалки открываются, drag&drop (канбан, Gantt, стикеры) работает.

- [ ] **Step 3: Проверка мобильной неизменности**

DevTools, ширина 390px: «Задачи», «События», «Карты», «Заметки» — прежний тёмно-синий стиль контента, нижняя навигация прежняя. Известное допущение: модалка стикеров и стекло модалок — общие (см. спека).

- [ ] **Step 4: Проверка нетронутых разделов**

Открыть Mind Map, Блок-схемы, УПЦ, АМБП, План развития, Архив, Пользователи — рендерятся без ошибок, старый стиль (это ок по спеке).

- [ ] **Step 5: Финальный коммит (если были правки по итогам проверки)**

```bash
cd /Users/viktorgoracev/Documents/Project/Dashboard/new
git add -A frontend/src
git commit -m "fix(redesign): polish after full verification"
```

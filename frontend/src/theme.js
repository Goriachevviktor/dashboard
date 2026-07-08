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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useConfirmDialog } from '../components/common/useConfirmDialog.jsx';
import { createSerialSaver, normalizeMindMaps } from './mindMapState.js';

const OWNERS = {
  viktor: { name: "Виктор",  initials: "ВИ", color: "#6d5bd0" },
  anna:   { name: "Анна",    initials: "АК", color: "#22b07d" },
  dmitry: { name: "Дмитрий", initials: "ДМ", color: "#3b6fe0" },
  elena:  { name: "Елена",   initials: "ЕС", color: "#f3a236" },
  pavel:  { name: "Павел",   initials: "ПР", color: "#2bb6c4" },
};

const MAP_STATUS_META = {
  active: { label: "Активна", color: "#22b07d", bg: "#e6f7f0" },
  draft: { label: "Черновик", color: "#f3a236", bg: "#fdf1df" },
  archived: { label: "Архив", color: "#8a96ad", bg: "#eef1f6" },
};

const MAP_STATUS_OPTIONS = [
  { value: "active", label: "Активна" },
  { value: "draft", label: "Черновик" },
  { value: "archived", label: "Архив" },
];

const MINDMAP_BRANCH_COLORS = ["#3b6fe0", "#22b07d", "#6d5bd0", "#f3a236", "#2bb6c4", "#ec5b6b"];
const MINDMAP_TAG_COLORS = ["#3b6fe0", "#22b07d", "#6d5bd0", "#f3a236", "#2bb6c4", "#ec5b6b", "#8a96ad"];
const MINDMAP_ICON_NAMES = ["flag", "star", "bolt", "rocket", "check", "trend", "chart", "users", "search"];

function countMindMapNodes(node) {
  return 1 + (node.children || []).reduce((total, child) => total + countMindMapNodes(child), 0);
}

function collectMindMapProgress(node, values = []) {
  if (typeof node.progress === "number") values.push(Math.max(0, Math.min(100, node.progress)));
  (node.children || []).forEach(child => collectMindMapProgress(child, values));
  return values;
}

function calcMindMapProgress(root) {
  const values = collectMindMapProgress(root);
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function enrichMindMap(map) {
  const branches = map.root.children || [];
  return {
    ...map,
    nodeCount: Math.max(0, countMindMapNodes(map.root) - 1),
    branchCount: branches.length,
    progress: calcMindMapProgress(map.root),
    palette: branches.map(branch => branch.color).filter(Boolean),
  };
}

function cloneMindMapNode(node) {
  return {
    ...node,
    children: node.children ? node.children.map(cloneMindMapNode) : [],
  };
}

function legacyNodeFromMindMapNode(node) {
  return {
    id: node.id,
    text: node.label,
    label: node.label,
    color: node.color,
    icon: node.icon,
    progress: node.progress,
    owner: node.owner,
    note: node.note,
    children: (node.children || []).map(legacyNodeFromMindMapNode),
  };
}

function mindMapNodeFromWorkingNode(node) {
  return {
    id: node.id,
    label: node.label || node.text || "Без названия",
    ...(node.color ? { color: node.color } : {}),
    ...(node.icon ? { icon: node.icon } : {}),
    ...(typeof node.progress === "number" ? { progress: node.progress } : {}),
    ...(node.owner ? { owner: node.owner } : {}),
    ...(node.note ? { note: node.note } : {}),
    children: (node.children || []).map(mindMapNodeFromWorkingNode),
  };
}

const SAMPLE_MINDMAPS = [
  {
    id: "mm-strategy",
    title: "Стратегия продукта 2026",
    desc: "Видение, цели и ключевые направления развития на год",
    owner: "viktor",
    tag: "Стратегия",
    tagColor: "#3b6fe0",
    status: "active",
    updated: "вчера",
    root: {
      id: "s0",
      label: "Продукт 2026",
      icon: "flag",
      children: [
        { id: "s1", label: "Рост", color: "#3b6fe0", icon: "trend", children: [
          { id: "s11", label: "Новые рынки", progress: 40, owner: "elena" },
          { id: "s12", label: "Реферальная программа", progress: 0, owner: "anna" },
          { id: "s13", label: "Партнерства", progress: 20, owner: "pavel" },
        ]},
        { id: "s2", label: "Продукт", color: "#22b07d", icon: "star", children: [
          { id: "s21", label: "Мобильное приложение", progress: 45, owner: "viktor" },
          { id: "s22", label: "AI-ассистент", progress: 15, owner: "dmitry", note: true },
          { id: "s23", label: "Интеграции", progress: 60, owner: "dmitry", children: [
            { id: "s231", label: "CRM", progress: 70, owner: "dmitry" },
            { id: "s232", label: "Мессенджеры", progress: 30, owner: "anna" },
          ]},
        ]},
        { id: "s3", label: "Технологии", color: "#6d5bd0", icon: "bolt", children: [
          { id: "s31", label: "Масштабирование", progress: 70, owner: "dmitry" },
          { id: "s32", label: "Безопасность", progress: 50, owner: "elena", note: true },
          { id: "s33", label: "Тех. долг", progress: 35, owner: "pavel" },
        ]},
        { id: "s4", label: "Команда", color: "#f3a236", icon: "users", children: [
          { id: "s41", label: "Найм 8 человек", progress: 25, owner: "anna" },
          { id: "s42", label: "Процессы", progress: 55, owner: "viktor" },
        ]},
        { id: "s5", label: "Метрики", color: "#2bb6c4", icon: "chart", children: [
          { id: "s51", label: "MRR x2", progress: 30, owner: "elena" },
          { id: "s52", label: "Retention 85%", progress: 50, owner: "pavel" },
          { id: "s53", label: "NPS 60+", progress: 40, owner: "anna" },
        ]},
      ],
    },
  },
  {
    id: "mm-launch",
    title: "Запуск нового продукта",
    desc: "План вывода продукта на рынок: от подготовки до пострелиза",
    owner: "elena",
    tag: "Запуск",
    tagColor: "#f3a236",
    status: "active",
    updated: "2 дня назад",
    root: {
      id: "l0",
      label: "Запуск v2.0",
      icon: "rocket",
      children: [
        { id: "l1", label: "Подготовка", color: "#3b6fe0", icon: "check", children: [
          { id: "l11", label: "Финал фич", progress: 80, owner: "dmitry" },
          { id: "l12", label: "QA и тесты", progress: 60, owner: "pavel" },
          { id: "l13", label: "Документация", progress: 40, owner: "anna" },
        ]},
        { id: "l2", label: "Маркетинг", color: "#f3a236", icon: "star", children: [
          { id: "l21", label: "Лендинг", progress: 70, owner: "elena" },
          { id: "l22", label: "Email-кампания", progress: 30, owner: "anna" },
          { id: "l23", label: "Соцсети", progress: 50, owner: "elena" },
        ]},
        { id: "l3", label: "Релиз", color: "#22b07d", icon: "rocket", children: [
          { id: "l31", label: "Деплой", progress: 0, owner: "dmitry" },
          { id: "l32", label: "Мониторинг", progress: 0, owner: "pavel", note: true },
        ]},
        { id: "l4", label: "Пострелиз", color: "#6d5bd0", icon: "chart", children: [
          { id: "l41", label: "Сбор обратной связи", progress: 0, owner: "anna" },
          { id: "l42", label: "Хотфиксы", progress: 0, owner: "dmitry" },
        ]},
      ],
    },
  },
  {
    id: "mm-research",
    title: "Исследование пользователей",
    desc: "Карта инсайтов, сегментов и гипотез из интервью",
    owner: "pavel",
    tag: "Research",
    tagColor: "#2bb6c4",
    status: "active",
    updated: "5 дней назад",
    root: {
      id: "r0",
      label: "User Research",
      icon: "search",
      children: [
        { id: "r1", label: "Сегменты", color: "#2bb6c4", children: [
          { id: "r11", label: "Малый бизнес", owner: "pavel" },
          { id: "r12", label: "Корпорации", owner: "elena" },
          { id: "r13", label: "Фрилансеры", owner: "anna" },
        ]},
        { id: "r2", label: "Боли", color: "#ec5b6b", icon: "flag", children: [
          { id: "r21", label: "Долгий онбординг", note: true },
          { id: "r22", label: "Сложный экспорт" },
          { id: "r23", label: "Нет мобайла" },
        ]},
        { id: "r3", label: "Гипотезы", color: "#6d5bd0", icon: "bolt", children: [
          { id: "r31", label: "Тур -> активацию", progress: 0, owner: "anna" },
          { id: "r32", label: "Шаблоны -> retention", progress: 0, owner: "pavel" },
        ]},
        { id: "r4", label: "Инсайты", color: "#22b07d", icon: "star", children: [
          { id: "r41", label: "Ценят скорость" },
          { id: "r42", label: "Командная работа важна" },
        ]},
      ],
    },
  },
  {
    id: "mm-team",
    title: "Структура команды",
    desc: "Орг-структура, зоны ответственности и связи",
    owner: "anna",
    tag: "Команда",
    tagColor: "#22b07d",
    status: "draft",
    updated: "неделю назад",
    root: {
      id: "t0",
      label: "Команда продукта",
      icon: "users",
      children: [
        { id: "t1", label: "Продукт", color: "#3b6fe0", children: [
          { id: "t11", label: "PM", owner: "viktor" },
          { id: "t12", label: "Аналитик", owner: "pavel" },
        ]},
        { id: "t2", label: "Разработка", color: "#6d5bd0", children: [
          { id: "t21", label: "Backend", owner: "dmitry" },
          { id: "t22", label: "Frontend", owner: "elena" },
          { id: "t23", label: "QA", owner: "pavel" },
        ]},
        { id: "t3", label: "Дизайн", color: "#f3a236", children: [
          { id: "t31", label: "UX", owner: "elena" },
          { id: "t32", label: "UI", owner: "anna" },
        ]},
        { id: "t4", label: "Маркетинг", color: "#2bb6c4", children: [
          { id: "t41", label: "Контент", owner: "anna" },
          { id: "t42", label: "Performance", owner: "pavel" },
        ]},
      ],
    },
  },
  {
    id: "mm-competitors",
    title: "Анализ конкурентов",
    desc: "Сильные и слабые стороны ключевых игроков рынка",
    owner: "dmitry",
    tag: "Анализ",
    tagColor: "#6d5bd0",
    status: "active",
    updated: "3 дня назад",
    root: {
      id: "c0",
      label: "Конкуренты",
      icon: "chart",
      children: [
        { id: "c1", label: "Игрок A", color: "#3b6fe0", children: [
          { id: "c11", label: "+ Сильный бренд" },
          { id: "c12", label: "- Дорогой" },
        ]},
        { id: "c2", label: "Игрок B", color: "#22b07d", children: [
          { id: "c21", label: "+ Простой UX" },
          { id: "c22", label: "- Мало интеграций" },
        ]},
        { id: "c3", label: "Игрок C", color: "#f3a236", children: [
          { id: "c31", label: "+ Низкая цена" },
          { id: "c32", label: "- Слабая поддержка" },
        ]},
        { id: "c4", label: "Наши шансы", color: "#ec5b6b", icon: "bolt", children: [
          { id: "c41", label: "Скорость внедрения" },
          { id: "c42", label: "AI-функции" },
        ]},
      ],
    },
  },
  {
    id: "mm-brainstorm",
    title: "Брейншторм фич Q3",
    desc: "Сырые идеи и их приоритизация",
    owner: "viktor",
    tag: "Идеи",
    tagColor: "#8a96ad",
    status: "draft",
    updated: "только что",
    root: {
      id: "b0",
      label: "Идеи Q3",
      icon: "bolt",
      children: [
        { id: "b1", label: "Must have", color: "#ec5b6b", children: [
          { id: "b11", label: "Темная тема" },
          { id: "b12", label: "Экспорт PDF" },
        ]},
        { id: "b2", label: "Nice to have", color: "#3b6fe0", children: [
          { id: "b21", label: "Виджеты" },
          { id: "b22", label: "Горячие клавиши" },
        ]},
        { id: "b3", label: "Эксперименты", color: "#6d5bd0", children: [
          { id: "b31", label: "Голосовой ввод" },
          { id: "b32", label: "AI-резюме" },
        ]},
      ],
    },
  },
].map(enrichMindMap);

const TARGET_MINDMAP_MODEL = SAMPLE_MINDMAPS[0];

const LAYOUT_GAP = [0, 250, 230, 210];
const LAYOUT_ROW_HEIGHT = 50;
const LAYOUT_NODE_HEIGHT = 40;
const LAYOUT_ROOT_HEIGHT = 56;

function estimateNodeWidth(label, depth, extras = 0) {
  const charWidth = depth === 0 ? 9.6 : depth === 1 ? 8.6 : 7.8;
  const base = depth === 0 ? 64 : 40;
  return Math.min(260, Math.max(depth === 0 ? 150 : 90, label.length * charWidth + base + extras));
}

function countDescendants(node) {
  return (node.children || []).reduce((total, child) => total + 1 + countDescendants(child), 0);
}

function buildMindMapLayout(root, collapsed = new Set()) {
  const nodes = [];
  const links = [];

  function xAt(depth, side) {
    let x = 0;
    for (let level = 1; level <= depth; level += 1) {
      x += LAYOUT_GAP[Math.min(level, LAYOUT_GAP.length - 1)];
    }
    return side * x;
  }

  function paintBranch(node, color) {
    const branchColor = color || node.color || "#3b6fe0";
    return {
      ...node,
      branchColor,
      children: (node.children || []).map(child => paintBranch(child, branchColor)),
    };
  }

  function placeSide(children, side) {
    let cursor = 0;
    const topY = [];

    function walk(node, depth, parent) {
      const rawKids = node.children || [];
      const isCollapsed = collapsed.has(node.id);
      const kids = isCollapsed ? [] : rawKids;
      const extras = (node.owner ? 28 : 0) + (node.icon ? 22 : 0) + (typeof node.progress === "number" ? 30 : 0) + (node.note ? 16 : 0) + (rawKids.length ? 22 : 0);
      const width = estimateNodeWidth(node.label, depth, extras);
      let y;
      if (kids.length === 0) {
        y = cursor * LAYOUT_ROW_HEIGHT;
        cursor += 1;
      } else {
        const childY = kids.map(child => walk(child, depth + 1, node));
        y = (childY[0] + childY[childY.length - 1]) / 2;
      }
      const record = {
        ...node,
        depth,
        side,
        x: xAt(depth, side),
        y,
        w: width,
        h: depth === 0 ? LAYOUT_ROOT_HEIGHT : LAYOUT_NODE_HEIGHT,
        hasKids: rawKids.length > 0,
        collapsed: isCollapsed,
        hiddenCount: countDescendants(node),
      };
      nodes.push(record);
      if (parent) links.push({ from: parent.id, to: node.id, color: node.branchColor, side, depth });
      return y;
    }

    children.forEach(child => topY.push(walk(child, 1, root)));
    return topY;
  }

  const branches = (root.children || []).map(branch => paintBranch(branch, branch.color));
  const right = branches.filter((_, index) => index % 2 === 0);
  const left = branches.filter((_, index) => index % 2 === 1);
  const rightY = placeSide(right, 1);
  const leftY = placeSide(left, -1);
  const allY = [...rightY, ...leftY];
  const rootY = allY.length ? (Math.min(...allY) + Math.max(...allY)) / 2 : 0;

  nodes.unshift({
    ...root,
    depth: 0,
    side: 0,
    x: 0,
    y: rootY,
    w: estimateNodeWidth(root.label, 0, root.icon ? 30 : 0),
    h: LAYOUT_ROOT_HEIGHT,
    hasKids: !!(root.children && root.children.length),
  });

  const padding = 80;
  const minX = Math.min(...nodes.map(node => node.x - node.w / 2));
  const maxX = Math.max(...nodes.map(node => node.x + node.w / 2));
  const minY = Math.min(...nodes.map(node => node.y - node.h / 2));
  const maxY = Math.max(...nodes.map(node => node.y + node.h / 2));
  nodes.forEach(node => {
    node.x = node.x - minX + padding;
    node.y = node.y - minY + padding;
  });
  const byId = {};
  nodes.forEach(node => { byId[node.id] = node; });

  return {
    nodes,
    links,
    byId,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

function connectorPath(parent, child) {
  const startX = parent.x + (child.side >= 0 ? parent.w / 2 : -parent.w / 2);
  const startY = parent.y;
  const endX = child.x + (child.side >= 0 ? -child.w / 2 : child.w / 2);
  const endY = child.y;
  const midX = (startX + endX) / 2;
  return `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
}

const INIT_MAP = legacyNodeFromMindMapNode(cloneMindMapNode(TARGET_MINDMAP_MODEL.root));

function uid() { return "n" + Math.random().toString(36).slice(2, 8); }

function createBlankMindMap(index) {
  const suffix = String(index + 1);
  const baseId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return enrichMindMap({
    id: `mm-${baseId}`,
    title: `Новая карта ${suffix}`,
    desc: "Новая ментальная карта",
    owner: "viktor",
    tag: "Идеи",
    tagColor: "#3b6fe0",
    status: "draft",
    updated: "только что",
    root: {
      id: `${baseId}-root`,
      label: "Центральная идея",
      icon: "flag",
      children: [
        { id: `${baseId}-branch-1`, label: "Направление 1", color: "#3b6fe0", icon: "trend", children: [] },
        { id: `${baseId}-branch-2`, label: "Направление 2", color: "#22b07d", icon: "star", children: [] },
        { id: `${baseId}-branch-3`, label: "Направление 3", color: "#6d5bd0", icon: "bolt", children: [] },
      ],
    },
  });
}

function findNodeWithParent(tree, id, parent = null) {
  if (tree.id === id) return { node: tree, parent };
  for (const child of tree.children || []) {
    const found = findNodeWithParent(child, id, tree);
    if (found) return found;
  }
  return null;
}

function updateNode(tree, id, updater) {
  if (tree.id === id) return updater(tree);
  return { ...tree, children: (tree.children || []).map(c => updateNode(c, id, updater)) };
}

function insertSiblingNode(tree, nodeId, newNode) {
  const hit = findNodeWithParent(tree, nodeId);
  if (!hit?.parent) {
    return { tree: updateNode(tree, nodeId, node => ({ ...node, children: [...(node.children || []), newNode] })), parentId: nodeId };
  }
  return {
    tree: updateNode(tree, hit.parent.id, parent => {
      const children = parent.children || [];
      const index = children.findIndex(child => child.id === nodeId);
      return {
        ...parent,
        children: [
          ...children.slice(0, index + 1),
          newNode,
          ...children.slice(index + 1),
        ],
      };
    }),
    parentId: hit.parent.id,
  };
}

function removeNode(tree, id) {
  return { ...tree, children: (tree.children || []).filter(c => c.id !== id).map(c => removeNode(c, id)) };
}

function MiniIcon({ name, size = 16 }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    mindmap: <><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="12" r="2" /><path d="M7 6.5 17 11M7 17.5 17 13" /></>,
    nodes: <><path d="M6 6h.01M18 6h.01M12 18h.01" /><path d="M7.5 7.5 11 16M16.5 7.5 13 16" /></>,
    back: <path d="m15 18-6-6 6-6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 11 15.8 7.2M8.2 13l7.6 3.8" /></>,
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
    zoomIn: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /><path d="M11 8v6M8 11h6" /></>,
    zoomOut: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /><path d="M8 11h6" /></>,
    fit: <><path d="M4 9V5a1 1 0 0 1 1-1h4" /><path d="M20 9V5a1 1 0 0 0-1-1h-4" /><path d="M4 15v4a1 1 0 0 0 1 1h4" /><path d="M20 15v4a1 1 0 0 1-1 1h-4" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    minus: <path d="M5 12h14" />,
    flag: <><path d="M4 21V4h13l-2 4 2 4H4" /></>,
    star: <path d="M12 3l2.6 5.6 5.9.7-4.5 4.1 1.3 5.8-5.3-3-5.3 3L8 13.4 3.5 9.3l5.9-.7L12 3Z" />,
    bolt: <path d="M13 2 4 14h7l-1 8 9-13h-7l1-7Z" />,
    rocket: <><path d="M5 15c-1 2-1 4-1 4s2 0 4-1" /><path d="M14.5 4.5C17 4 20 4 20 4s0 3-.5 5.5c-.7 3.3-3.3 6.2-7.5 8.5L9 15.5C11.3 11.3 14.2 8.7 17.5 8" /><circle cx="14.5" cy="9.5" r="1.4" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    trend: <><path d="M3 17 8 12l4 3 8-9" /><path d="M16 6h5v5" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 14 3-4 3 2 4-6" /></>,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.2a3.2 3.2 0 0 1 0 6" /><path d="M18 20a5.5 5.5 0 0 0-3-4.9" /></>,
  };
  return <svg {...props}>{paths[name] || paths.mindmap}</svg>;
}

function ownerMeta(owner, ownerName) {
  if (OWNERS[owner]) return OWNERS[owner];
  const name = ownerName || "Моя карта";
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "?";
  return { name, initials, color: "#6d5bd0" };
}

function OwnerAvatar({ owner, ownerName, size = 28 }) {
  const member = ownerMeta(owner, ownerName);
  return (
    <span
      title={member.name}
      style={{ width: size, height: size, borderRadius: "50%", background: member.color, color: "#fff", display: "inline-grid", placeItems: "center", fontSize: size * 0.36, fontWeight: 800, flex: `0 0 ${size}px` }}
    >
      {member.initials}
    </span>
  );
}

function CatalogStat({ label, value, sub, color }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2edf8", borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", minWidth: 180 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8", letterSpacing: .6, textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 5 }}>{sub}</div>
    </div>
  );
}

function MapPreview({ map }) {
  const colors = map.palette.length ? map.palette : [map.tagColor || "#3b6fe0"];
  const span = Math.ceil(colors.length / 2);
  return (
    <svg width="100%" height="100%" viewBox="0 0 220 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {colors.map((color, index) => {
        const side = index % 2 === 0 ? 1 : -1;
        const row = Math.floor(index / 2);
        const ty = span <= 1 ? 60 : 28 + row * (64 / Math.max(1, span - 1));
        const ex = 110 + side * 70;
        const mx = (110 + ex) / 2;
        return (
          <g key={`${map.id}-${color}-${index}`}>
            <path d={`M110 60 C ${mx} 60, ${mx} ${ty}, ${ex} ${ty}`} stroke={color} strokeWidth="3" fill="none" opacity=".82" />
            <circle cx={ex} cy={ty} r="6" fill={color} />
          </g>
        );
      })}
      <circle cx="110" cy="60" r="13" fill="#1e3a6e" />
    </svg>
  );
}

function MapCard({ map, onOpen, compact = false }) {
  const status = MAP_STATUS_META[map.status] || MAP_STATUS_META.draft;
  if (compact) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(map.id)}
        onKeyDown={event => { if (event.key === "Enter") onOpen(map.id); }}
        style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) 130px 120px 90px", gap: 16, alignItems: "center", background: "#fff", border: "1px solid #e2edf8", borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 3px rgba(37,99,235,.05)", cursor: "pointer" }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: map.tagColor }} />
            <h3 style={{ margin: 0, fontSize: 16, color: "#1e3a6e", fontWeight: 850 }}>{map.title}</h3>
          </div>
          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>{map.desc}</p>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifySelf: "start", borderRadius: 999, padding: "5px 10px", background: status.bg, color: status.color, fontSize: 11, fontWeight: 800 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: status.color }} />
          {status.label}
        </span>
        <div>
          <div style={{ color: "#2563eb", fontSize: 13, fontWeight: 850 }}>{map.progress}%</div>
          <div style={{ height: 6, borderRadius: 999, background: "#edf3fb", overflow: "hidden", marginTop: 5 }}>
            <span style={{ display: "block", height: "100%", width: `${map.progress}%`, background: map.tagColor, borderRadius: 999 }} />
          </div>
        </div>
        <OwnerAvatar owner={map.owner} size={30} />
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(map.id)}
      onKeyDown={event => { if (event.key === "Enter") onOpen(map.id); }}
      style={{ textAlign: "left", background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", cursor: "pointer", display: "flex", flexDirection: "column", minHeight: 308 }}
    >
      <div style={{ height: 140, position: "relative", borderBottom: "1px solid #edf3fb", background: "linear-gradient(135deg,#f8fbff,#eef5ff)" }}>
        <MapPreview map={map} />
        <span style={{ position: "absolute", left: 12, top: 12, display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 999, padding: "5px 11px", background: "#fff", color: map.tagColor, fontSize: 12, fontWeight: 800, boxShadow: "0 2px 8px rgba(30,58,110,.1)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: map.tagColor }} />
          {map.tag}
        </span>
      </div>
      <div style={{ padding: "18px 20px 16px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.2, fontWeight: 800, color: "#1e3a6e" }}>{map.title}</h3>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "4px 10px", background: status.bg, color: status.color, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: status.color }} />
            {status.label}
          </span>
        </div>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13.5, lineHeight: 1.45 }}>{map.desc}</p>
        <div style={{ display: "grid", gridTemplateColumns: "42px 1fr", alignItems: "center", gap: 10, marginTop: 2 }}>
          <span style={{ color: "#2563eb", fontSize: 13, fontWeight: 850 }}>{map.progress}%</span>
          <span style={{ height: 7, borderRadius: 999, background: "#edf3fb", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${map.progress}%`, background: map.tagColor, borderRadius: 999 }} />
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 13, borderTop: "1px solid #edf3fb", paddingTop: 14, marginTop: "auto" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#455270", fontSize: 13, fontWeight: 700 }}><MiniIcon name="mindmap" size={15} />{map.branchCount} ветвей</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#455270", fontSize: 13, fontWeight: 700 }}><MiniIcon name="nodes" size={15} />{map.nodeCount} узлов</span>
          <span style={{ flex: 1 }} />
          <span style={{ color: "#94a3b8", fontSize: 12 }}>{map.updated}</span>
          <OwnerAvatar owner={map.owner} ownerName={map.ownerName} size={28} />
        </div>
      </div>
    </div>
  );
}

function MindMapCatalog({ maps, onOpen, onCreateMap }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [viewMode, setViewMode] = useState("grid");
  const counts = useMemo(() => ({
    all: maps.length,
    active: maps.filter(map => map.status === "active").length,
    draft: maps.filter(map => map.status === "draft").length,
    archived: maps.filter(map => map.status === "archived").length,
  }), [maps]);
  const tags = useMemo(() => {
    const result = new Map();
    maps.forEach(map => {
      const key = map.tag || "Без тега";
      const item = result.get(key) || { label: key, color: map.tagColor || "#8a96ad", count: 0 };
      item.count += 1;
      result.set(key, item);
    });
    return Array.from(result.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [maps]);
  const filteredMaps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return maps.filter(map => {
      const statusMatch = filter === "all" || map.status === filter;
      const tagMatch = tagFilter === "all" || map.tag === tagFilter;
      const queryMatch = !normalizedQuery || `${map.title} ${map.desc} ${map.tag}`.toLowerCase().includes(normalizedQuery);
      return statusMatch && tagMatch && queryMatch;
    });
  }, [filter, maps, query, tagFilter]);
  const totalNodes = maps.reduce((sum, map) => sum + map.nodeCount, 0);
  const avgProgress = maps.length ? Math.round(maps.reduce((sum, map) => sum + map.progress, 0) / maps.length) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <CatalogStat label="Всего карт" value={maps.length} sub="ментальных карт" color="#1e3a6e" />
        <CatalogStat label="Активных" value={counts.active} sub="в работе" color="#2563eb" />
        <CatalogStat label="Узлов всего" value={totalNodes} sub="идей и задач" color="#6d5bd0" />
        <CatalogStat label="Прогресс" value={`${avgProgress}%`} sub="средний по картам" color="#22b07d" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {[{ value: "all", label: "Все карты" }, ...MAP_STATUS_OPTIONS].map(option => (
          <button
            key={option.value}
            onClick={() => setFilter(option.value)}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "9px 15px", border: filter === option.value ? "1.5px solid #bfdbfe" : "1.5px solid #e2edf8", background: filter === option.value ? "#eff6ff" : "#fff", color: filter === option.value ? "#2563eb" : "#64748b", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
          >
            {option.label}
            <span style={{ borderRadius: 999, padding: "1px 8px", background: filter === option.value ? "#fff" : "#eef3fb", color: filter === option.value ? "#2563eb" : "#94a3b8", fontSize: 11 }}>{counts[option.value]}</span>
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "inline-flex", background: "#fff", border: "1px solid #e2edf8", borderRadius: 999, padding: 4, gap: 2, boxShadow: "0 1px 2px rgba(37,99,235,.04)" }}>
          {[
            ["grid", "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
            ["list", "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"],
          ].map(([mode, d]) => (
            <button key={mode} onClick={() => setViewMode(mode)} title={mode === "grid" ? "Сетка" : "Список"}
              style={{ width: 34, height: 34, borderRadius: 999, border: "none", cursor: "pointer", background: viewMode === mode ? "#2563eb" : "transparent", color: viewMode === mode ? "#fff" : "#94a3b8", display: "grid", placeItems: "center" }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={d} />
              </svg>
            </button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 9, border: "1.5px solid #e2edf8", borderRadius: 999, padding: "9px 14px", background: "#fff", color: "#94a3b8", minWidth: 240 }}>
          <MiniIcon name="search" size={16} />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск карт..." style={{ border: "none", outline: "none", background: "transparent", fontSize: 14, color: "#1e3a6e", width: "100%", fontFamily: "Inter" }} />
        </label>
        <button onClick={onCreateMap} style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 12, padding: "10px 16px", border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(37,99,235,.25)" }}>
          <MiniIcon name="plus" size={16} />
          Новая карта
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setTagFilter("all")}
          style={{ border: tagFilter === "all" ? "1.5px solid #bfdbfe" : "1.5px solid #e2edf8", background: tagFilter === "all" ? "#eff6ff" : "#fff", color: tagFilter === "all" ? "#2563eb" : "#64748b", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 850, cursor: "pointer", fontFamily: "Inter" }}>
          Все теги
        </button>
        {tags.map(tag => (
          <button key={tag.label} onClick={() => setTagFilter(tag.label)}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, border: tagFilter === tag.label ? "1.5px solid #bfdbfe" : "1.5px solid #e2edf8", background: tagFilter === tag.label ? "#eff6ff" : "#fff", color: tagFilter === tag.label ? "#2563eb" : "#64748b", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 850, cursor: "pointer", fontFamily: "Inter" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: tag.color }} />
            {tag.label}
            <span style={{ color: "#94a3b8" }}>{tag.count}</span>
          </button>
        ))}
      </div>

      {filteredMaps.length === 0 ? (
        <div style={{ minHeight: 260, border: "2px dashed #cbdaf0", borderRadius: 16, background: "#f8fbff", color: "#64748b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 24 }}>
          <span style={{ width: 52, height: 52, borderRadius: "50%", background: "#eaf1ff", color: "#2563eb", display: "grid", placeItems: "center" }}><MiniIcon name="search" size={24} /></span>
          <span style={{ fontSize: 16, fontWeight: 850, color: "#1e3a6e" }}>{maps.length ? "Карты не найдены" : "Пока нет ментальных карт"}</span>
          <span style={{ fontSize: 13 }}>{maps.length ? "Измените фильтры или поисковый запрос." : "Создайте первую карту для работы с идеями."}</span>
          {!maps.length && <button onClick={onCreateMap} style={{ marginTop: 6, display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 12, padding: "10px 16px", border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}><MiniIcon name="plus" size={16} />Новая карта</button>}
        </div>
      ) : (
        <div style={viewMode === "grid" ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 18 } : { display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredMaps.map(map => (
            <MapCard
              key={map.id}
              map={map}
              onOpen={onOpen}
              compact={viewMode === "list"}
            />
          ))}
          {viewMode === "grid" && (
            <button
              onClick={onCreateMap}
              style={{ minHeight: 308, border: "2px dashed #cbdaf0", borderRadius: 16, background: "#f8fbff", color: "#94a3b8", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 24 }}
            >
              <span style={{ width: 52, height: 52, borderRadius: "50%", background: "#eaf1ff", color: "#2563eb", display: "grid", placeItems: "center" }}><MiniIcon name="plus" size={26} /></span>
              <span style={{ fontSize: 16, fontWeight: 800 }}>Создать ментальную карту</span>
              <span style={{ fontSize: 13 }}>С нуля или из шаблона мозгового штурма</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CanvasNode({ node, selected, editing, onSelect, onStartEdit, onRename, onToggle, onNodeDown }) {
  const isRoot = node.depth === 0;
  const isMain = node.depth === 1;
  const color = node.branchColor || node.color || "#3b6fe0";
  const style = {
    position: "absolute",
    left: node.x,
    top: node.y,
    width: node.w,
    height: node.h,
    transform: "translate(-50%, -50%)",
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderRadius: isRoot ? 14 : isMain ? 12 : 11,
    padding: isRoot ? "0 20px" : "0 13px",
    fontSize: isRoot ? 17 : isMain ? 15 : 13.5,
    fontWeight: isRoot ? 800 : 750,
    userSelect: "none",
    cursor: "pointer",
    outline: selected ? `2.5px solid ${color}` : "none",
    outlineOffset: isRoot ? 4 : 3,
    boxSizing: "border-box",
    zIndex: selected ? 4 : 2,
  };
  if (isRoot) {
    Object.assign(style, {
      background: "linear-gradient(135deg,#1e3a6e,#3a5694)",
      color: "#fff",
      boxShadow: "0 10px 28px rgba(30,58,110,.32)",
    });
  } else if (isMain) {
    Object.assign(style, {
      background: color,
      color: "#fff",
      boxShadow: `0 6px 16px ${color}55`,
    });
  } else {
    Object.assign(style, {
      background: "#fff",
      color: "#1e3a6e",
      border: "1px solid #e2edf8",
      borderBottom: `3px solid ${color}`,
      boxShadow: "0 3px 10px rgba(31,45,77,.08)",
    });
  }

  return (
    <div
      style={style}
      onMouseDown={event => { event.stopPropagation(); onNodeDown(node.id, event); }}
      onClick={event => { event.stopPropagation(); onSelect(node.id); }}
      onDoubleClick={event => { event.stopPropagation(); onStartEdit(node.id); }}
    >
      {node.icon && <span style={{ display: "inline-flex", color: isRoot || isMain ? "currentColor" : color, flex: "0 0 auto" }}><MiniIcon name={node.icon} size={isRoot ? 18 : 15} /></span>}
      {editing ? (
        <input
          defaultValue={node.label || node.text}
          autoFocus
          onMouseDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
          onBlur={event => onRename(node.id, event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter") {
              event.preventDefault();
              onRename(node.id, event.currentTarget.value);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onRename(node.id, node.label || node.text);
            }
          }}
          style={{ flex: 1, minWidth: 70, border: "none", outline: "none", borderRadius: 7, padding: "4px 7px", background: "rgba(255,255,255,.95)", color: "#1e3a6e", font: "inherit", fontWeight: 800 }}
        />
      ) : (
        <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{node.text || node.label}</span>
      )}
      {node.note && <span title="Заметка" style={{ display: "inline-flex", color: "#f3a236", flex: "0 0 auto" }}>●</span>}
      {typeof node.progress === "number" && (
        <span style={{ flex: "0 0 34px", height: 5, borderRadius: 999, overflow: "hidden", background: isMain ? "rgba(255,255,255,.3)" : "rgba(120,140,170,.25)" }}>
          <span style={{ display: "block", height: "100%", width: `${node.progress}%`, background: isMain ? "#fff" : color, borderRadius: 999 }} />
        </span>
      )}
      {node.owner && <OwnerAvatar owner={node.owner} size={isMain ? 24 : 22} />}
      {node.hasKids && !isRoot && (
        <button
          onMouseDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); onToggle(node.id); }}
          title={node.collapsed ? "Развернуть" : "Свернуть"}
          style={{ position: "absolute", top: "50%", right: node.side < 0 ? "auto" : -11, left: node.side < 0 ? -11 : "auto", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: "50%", background: "#fff", border: `2px solid ${color}`, color, display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 900, boxShadow: "0 2px 6px rgba(31,45,77,.18)", cursor: "pointer", zIndex: 5, padding: 0 }}
        >
          {node.collapsed ? node.hiddenCount : <MiniIcon name="minus" size={12} />}
        </button>
      )}
    </div>
  );
}

function FloatingNodeToolbar({ position, isRoot, onAddChild, onAddSibling, onRename, onDelete }) {
  if (!position) return null;
  const buttonStyle = { display: "inline-flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 13, fontWeight: 800, padding: "7px 11px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "Inter" };
  return (
    <div
      onMouseDown={event => event.stopPropagation()}
      style={{ position: "absolute", left: position.left, top: position.top, transform: "translate(-50%, -100%)", display: "flex", gap: 4, background: "#1f2d4d", padding: 5, borderRadius: 12, boxShadow: "0 10px 30px rgba(31,45,77,.34)", zIndex: 20 }}
    >
      <button onClick={onAddChild} title="Добавить дочерний узел" style={buttonStyle}><MiniIcon name="nodes" size={15} />Узел</button>
      {!isRoot && <button onClick={onAddSibling} title="Добавить соседний узел" style={buttonStyle}><MiniIcon name="plus" size={15} /></button>}
      <button onClick={onRename} title="Переименовать" style={buttonStyle}><MiniIcon name="edit" size={15} /></button>
      {!isRoot && <button onClick={onDelete} title="Удалить" style={{ ...buttonStyle, color: "#fecaca" }}><MiniIcon name="minus" size={15} /></button>}
      <span style={{ position: "absolute", left: "50%", bottom: -5, width: 10, height: 10, background: "#1f2d4d", borderRadius: 2, transform: "translateX(-50%) rotate(45deg)" }} />
    </div>
  );
}

function MindInspector({ node, depth, onPatch, onClose }) {
  if (!node) return null;
  const hasProgress = typeof node.progress === "number";
  return (
    <div
      onMouseDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
      style={{ position: "absolute", top: 16, right: 16, width: 268, maxHeight: "calc(100% - 32px)", overflowY: "auto", background: "#fff", border: "1px solid #e2edf8", borderRadius: 14, boxShadow: "0 12px 40px rgba(31,45,77,.16)", padding: "16px 18px 20px", zIndex: 16 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 850, color: "#1e3a6e" }}>Свойства узла</span>
        <button onClick={onClose} title="Закрыть" style={{ width: 26, height: 26, borderRadius: 7, border: "none", background: "#f4f8fe", color: "#64748b", cursor: "pointer", display: "grid", placeItems: "center" }}><MiniIcon name="plus" size={15} /></button>
      </div>

      <label style={{ display: "block", fontSize: 11.5, letterSpacing: .4, fontWeight: 800, color: "#94a3b8", margin: "0 0 7px" }}>Название</label>
      <input
        value={node.label || node.text || ""}
        onChange={event => onPatch(node.id, { label: event.target.value, text: event.target.value })}
        style={{ width: "100%", border: "1px solid #dbeafe", borderRadius: 9, padding: "9px 11px", fontFamily: "Inter", fontSize: 14, color: "#1e3a6e", outline: "none" }}
      />

      {depth === 1 && (
        <>
          <label style={{ display: "block", fontSize: 11.5, letterSpacing: .4, fontWeight: 800, color: "#94a3b8", margin: "14px 0 7px" }}>Цвет ветви</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {MINDMAP_BRANCH_COLORS.map(color => (
              <button key={color} onClick={() => onPatch(node.id, { color })} title={color}
                style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #fff", background: color, boxShadow: node.color === color ? "0 0 0 2px #1e3a6e" : "0 0 0 1px #dbeafe", cursor: "pointer" }} />
            ))}
          </div>
        </>
      )}

      <label style={{ display: "block", fontSize: 11.5, letterSpacing: .4, fontWeight: 800, color: "#94a3b8", margin: "14px 0 7px" }}>Иконка</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button onClick={() => onPatch(node.id, { icon: undefined })} style={{ width: 34, height: 32, borderRadius: 8, border: "1px solid #dbeafe", background: !node.icon ? "#eff6ff" : "#fff", color: !node.icon ? "#2563eb" : "#64748b", cursor: "pointer", fontWeight: 850 }}>-</button>
        {MINDMAP_ICON_NAMES.map(icon => (
          <button key={icon} onClick={() => onPatch(node.id, { icon })} title={icon}
            style={{ width: 34, height: 32, borderRadius: 8, border: node.icon === icon ? "1.5px solid #2563eb" : "1px solid #dbeafe", background: node.icon === icon ? "#eff6ff" : "#fff", color: node.icon === icon ? "#2563eb" : "#64748b", cursor: "pointer", display: "grid", placeItems: "center" }}>
            <MiniIcon name={icon} size={16} />
          </button>
        ))}
      </div>

      <label style={{ display: "block", fontSize: 11.5, letterSpacing: .4, fontWeight: 800, color: "#94a3b8", margin: "14px 0 7px" }}>Исполнитель</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => onPatch(node.id, { owner: undefined })} style={{ border: !node.owner ? "1.5px solid #2563eb" : "1px solid #dbeafe", background: !node.owner ? "#eff6ff" : "#fff", color: !node.owner ? "#2563eb" : "#64748b", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 12.5, fontWeight: 800 }}>Нет</button>
        {Object.keys(OWNERS).map(owner => (
          <button key={owner} onClick={() => onPatch(node.id, { owner })} title={OWNERS[owner].name}
            style={{ border: node.owner === owner ? "2px solid #2563eb" : "1px solid transparent", background: "transparent", borderRadius: "50%", padding: 2, cursor: "pointer", lineHeight: 0 }}>
            <OwnerAvatar owner={owner} size={26} />
          </button>
        ))}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 750, color: "#1e3a6e", marginTop: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={hasProgress} onChange={event => onPatch(node.id, { progress: event.target.checked ? (node.progress || 0) : undefined })} style={{ width: 16, height: 16, accentColor: "#2563eb" }} />
        Показывать прогресс
      </label>
      {hasProgress && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <input type="range" min="0" max="100" step="5" value={node.progress} onChange={event => onPatch(node.id, { progress: Number(event.target.value) })} style={{ flex: 1, accentColor: "#2563eb" }} />
          <span style={{ fontSize: 13, fontWeight: 850, color: "#2563eb", minWidth: 36, textAlign: "right" }}>{node.progress}%</span>
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, fontWeight: 750, color: "#1e3a6e", marginTop: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={!!node.note} onChange={event => onPatch(node.id, { note: event.target.checked || undefined })} style={{ width: 16, height: 16, accentColor: "#2563eb" }} />
        Пометка "заметка"
      </label>
    </div>
  );
}

function MindMapCanvasBasic({ tree, selectedId, editingId, onSelect, onAddChild, onAddSibling, onStartEdit, onRename, onPatch, onDelete }) {
  const wrapRef = useRef(null);
  const dragRef = useRef(null);
  const nodeDragRef = useRef(null);
  const movedRef = useRef(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const layout = useMemo(() => buildMindMapLayout(tree, collapsed), [collapsed, tree]);
  const [offsets, setOffsets] = useState({});
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const effectiveLayout = useMemo(() => {
    const byId = {};
    const nodes = layout.nodes.map(node => {
      const offset = offsets[node.id];
      const effectiveNode = offset ? { ...node, x: node.x + offset.dx, y: node.y + offset.dy } : node;
      byId[node.id] = effectiveNode;
      return effectiveNode;
    });
    return { ...layout, nodes, byId };
  }, [layout, offsets]);
  const selectedNode = selectedId ? effectiveLayout.byId[selectedId] : null;
  const toolbarPosition = selectedNode ? {
    left: view.x + selectedNode.x * view.k,
    top: view.y + (selectedNode.y - selectedNode.h / 2) * view.k - 12,
  } : null;

  function fitView() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    if (!width || !height) return;
    const scale = Math.max(0.35, Math.min(1.15, Math.min(width / layout.width, height / layout.height)));
    setView({
      k: scale,
      x: (width - layout.width * scale) / 2,
      y: (height - layout.height * scale) / 2,
    });
  }

  function zoom(delta) {
    setView(current => {
      const wrap = wrapRef.current;
      if (!wrap) return current;
      const centerX = wrap.clientWidth / 2;
      const centerY = wrap.clientHeight / 2;
      const nextK = Math.min(2.2, Math.max(0.3, current.k * (delta > 0 ? 1.2 : 1 / 1.2)));
      return {
        k: nextK,
        x: centerX - (centerX - current.x) * (nextK / current.k),
        y: centerY - (centerY - current.y) * (nextK / current.k),
      };
    });
  }

  function handleMouseDown(event) {
    movedRef.current = false;
    setIsPanning(true);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
  }

  function handleMouseMove(event) {
    if (nodeDragRef.current) {
      const drag = nodeDragRef.current;
      const dx = (event.clientX - drag.startX) / view.k;
      const dy = (event.clientY - drag.startY) / view.k;
      if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 3) movedRef.current = true;
      setOffsets(current => ({ ...current, [drag.id]: { dx: drag.originDx + dx, dy: drag.originDy + dy } }));
      return;
    }
    if (!dragRef.current) return;
    const drag = dragRef.current;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
    setView(current => ({ ...current, x: drag.originX + dx, y: drag.originY + dy }));
  }

  function handleMouseUp(event) {
    if (nodeDragRef.current) {
      nodeDragRef.current = null;
      return;
    }
    if (!movedRef.current && event?.target === event?.currentTarget) onSelect(null);
    dragRef.current = null;
    setIsPanning(false);
  }

  function handleWheel(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    zoom(event.deltaY < 0 ? 1 : -1);
  }

  useEffect(() => {
    const timer = window.setTimeout(fitView, 50);
    window.addEventListener("resize", fitView);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", fitView);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.width, layout.height]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(new Set());
    setOffsets({});
  }, [tree.id]);

  function handleNodeDown(id, event) {
    if (editingId) return;
    onSelect(id);
    movedRef.current = false;
    const offset = offsets[id] || { dx: 0, dy: 0 };
    nodeDragRef.current = { id, startX: event.clientX, startY: event.clientY, originDx: offset.dx, originDy: offset.dy };
  }

  function toggleNode(id) {
    setCollapsed(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div
      ref={wrapRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ position: "relative", background: "radial-gradient(circle at 1px 1px, #dbe6f5 1px, transparent 0) 0 0 / 24px 24px, linear-gradient(180deg,#fbfdff,#f4f8fe)", borderRadius: 16, border: "1px solid #e2edf8", height: "calc(100vh - 340px)", minHeight: 500, boxShadow: "0 1px 4px rgba(37,99,235,.05)", overflow: "hidden", cursor: isPanning ? "grabbing" : "grab" }}
    >
      <div
        style={{
          position: "relative",
          width: layout.width,
          height: layout.height,
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
      >
        <svg width={layout.width} height={layout.height} style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
          {layout.links.map((link, index) => {
            const parent = effectiveLayout.byId[link.from];
            const child = effectiveLayout.byId[link.to];
            if (!parent || !child) return null;
            const strokeWidth = link.depth === 1 ? 4 : link.depth === 2 ? 2.6 : 1.8;
            return <path key={`${link.from}-${link.to}-${index}`} d={connectorPath(parent, child)} stroke={link.color || "#c3cfe2"} strokeWidth={strokeWidth} fill="none" opacity=".85" strokeLinecap="round" />;
          })}
        </svg>
        {effectiveLayout.nodes.map(node => (
          <CanvasNode
            key={node.id}
            node={node}
            selected={selectedId === node.id}
            editing={editingId === node.id}
            onSelect={onSelect}
            onStartEdit={onStartEdit}
            onRename={onRename}
            onToggle={toggleNode}
            onNodeDown={handleNodeDown}
          />
        ))}
      </div>
      <div style={{ position: "absolute", right: 18, bottom: 18, display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2edf8", borderRadius: 999, padding: 6, boxShadow: "0 1px 3px rgba(37,99,235,.08), 0 8px 24px rgba(37,99,235,.12)", zIndex: 10 }}>
        <button onClick={() => zoom(1)} title="Приблизить" style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "transparent", color: "#455270", display: "grid", placeItems: "center", cursor: "pointer" }}><MiniIcon name="zoomIn" size={18} /></button>
        <button onClick={() => zoom(-1)} title="Отдалить" style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "transparent", color: "#455270", display: "grid", placeItems: "center", cursor: "pointer" }}><MiniIcon name="zoomOut" size={18} /></button>
        <button onClick={fitView} title="Центрировать карту" style={{ height: 34, borderRadius: 999, border: "none", background: "#f8fbff", color: "#455270", display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", cursor: "pointer", fontSize: 12, fontWeight: 850, fontFamily: "Inter" }}><MiniIcon name="fit" size={17} />Центр</button>
        {Object.keys(offsets).length > 0 && <button onClick={() => { setOffsets({}); window.setTimeout(fitView, 0); }} title="Сбросить ручную раскладку" style={{ height: 34, borderRadius: 999, border: "none", background: "#f8fbff", color: "#455270", display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", cursor: "pointer", fontSize: 12, fontWeight: 850, fontFamily: "Inter" }}><MiniIcon name="mindmap" size={17} />Сброс</button>}
        <span style={{ fontSize: 13, fontWeight: 800, color: "#455270", padding: "0 8px", minWidth: 48, textAlign: "center" }}>{Math.round(view.k * 100)}%</span>
      </div>
      <div style={{ position: "absolute", left: 18, bottom: 22, background: "rgba(255,255,255,.86)", border: "1px solid #e2edf8", borderRadius: 999, padding: "7px 13px", color: "#64748b", fontSize: 12.5, fontWeight: 650, pointerEvents: "none" }}>
        Тяните фон для перемещения · тяните узел для ручной раскладки · Ctrl/Cmd + колесо для зума
      </div>
      {!editingId && (
        <FloatingNodeToolbar
          position={toolbarPosition}
          isRoot={selectedId === tree.id}
          onAddChild={() => selectedId && onAddChild(selectedId)}
          onAddSibling={() => selectedId && onAddSibling(selectedId)}
          onRename={() => selectedId && onStartEdit(selectedId)}
          onDelete={() => selectedId && onDelete(selectedId)}
        />
      )}
      {selectedId && !editingId && (
        <MindInspector
          node={findNodeWithParent(tree, selectedId)?.node}
          depth={selectedNode?.depth || 0}
          onPatch={onPatch}
          onClose={() => onSelect(null)}
        />
      )}
    </div>
  );
}

function MindMapFormModal({ map, onClose, onSave, onDelete }) {
  const isNew = !map;
  const [form, setForm] = useState(() => ({
    title: map?.title || "",
    desc: map?.desc || "",
    tag: map?.tag || "Идеи",
    tagColor: map?.tagColor || "#3b6fe0",
    status: map?.status || "draft",
  }));
  const title = form.title.trim();

  function patch(field, value) {
    setForm(current => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    if (!title) return;
    onSave({
      ...form,
      title,
      desc: form.desc.trim() || "Без описания",
      tag: form.tag.trim() || "Без тега",
    });
  }

  const labelStyle = { display: "block", fontSize: 11.5, letterSpacing: .4, fontWeight: 850, color: "#94a3b8", margin: "0 0 7px", textTransform: "uppercase" };
  const inputStyle = { width: "100%", border: "1px solid #dbeafe", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter", fontSize: 14, color: "#1e3a6e", outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.28)", display: "grid", placeItems: "center", zIndex: 1000, padding: 20 }}>
      <form onSubmit={submit} onMouseDown={event => event.stopPropagation()} style={{ width: "min(560px, 100%)", background: "#fff", borderRadius: 16, border: "1px solid #e2edf8", boxShadow: "0 24px 80px rgba(15,23,42,.22)", padding: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 18 }}>
          <div>
            <h3 style={{ margin: 0, color: "#1e3a6e", fontSize: 20, fontWeight: 850 }}>{isNew ? "Новая карта" : "Редактирование карты"}</h3>
            <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13 }}>Параметры видны в каталоге и в шапке редактора.</p>
          </div>
          <button type="button" onClick={onClose} title="Закрыть" style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #dbeafe", background: "#f8fbff", color: "#64748b", cursor: "pointer", display: "grid", placeItems: "center", transform: "rotate(45deg)" }}><MiniIcon name="plus" size={17} /></button>
        </div>

        <label style={labelStyle}>Название</label>
        <input value={form.title} onChange={event => patch("title", event.target.value)} autoFocus style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 14 }}>Описание</label>
        <textarea value={form.desc} onChange={event => patch("desc", event.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.45 }} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
          <div>
            <label style={labelStyle}>Тег</label>
            <input value={form.tag} onChange={event => patch("tag", event.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Статус</label>
            <select value={form.status} onChange={event => patch("status", event.target.value)} style={inputStyle}>
              {MAP_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        <label style={{ ...labelStyle, marginTop: 14 }}>Цвет тега</label>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          {MINDMAP_TAG_COLORS.map(color => (
            <button key={color} type="button" onClick={() => patch("tagColor", color)} title={color}
              style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #fff", background: color, boxShadow: form.tagColor === color ? "0 0 0 2px #1e3a6e" : "0 0 0 1px #dbeafe", cursor: "pointer" }} />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 22 }}>
          {!isNew ? (
            <button type="button" onClick={() => onDelete?.(map)} style={{ border: "1.5px solid #fecaca", background: "#fef2f2", color: "#ef4444", borderRadius: 11, padding: "10px 15px", fontSize: 13, fontWeight: 850, cursor: "pointer", fontFamily: "Inter" }}>Удалить карту</button>
          ) : <span />}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ border: "1.5px solid #dbeafe", background: "#fff", color: "#1e3a6e", borderRadius: 11, padding: "10px 15px", fontSize: 13, fontWeight: 850, cursor: "pointer", fontFamily: "Inter" }}>Отмена</button>
            <button type="submit" disabled={!title} style={{ border: "none", background: title ? "linear-gradient(135deg,#2563eb,#3b82f6)" : "#cbd5e1", color: "#fff", borderRadius: 11, padding: "10px 16px", fontSize: 13, fontWeight: 850, cursor: title ? "pointer" : "default", fontFamily: "Inter" }}>Сохранить</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function MindMapDetailShell({ map, onBack, onEditMap, selectedId, onDeleteSelected, onAddRoot, canUndo, canRedo, onUndo, onRedo, children }) {
  const status = MAP_STATUS_META[map.status] || MAP_STATUS_META.draft;
  const owner = ownerMeta(map.owner, map.ownerName);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, padding: "16px 20px", boxShadow: "0 1px 3px rgba(37,99,235,.06), 0 4px 16px rgba(37,99,235,.05)", flexWrap: "wrap" }}>
        <button
          onClick={onBack}
          title="Вернуться к картам"
          style={{ width: 36, height: 36, display: "grid", placeItems: "center", borderRadius: 10, border: "1.5px solid #dbeafe", background: "#f8fbff", color: "#1e3a6e", cursor: "pointer", flex: "0 0 auto" }}
        >
          <MiniIcon name="back" size={18} />
        </button>

        <div style={{ flex: "1 1 360px", minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#94a3b8", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            <button onClick={onBack} style={{ border: "none", background: "transparent", color: "#2563eb", fontSize: 12, fontWeight: 800, cursor: "pointer", padding: 0, fontFamily: "Inter" }}>Mind Map</button>
            <MiniIcon name="chevron" size={12} />
            <span style={{ color: map.tagColor }}>{map.tag}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, color: "#1e3a6e", fontSize: 22, lineHeight: 1.2, fontWeight: 850 }}>{map.title}</h2>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 999, padding: "6px 12px", background: status.bg, color: status.color, fontSize: 12, fontWeight: 800 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: status.color }} />
              {status.label}
            </span>
          </div>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 13.5, lineHeight: 1.45 }}>{map.desc}</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12, flexShrink: 0 }}>
          <button onClick={onEditMap} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 8, border: "1.5px solid #dbeafe",
            background: "#f8fbff", color: "#2563eb", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "Inter",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Редактировать
          </button>
          <div style={{ display: "flex", gap: 24, alignItems: "center", borderLeft: "1px solid #edf3fb", paddingLeft: 22, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: "#94a3b8" }}>Владелец</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: "#1e3a6e", fontWeight: 800 }}><OwnerAvatar owner={map.owner} ownerName={map.ownerName} size={24} />{owner.name}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: "#94a3b8" }}>Узлов</span>
              <span style={{ fontSize: 15, color: "#1e3a6e", fontWeight: 850 }}>{map.nodeCount}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: "#94a3b8" }}>Обновлено</span>
              <span style={{ fontSize: 15, color: "#1e3a6e", fontWeight: 850 }}>{map.updated}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1.5px solid #dbeafe", borderRadius: 12, padding: 4, background: "#fff" }}>
          <button onClick={onUndo} disabled={!canUndo} title="Отменить"
            style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: canUndo ? "#f8fbff" : "transparent", color: canUndo ? "#1e3a6e" : "#cbd5e1", cursor: canUndo ? "pointer" : "default", fontWeight: 900, fontFamily: "Inter" }}>↶</button>
          <button onClick={onRedo} disabled={!canRedo} title="Повторить"
            style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: canRedo ? "#f8fbff" : "transparent", color: canRedo ? "#1e3a6e" : "#cbd5e1", cursor: canRedo ? "pointer" : "default", fontWeight: 900, fontFamily: "Inter" }}>↷</button>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13, fontWeight: 700, flex: "1 1 340px" }}>
          <MiniIcon name="nodes" size={16} />
          Выберите узел, чтобы добавлять дочерние ветки и редактировать структуру
        </div>
        {selectedId && selectedId !== map.root.id && (
          <button onClick={onDeleteSelected}
            style={{ padding: "9px 14px", borderRadius: 10, border: "1.5px solid #fca5a5", background: "#fef2f2", color: "#ef4444", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "Inter" }}>
            Удалить узел
          </button>
        )}
        <button onClick={onAddRoot}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 15px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 2px 8px rgba(37,99,235,.25)" }}>
          <MiniIcon name="plus" size={16} />
          Добавить ветку
        </button>
      </div>

      {children}
    </div>
  );
}

export default function MindMapSection({ api, onError }) {
  const [confirmAction, confirmDialog] = useConfirmDialog();
  const [maps, setMaps] = useState([]);
  const [mapsLoading, setMapsLoading] = useState(true);
  const [openMapId, setOpenMapId] = useState(null);
  const activeMap = useMemo(
    () => maps.find(map => map.id === openMapId) || null,
    [maps, openMapId],
  );
  const [tree, setTree] = useState(INIT_MAP);
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [treeLoadedForMapId, setTreeLoadedForMapId] = useState(null);
  const [mapModal, setMapModal] = useState(null);
  const treeRef = useRef(INIT_MAP);
  const saveTreeRef = useRef(null);

  useEffect(() => {
    saveTreeRef.current = createSerialSaver(async ({ mapId, root }) => {
      try {
        const updated = enrichMindMap(await api.patchMindMap(mapId, { root }));
        setMaps(current => current.map(map => map.id === mapId ? updated : map));
      } catch (error) {
        onError?.(error);
      }
    });
  }, [api, onError]);

  useEffect(() => {
    let cancelled = false;
    async function loadMaps() {
      setMapsLoading(true);
      try {
        const result = await api.listMindMaps();
        if (!cancelled) setMaps(normalizeMindMaps(result));
      } catch (error) {
        if (!cancelled) {
          setMaps([]);
          onError?.(error);
        }
      } finally {
        if (!cancelled) setMapsLoading(false);
      }
    }
    loadMaps();
    return () => { cancelled = true; };
  }, [api, onError]);

  function persistTree(next) {
    if (!openMapId) return;
    const root = mindMapNodeFromWorkingNode(next);
    setMaps(currentMaps => currentMaps.map(map => map.id === openMapId ? enrichMindMap({ ...map, root, updated: "только что" }) : map));
    void saveTreeRef.current?.({ mapId: openMapId, root });
  }

  function commitTree(updater) {
    const current = treeRef.current;
    const next = typeof updater === "function" ? updater(current) : updater;
    if (next === current) return;
    treeRef.current = next;
    setTree(next);
    setHistoryPast(past => [...past.slice(-39), cloneMindMapNode(current)]);
    setHistoryFuture([]);
    persistTree(next);
  }

  useEffect(() => {
    if (!activeMap || treeLoadedForMapId === activeMap.id) return;
    const timer = window.setTimeout(() => {
      const loadedTree = legacyNodeFromMindMapNode(cloneMindMapNode(activeMap.root));
      treeRef.current = loadedTree;
      setTree(loadedTree);
      setHistoryPast([]);
      setHistoryFuture([]);
      setSelectedId(null);
      setEditingId(null);
      setTreeLoadedForMapId(activeMap.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeMap, treeLoadedForMapId]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!openMapId || editingId) return;
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (!selectedId) return;

      if (event.key === "Tab") {
        event.preventDefault();
        handleAdd(selectedId);
      } else if (event.key === "Enter") {
        event.preventDefault();
        handleAddSibling(selectedId);
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        handleDelete(selectedId);
      } else if (event.key === "F2") {
        event.preventDefault();
        setEditingId(selectedId);
      } else if (event.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function handleSelect(id) {
    setSelectedId(id);
  }

  function handleAdd(parentId) {
    const newNode = { id: uid(), text: "Новый узел", label: "Новый узел", children: [] };
    commitTree(t => updateNode(t, parentId, n => ({ ...n, children: [...(n.children || []), newNode] })));
    setSelectedId(newNode.id);
  }

  function handleAddSibling(nodeId) {
    const newNode = { id: uid(), text: "Новый узел", label: "Новый узел", children: [] };
    commitTree(current => insertSiblingNode(current, nodeId, newNode).tree);
    setSelectedId(newNode.id);
  }

  function handleRenameInline(id, text) {
    const label = text.trim() || "Без названия";
    commitTree(t => updateNode(t, id, n => ({ ...n, text: label, label })));
    setEditingId(null);
  }

  function handlePatchNode(id, patch) {
    commitTree(current => updateNode(current, id, node => {
      const next = { ...node };
      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined) delete next[key];
        else next[key] = value;
      });
      return next;
    }));
  }

  async function handleDelete(id) {
    const hit = findNodeWithParent(tree, id);
    if (!hit || !hit.parent) return;
    const childrenCount = countDescendants(hit.node);
    if (childrenCount > 0) {
      const approved = await confirmAction({
        title: "Удалить ветку с дочерними узлами?",
        message: `Будет удален выбранный узел и все дочерние элементы: ${childrenCount}.`,
        itemTitle: hit.node.label || hit.node.text,
        confirmText: "Удалить",
        cancelText: "Отмена",
        tone: "danger",
      });
      if (!approved) return;
    }
    commitTree(t => removeNode(t, id));
    setSelectedId(hit?.parent?.id || null);
    setEditingId(null);
  }

  function handleCreateMap() {
    setMapModal({ mode: "create", map: null });
  }

  function handleEditMap(map = activeMap) {
    setMapModal({ mode: "edit", map });
  }

  async function handleSaveMap(form) {
    if (mapModal?.mode === "create") {
      const newMap = {
        ...createBlankMindMap(maps.length),
        ...form,
      };
      try {
        const created = enrichMindMap(await api.createMindMap({ ...newMap, root: newMap.root }));
        setMaps(current => [...current, created]);
        setOpenMapId(created.id);
        setMapModal(null);
      } catch (error) {
        onError?.(error);
      }
      return;
    }
    const targetId = mapModal?.map?.id;
    if (!targetId) return;
    try {
      const updated = enrichMindMap(await api.patchMindMap(targetId, form));
      setMaps(current => current.map(map => map.id === targetId ? updated : map));
      setMapModal(null);
    } catch (error) {
      onError?.(error);
    }
  }

  async function handleDeleteMap(map) {
    setMapModal(null);
    const approved = await confirmAction({
      title: "Удалить ментальную карту?",
      message: "Карта будет удалена из локального хранилища вместе со всеми узлами.",
      itemTitle: map.title,
      confirmText: "Удалить",
      cancelText: "Отмена",
      tone: "danger",
    });
    if (!approved) return;
    try {
      await api.deleteMindMap(map.id);
      setMaps(current => current.filter(item => item.id !== map.id));
      if (openMapId === map.id) setOpenMapId(null);
    } catch (error) {
      onError?.(error);
    }
  }

  function handleUndo() {
    if (!historyPast.length) return;
    const previous = historyPast[historyPast.length - 1];
    const current = treeRef.current;
    treeRef.current = previous;
    setHistoryPast(historyPast.slice(0, -1));
    setHistoryFuture(future => [cloneMindMapNode(current), ...future.slice(0, 39)]);
    setTree(previous);
    setSelectedId(null);
    setEditingId(null);
    persistTree(previous);
  }

  function handleRedo() {
    if (!historyFuture.length) return;
    const next = historyFuture[0];
    const current = treeRef.current;
    treeRef.current = next;
    setHistoryFuture(historyFuture.slice(1));
    setHistoryPast(past => [...past.slice(-39), cloneMindMapNode(current)]);
    setTree(next);
    setSelectedId(null);
    setEditingId(null);
    persistTree(next);
  }

  if (mapsLoading) {
    return <div style={{ minHeight: 320, display: "grid", placeItems: "center", color: "#64748b", fontSize: 14 }}>Загружаем Mind Map...</div>;
  }

  if (!openMapId || !activeMap) {
    return (
      <>
        <MindMapCatalog
          maps={maps}
          onOpen={setOpenMapId}
          onCreateMap={handleCreateMap}
        />
        {mapModal && <MindMapFormModal map={mapModal.map} onClose={() => setMapModal(null)} onSave={handleSaveMap} onDelete={handleDeleteMap} />}
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <MindMapDetailShell
        map={activeMap}
        onBack={() => setOpenMapId(null)}
        onEditMap={() => handleEditMap(activeMap)}
        selectedId={selectedId}
        onDeleteSelected={() => handleDelete(selectedId)}
        onAddRoot={() => handleAdd(activeMap.root.id)}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
      >
        <MindMapCanvasBasic
          tree={tree}
          selectedId={selectedId}
          editingId={editingId}
          onSelect={handleSelect}
          onAddChild={handleAdd}
          onAddSibling={handleAddSibling}
          onStartEdit={setEditingId}
          onRename={handleRenameInline}
          onPatch={handlePatchNode}
          onDelete={handleDelete}
        />

        <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
          Подсказка: двойной клик или F2 редактирует узел. Tab добавляет дочерний, Enter - соседний, Delete удаляет.
        </div>
      </MindMapDetailShell>
      {mapModal && <MindMapFormModal map={mapModal.map} onClose={() => setMapModal(null)} onSave={handleSaveMap} onDelete={handleDeleteMap} />}
      {confirmDialog}
    </>
  );
}

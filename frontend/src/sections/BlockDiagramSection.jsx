import { useCallback, useEffect, useRef, useState } from 'react';
import { Background, Controls, ConnectionMode, Handle, MiniMap, Position, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useConfirmDialog } from '../components/common/useConfirmDialog.jsx';

// Custom node with a connection handle on every side, so edges can start/end
// from whichever side is closest instead of being locked to top/bottom.
function DiagramNode({ data }) {
  const shape = data?.shape || "rect";
  const color = data?.color || "#3b6fe0";
  return (
    <>
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
      {shape === "diamond" && (
        // The wrapper's own `style` (border/background) is shared with React Flow's
        // positioning transform, so a rotated border can't live there (it would wipe
        // out the node's translate and break dragging). Rotating this inner box 45deg
        // doesn't work either: the node is wide and short, so its diagonal is far
        // longer than its height, producing a thin diagonal bar instead of a diamond.
        // An SVG polygon traces the actual diamond edges regardless of the node's
        // aspect ratio, so it renders correctly no matter how wide the label is.
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <polygon points="50,4 96,50 50,96 4,50" fill="#fff" stroke={color} strokeWidth="3" />
        </svg>
      )}
      <span style={{ position: "relative", zIndex: 1 }}>{data?.label}</span>
    </>
  );
}

// Stable reference: passing a new object on every render would re-trigger
// React Flow's internal setup and risks the same infinite-loop class of bug
// we hit with unstable handler props.
const NODE_TYPES = { default: DiagramNode };

const SAMPLE_DIAGRAMS = [
  {
    id: "diagram-onboarding",
    title: "Онбординг клиента",
    desc: "Базовый процесс от заявки до запуска",
    updated: "сегодня",
    nodes: [
      { id: "start", type: "terminator", position: { x: 80, y: 120 }, data: { label: "Новая заявка", color: "#22b07d" } },
      { id: "qualify", type: "process", position: { x: 320, y: 120 }, data: { label: "Проверить вводные", color: "#3b6fe0" } },
      { id: "decision", type: "decision", position: { x: 580, y: 105 }, data: { label: "Подходит?", color: "#f3a236" } },
      { id: "launch", type: "process", position: { x: 840, y: 70 }, data: { label: "Запустить проект", color: "#6d5bd0" } },
      { id: "reject", type: "document", position: { x: 840, y: 190 }, data: { label: "Отправить отказ", color: "#ec5b6b" } },
    ],
    edges: [
      { id: "e-start-qualify", source: "start", target: "qualify", label: "" },
      { id: "e-qualify-decision", source: "qualify", target: "decision", label: "" },
      { id: "e-decision-launch", source: "decision", target: "launch", label: "да" },
      { id: "e-decision-reject", source: "decision", target: "reject", label: "нет" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
];

const BLOCK_DIAGRAM_STORAGE_KEY = "dashboard.blockDiagrams.v1";

const BLOCK_TYPES = [
  { id: "process", label: "Процесс", color: "#3b6fe0", shape: "rect" },
  { id: "decision", label: "Решение", color: "#f3a236", shape: "diamond" },
  { id: "terminator", label: "Начало / конец", color: "#22b07d", shape: "pill" },
  { id: "document", label: "Документ", color: "#2bb6c4", shape: "document" },
  { id: "note", label: "Комментарий", color: "#8a96ad", shape: "note" },
];

const BLOCK_COLORS = ["#3b6fe0", "#22b07d", "#6d5bd0", "#f3a236", "#2bb6c4", "#ec5b6b", "#8a96ad"];
const EDGE_COLORS = ["#3b6fe0", "#22b07d", "#6d5bd0", "#f3a236", "#2bb6c4", "#ec5b6b", "#8a96ad"];
const EDGE_TYPES = [
  { id: "default", label: "Прямая" },
  { id: "smoothstep", label: "Плавная" },
  { id: "step", label: "Ступенчатая" },
];
const EDGE_WIDTHS = [2, 3, 4];
const BLOCK_DIAGRAM_UI_STORAGE_KEY = "dashboard.blockDiagrams.ui.v1";
const DIAGRAM_TEMPLATES = [
  { id: "blank", label: "Пустая", description: "Чистый холст" },
  { id: "flow", label: "Процесс", description: "Старт → шаг → результат" },
  { id: "decision", label: "Решение", description: "Ветка да / нет" },
];

function createDiagramId() {
  return `diagram-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function nodeStyleFor(data) {
  const color = data?.color || "#3b6fe0";
  const shape = data?.shape || "rect";
  if (shape === "diamond") {
    // Diamond border/background is drawn inside DiagramNode instead (see there for why).
    // boxShadow: none suppresses React Flow's default "selected" outline, which traces
    // this node's rectangular bounding box and looks wrong around a diamond.
    return { border: "none", background: "transparent", boxShadow: "none", color: "#1e3a6e", fontWeight: 700 };
  }
  return {
    border: `2px solid ${color}`,
    borderRadius: shape === "pill" ? 999 : 10,
    background: shape === "note" ? `${color}14` : "#fff",
    boxShadow: "none",
    color: "#1e3a6e",
    fontWeight: 700,
  };
}

function edgeStyleFor(color = "#3b6fe0", width = 2, dashed = false, withArrow = true) {
  return {
    style: { stroke: color, strokeWidth: width, strokeDasharray: dashed ? "7 5" : undefined },
    labelStyle: { fill: "#1e3a6e", fontWeight: 800 },
    labelBgStyle: { fill: "#fff", fillOpacity: 0.9 },
    markerEnd: withArrow ? { type: "arrowclosed", color } : undefined,
  };
}

function normalizeNode(node, index = 0, diagramId = "diagram") {
  const color = node?.data?.color || "#3b6fe0";
  const shape = node?.data?.shape || "rect";
  return {
    ...node,
    id: node?.id || `${diagramId}-node-${index + 1}`,
    type: "default",
    position: node?.position || { x: 120 + index * 24, y: 120 + index * 24 },
    data: {
      label: node?.data?.label || "Блок",
      color,
      shape,
      blockType: node?.data?.blockType || "process",
      ...node?.data,
    },
    style: nodeStyleFor({ ...node?.data, color, shape }),
  };
}

function normalizeDiagram(diagram, index = 0) {
  const id = diagram?.id || `diagram-${index + 1}`;
  const updatedAt = Number.isFinite(diagram?.updatedAt) ? diagram.updatedAt : Date.now();
  const sourceNodes = Array.isArray(diagram?.nodes) ? diagram.nodes : [];
  const nodes = sourceNodes
    .filter(node => node && typeof node === "object")
    .map((node, nodeIndex) => normalizeNode(node, nodeIndex, id));
  const edges = (Array.isArray(diagram?.edges) ? diagram.edges : [])
    .filter(edge => edge && typeof edge === "object")
    .map((edge, edgeIndex) => {
      const color = edge?.data?.color || edge?.style?.stroke || "#3b6fe0";
      const width = edge?.data?.width || edge?.style?.strokeWidth || 2;
      const dashed = edge?.data?.dashed ?? Boolean(edge?.style?.strokeDasharray);
      const withArrow = edge?.data?.withArrow !== false;
      return {
        ...edge,
        id: edge?.id || `${id}-edge-${edgeIndex + 1}`,
        data: { ...(edge.data || {}), color, width, dashed, withArrow },
        ...edgeStyleFor(color, width, dashed, withArrow),
      };
    });
  return {
    ...diagram,
    id,
    title: diagram?.title || `Схема ${index + 1}`,
    desc: diagram?.desc || "Черновик блок-схемы",
    updated: diagram?.updated || "только что",
    updatedAt,
    nodes,
    edges,
    viewport: diagram?.viewport && typeof diagram.viewport === "object"
      ? {
          x: Number.isFinite(diagram.viewport.x) ? diagram.viewport.x : 0,
          y: Number.isFinite(diagram.viewport.y) ? diagram.viewport.y : 0,
          zoom: Number.isFinite(diagram.viewport.zoom) ? diagram.viewport.zoom : 1,
        }
      : { x: 0, y: 0, zoom: 1 },
  };
}

function formatUpdatedLabel(updatedAt) {
  if (!Number.isFinite(updatedAt)) return "только что";
  const diffMinutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60000));
  if (diffMinutes < 1) return "только что";
  if (diffMinutes < 60) return `${diffMinutes} мин назад`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "вчера";
  if (diffDays < 7) return `${diffDays} дн назад`;
  return new Date(updatedAt).toLocaleDateString("ru-RU");
}

function loadStoredDiagrams() {
  try {
    const raw = window.localStorage.getItem(BLOCK_DIAGRAM_STORAGE_KEY);
    if (!raw) return SAMPLE_DIAGRAMS.map((diagram, index) => normalizeDiagram(diagram, index));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SAMPLE_DIAGRAMS.map((diagram, index) => normalizeDiagram(diagram, index));
    const diagrams = parsed.filter(diagram => diagram?.id && diagram?.title && Array.isArray(diagram?.nodes) && Array.isArray(diagram?.edges));
    return diagrams.length
      ? diagrams.map((diagram, index) => normalizeDiagram(diagram, index))
      : SAMPLE_DIAGRAMS.map((diagram, index) => normalizeDiagram(diagram, index));
  } catch {
    return SAMPLE_DIAGRAMS.map((diagram, index) => normalizeDiagram(diagram, index));
  }
}

function createBlankDiagram(index) {
  const id = createDiagramId();
  return normalizeDiagram({
    id,
    title: `Новая схема ${index + 1}`,
    desc: "Черновик блок-схемы",
    updated: "только что",
    nodes: [
      { id: `${id}-start`, type: "terminator", position: { x: 120, y: 120 }, data: { label: "Начало", color: "#22b07d" } },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }, index);
}

function createTemplateDiagram(templateId, index) {
  const id = createDiagramId();
  if (templateId === "flow") {
    return normalizeDiagram({
      id,
      title: `Процесс ${index + 1}`,
      desc: "Шаблон базового процесса",
      updated: "только что",
      nodes: [
        { id: `${id}-start`, position: { x: 80, y: 120 }, data: { label: "Старт", color: "#22b07d", shape: "pill", blockType: "terminator" } },
        { id: `${id}-step`, position: { x: 320, y: 120 }, data: { label: "Основной шаг", color: "#3b6fe0", shape: "rect", blockType: "process" } },
        { id: `${id}-end`, position: { x: 580, y: 120 }, data: { label: "Результат", color: "#6d5bd0", shape: "pill", blockType: "terminator" } },
      ],
      edges: [
        { id: `${id}-edge-1`, source: `${id}-start`, target: `${id}-step`, type: "smoothstep", label: "" },
        { id: `${id}-edge-2`, source: `${id}-step`, target: `${id}-end`, type: "smoothstep", label: "" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    }, index);
  }
  if (templateId === "decision") {
    return normalizeDiagram({
      id,
      title: `Решение ${index + 1}`,
      desc: "Шаблон ветвления по условию",
      updated: "только что",
      nodes: [
        { id: `${id}-start`, position: { x: 80, y: 160 }, data: { label: "Старт", color: "#22b07d", shape: "pill", blockType: "terminator" } },
        { id: `${id}-decision`, position: { x: 320, y: 145 }, data: { label: "Условие?", color: "#f3a236", shape: "diamond", blockType: "decision" } },
        { id: `${id}-yes`, position: { x: 590, y: 70 }, data: { label: "Да", color: "#3b6fe0", shape: "rect", blockType: "process" } },
        { id: `${id}-no`, position: { x: 590, y: 235 }, data: { label: "Нет", color: "#ec5b6b", shape: "rect", blockType: "process" } },
      ],
      edges: [
        { id: `${id}-edge-1`, source: `${id}-start`, target: `${id}-decision`, type: "smoothstep", label: "" },
        { id: `${id}-edge-2`, source: `${id}-decision`, target: `${id}-yes`, type: "smoothstep", label: "да" },
        { id: `${id}-edge-3`, source: `${id}-decision`, target: `${id}-no`, type: "smoothstep", label: "нет" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    }, index);
  }
  return createBlankDiagram(index);
}

function cloneDiagram(diagram) {
  return JSON.parse(JSON.stringify(diagram));
}

function normalizeImportedDiagram(diagram, index = 0) {
  const id = createDiagramId();
  const sourceNodes = Array.isArray(diagram?.nodes) ? diagram.nodes : [];
  const sourceEdges = Array.isArray(diagram?.edges) ? diagram.edges : [];
  const nodeIdMap = new Map();
  const nodes = sourceNodes
    .filter(node => node && typeof node === "object")
    .map((node, nodeIndex) => {
      const nextNodeId = `${id}-node-${nodeIndex + 1}`;
      if (node.id) nodeIdMap.set(node.id, nextNodeId);
      return normalizeNode({
        ...node,
        id: nextNodeId,
        position: node.position || { x: 120 + nodeIndex * 24, y: 120 + nodeIndex * 24 },
      }, nodeIndex, id);
    });
  const edges = sourceEdges
    .filter(edge => edge && typeof edge === "object")
    .map((edge, edgeIndex) => {
      const color = edge?.data?.color || edge?.style?.stroke || "#3b6fe0";
      const width = edge?.data?.width || edge?.style?.strokeWidth || 2;
      const dashed = edge?.data?.dashed ?? Boolean(edge?.style?.strokeDasharray);
      const withArrow = edge?.data?.withArrow !== false;
      return {
        ...edge,
        id: `${id}-edge-${edgeIndex + 1}`,
        source: nodeIdMap.get(edge.source) || edge.source,
        target: nodeIdMap.get(edge.target) || edge.target,
        data: { ...(edge.data || {}), color, width, dashed, withArrow },
        ...edgeStyleFor(color, width, dashed, withArrow),
      };
    })
    .filter(edge => edge.source && edge.target);
  return normalizeDiagram({
    id,
    title: typeof diagram?.title === "string" && diagram.title.trim() ? diagram.title.trim() : `Импортированная схема ${index + 1}`,
    desc: typeof diagram?.desc === "string" && diagram.desc.trim() ? diagram.desc.trim() : "Импортировано из JSON",
    updated: "только что",
    nodes,
    edges,
    viewport: diagram?.viewport && typeof diagram.viewport === "object"
      ? {
          x: Number.isFinite(diagram.viewport.x) ? diagram.viewport.x : 0,
          y: Number.isFinite(diagram.viewport.y) ? diagram.viewport.y : 0,
          zoom: Number.isFinite(diagram.viewport.zoom) ? diagram.viewport.zoom : 1,
        }
      : { x: 0, y: 0, zoom: 1 },
  }, index);
}

function diagramPreviewStats(diagram) {
  const decisionCount = diagram.nodes.filter(node => node.data?.shape === "diamond").length;
  const terminalCount = diagram.nodes.filter(node => node.data?.shape === "pill").length;
  return { decisionCount, terminalCount };
}

function diagramKindLabel(diagram) {
  const { decisionCount, terminalCount } = diagramPreviewStats(diagram);
  if (decisionCount > 0) return "Ветвление";
  if (diagram.nodes.length <= 1 && diagram.edges.length === 0) return "Черновик";
  if (terminalCount >= 2) return "Процесс";
  return "Схема";
}

function loadUiPreferences() {
  try {
    const raw = window.localStorage.getItem(BLOCK_DIAGRAM_UI_STORAGE_KEY);
    if (!raw) return { showGrid: true, snapToGridEnabled: true, showMiniMap: true };
    const parsed = JSON.parse(raw);
    return {
      showGrid: parsed?.showGrid !== false,
      snapToGridEnabled: parsed?.snapToGridEnabled !== false,
      showMiniMap: parsed?.showMiniMap !== false,
    };
  } catch {
    return { showGrid: true, snapToGridEnabled: true, showMiniMap: true };
  }
}

export default function BlockDiagramSection() {
  const initialUiPreferences = loadUiPreferences();
  const [confirmAction, confirmDialog] = useConfirmDialog();
  const [diagrams, setDiagrams] = useState(() => loadStoredDiagrams());
  const [openDiagramId, setOpenDiagramId] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState([]);
  const [flowInstance, setFlowInstance] = useState(null);
  const [historyPast, setHistoryPast] = useState([]);
  const [historyFuture, setHistoryFuture] = useState([]);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState("recent");
  const [transferNotice, setTransferNotice] = useState(null);
  const [showGrid, setShowGrid] = useState(initialUiPreferences.showGrid);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(initialUiPreferences.snapToGridEnabled);
  const [showMiniMap, setShowMiniMap] = useState(initialUiPreferences.showMiniMap);
  const [contextMenu, setContextMenu] = useState(null);
  const importInputRef = useRef(null);
  const activeDiagram = diagrams.find(diagram => diagram.id === openDiagramId);
  const filteredDiagrams = [...diagrams]
    .filter(diagram => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return (
        diagram.title.toLowerCase().includes(query) ||
        diagram.desc.toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      if (sortMode === "title") return left.title.localeCompare(right.title, "ru");
      if (sortMode === "blocks") return right.nodes.length - left.nodes.length;
      return (right.updatedAt || 0) - (left.updatedAt || 0);
    });

  useEffect(() => {
    try {
      window.localStorage.setItem(BLOCK_DIAGRAM_STORAGE_KEY, JSON.stringify(diagrams));
    } catch {
      // Keep in-memory editing if localStorage is unavailable.
    }
  }, [diagrams]);

  useEffect(() => {
    try {
      window.localStorage.setItem(BLOCK_DIAGRAM_UI_STORAGE_KEY, JSON.stringify({
        showGrid,
        snapToGridEnabled,
        showMiniMap,
      }));
    } catch {
      // Keep in-memory preferences if localStorage is unavailable.
    }
  }, [showGrid, snapToGridEnabled, showMiniMap]);

  useEffect(() => {
    if (!openDiagramId || !flowInstance) return;
    const diagram = diagrams.find(item => item.id === openDiagramId);
    const viewport = diagram?.viewport || { x: 0, y: 0, zoom: 1 };
    flowInstance.setViewport(viewport, { duration: 0 });
    // Restore the viewport only when switching diagrams, not on every edit to the open one.
    /* eslint-disable-next-line */
  }, [openDiagramId, flowInstance]);

  useEffect(() => {
    if (!transferNotice) return undefined;
    const timeoutId = window.setTimeout(() => setTransferNotice(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [transferNotice]);

  useEffect(() => {
    if (!contextMenu) return undefined;
    function handleDismissContextMenu() {
      setContextMenu(null);
    }
    window.addEventListener("click", handleDismissContextMenu);
    window.addEventListener("resize", handleDismissContextMenu);
    window.addEventListener("scroll", handleDismissContextMenu, true);
    return () => {
      window.removeEventListener("click", handleDismissContextMenu);
      window.removeEventListener("resize", handleDismissContextMenu);
      window.removeEventListener("scroll", handleDismissContextMenu, true);
    };
  }, [contextMenu]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (!openDiagramId) return;
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      const key = event.key.toLowerCase();
      const isUndo = (event.metaKey || event.ctrlKey) && key === "z" && !event.shiftKey;
      const isRedo = (event.metaKey || event.ctrlKey) && (key === "y" || (key === "z" && event.shiftKey));
      const isDuplicate = (event.metaKey || event.ctrlKey) && key === "d";
      const isFitView = (event.metaKey || event.ctrlKey) && key === "0";
      const isSelectAll = (event.metaKey || event.ctrlKey) && key === "a";
      if (isUndo || isRedo) {
        event.preventDefault();
        if (isUndo) handleUndo();
        else handleRedo();
        return;
      }
      if (isSelectAll) {
        event.preventDefault();
        handleSelectAll();
        return;
      }
      if (isDuplicate && selectedNodeId) {
        event.preventDefault();
        handleDuplicateSelectedNode();
        return;
      }
      if (isDuplicate && selectedNodeIds.length > 1) {
        event.preventDefault();
        handleDuplicateSelection();
        return;
      }
      if (isFitView) {
        event.preventDefault();
        handleFitView();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setSelectedNodeIds([]);
        setSelectedEdgeIds([]);
        setContextMenu(null);
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (!selectedNodeId && !selectedEdgeId && selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;
      event.preventDefault();
      handleDeleteSelection();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function handleCreateDiagram() {
    const diagram = createBlankDiagram(diagrams.length);
    setDiagrams(current => [...current, diagram]);
    setHistoryPast([]);
    setHistoryFuture([]);
    setZoomLevel(Math.round((diagram.viewport?.zoom || 1) * 100));
    setOpenDiagramId(diagram.id);
  }

  function handleCreateTemplate(templateId) {
    const diagram = createTemplateDiagram(templateId, diagrams.length);
    setDiagrams(current => [...current, diagram]);
    setHistoryPast([]);
    setHistoryFuture([]);
    setZoomLevel(Math.round((diagram.viewport?.zoom || 1) * 100));
    setOpenDiagramId(diagram.id);
  }

  function handleOpenDiagram(diagramId) {
    const nextDiagram = diagrams.find(diagram => diagram.id === diagramId);
    setHistoryPast([]);
    setHistoryFuture([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setContextMenu(null);
    setZoomLevel(Math.round((nextDiagram?.viewport?.zoom || 1) * 100));
    setOpenDiagramId(diagramId);
  }

  function handleCloseDiagram() {
    setHistoryPast([]);
    setHistoryFuture([]);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setContextMenu(null);
    setZoomLevel(100);
    setOpenDiagramId(null);
  }

  async function handleDeleteDiagram(diagram) {
    const approved = await confirmAction({
      title: "Удалить блок-схему?",
      message: "Схема будет удалена из локального хранилища вместе со всеми блоками и связями.",
      itemTitle: diagram.title,
      confirmText: "Удалить",
      cancelText: "Отмена",
      tone: "danger",
    });
    if (!approved) return;
    setDiagrams(current => current.filter(item => item.id !== diagram.id));
    if (openDiagramId === diagram.id) handleCloseDiagram();
    setTransferNotice({ tone: "success", text: `Схема «${diagram.title}» удалена` });
  }

  function buildDuplicatedDiagram(diagram) {
    const duplicate = cloneDiagram(normalizeDiagram(diagram));
    const duplicateId = createDiagramId();
    duplicate.id = duplicateId;
    duplicate.title = `${diagram.title} (копия)`;
    duplicate.updated = "только что";
    duplicate.updatedAt = Date.now();
    duplicate.nodes = duplicate.nodes.map(node => ({
      ...node,
      id: `${duplicateId}-${node.id}`,
    }));
    const nodeIdMap = new Map(duplicate.nodes.map((node, index) => [diagram.nodes[index].id, node.id]));
    duplicate.edges = duplicate.edges.map(edge => ({
      ...edge,
      id: `${duplicateId}-${edge.id}`,
      source: nodeIdMap.get(edge.source) || edge.source,
      target: nodeIdMap.get(edge.target) || edge.target,
    }));
    return duplicate;
  }

  function handleDuplicateDiagram(diagram, options = {}) {
    const duplicate = buildDuplicatedDiagram(diagram);
    setDiagrams(current => [duplicate, ...current]);
    setTransferNotice({ tone: "success", text: `Создана копия «${diagram.title}»` });
    if (options.openCopy) {
      setHistoryPast([]);
      setHistoryFuture([]);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
      setZoomLevel(Math.round((duplicate.viewport?.zoom || 1) * 100));
      setOpenDiagramId(duplicate.id);
    }
  }

  function downloadDiagrams(diagramsToExport, filename) {
    const payload = JSON.stringify(diagramsToExport, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = filename;
    window.document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  function handleExportDiagrams() {
    downloadDiagrams(diagrams, "block-diagrams.json");
    setTransferNotice({ tone: "success", text: `Экспортировано схем: ${diagrams.length}` });
  }

  function handleExportDiagram(diagram) {
    const safeTitle = diagram.title.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-+|-+$/g, "") || "diagram";
    downloadDiagrams(diagram, `${safeTitle}.json`);
    setTransferNotice({ tone: "success", text: `Экспортирована схема «${diagram.title}»` });
  }

  function handleExportActiveDiagram() {
    if (!activeDiagram) return;
    handleExportDiagram(activeDiagram);
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const importedSource = Array.isArray(parsed) ? parsed : [parsed];
      const normalized = importedSource
        .map((diagram, index) => normalizeImportedDiagram(diagram, index))
        .filter(diagram => diagram.nodes.length > 0);
      if (!normalized.length) {
        setTransferNotice({ tone: "error", text: "Файл не содержит корректных схем для импорта" });
        return;
      }
      setDiagrams(current => [...normalized, ...current]);
      setSearchQuery("");
      setSortMode("recent");
      setTransferNotice({ tone: "success", text: `Импортировано схем: ${normalized.length}` });
      if (normalized.length === 1) {
        const importedDiagram = normalized[0];
        setHistoryPast([]);
        setHistoryFuture([]);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setSelectedNodeIds([]);
        setSelectedEdgeIds([]);
        setZoomLevel(Math.round((importedDiagram.viewport?.zoom || 1) * 100));
        setOpenDiagramId(importedDiagram.id);
      }
    } catch {
      setTransferNotice({ tone: "error", text: "Не удалось прочитать JSON-файл" });
    } finally {
      event.target.value = "";
    }
  }

  const updateActiveDiagram = useCallback((updater) => {
    if (!activeDiagram) return;
    setDiagrams(current => {
      const currentDiagram = current.find(diagram => diagram.id === activeDiagram.id);
      if (!currentDiagram) return current;
      const nextDiagram = { ...updater(currentDiagram), updated: "только что" };
      nextDiagram.updatedAt = Date.now();
      setHistoryPast(past => [...past.slice(-39), cloneDiagram(currentDiagram)]);
      setHistoryFuture([]);
      return current.map(diagram => diagram.id === activeDiagram.id ? nextDiagram : diagram);
    });
  }, [activeDiagram]);

  function handleUndo() {
    if (!activeDiagram || historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast(past => past.slice(0, -1));
    setHistoryFuture(future => [cloneDiagram(activeDiagram), ...future.slice(0, 39)]);
    setDiagrams(current => current.map(diagram => diagram.id === activeDiagram.id ? previous : diagram));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }

  function handleRedo() {
    if (!activeDiagram || historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture(future => future.slice(1));
    setHistoryPast(past => [...past.slice(-39), cloneDiagram(activeDiagram)]);
    setDiagrams(current => current.map(diagram => diagram.id === activeDiagram.id ? next : diagram));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
  }

  function handleZoomIn() {
    flowInstance?.zoomIn({ duration: 180 });
    window.setTimeout(() => setZoomLevel(Math.round((flowInstance?.getZoom() || 1) * 100)), 200);
  }

  function handleZoomOut() {
    flowInstance?.zoomOut({ duration: 180 });
    window.setTimeout(() => setZoomLevel(Math.round((flowInstance?.getZoom() || 1) * 100)), 200);
  }

  function handleFitView() {
    flowInstance?.fitView({ padding: 0.2, duration: 180 });
    window.setTimeout(() => setZoomLevel(Math.round((flowInstance?.getZoom() || 1) * 100)), 200);
  }

  function handleResetView() {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setContextMenu(null);
    handleFitView();
  }

  const handleViewportChange = useCallback((_event, viewport) => {
    setZoomLevel(Math.round(viewport.zoom * 100));
    if (!activeDiagram) return;
    setDiagrams(current => current.map(diagram => {
      if (diagram.id !== activeDiagram.id) return diagram;
      const v = diagram.viewport;
      if (v && v.x === viewport.x && v.y === viewport.y && v.zoom === viewport.zoom) return diagram;
      return { ...diagram, viewport };
    }));
  }, [activeDiagram]);

  const handleNodesChange = useCallback((changes) => {
    updateActiveDiagram(diagram => ({
      ...diagram,
      nodes: applyNodeChanges(changes, diagram.nodes),
    }));
  }, [updateActiveDiagram]);

  const handleEdgesChange = useCallback((changes) => {
    updateActiveDiagram(diagram => ({
      ...diagram,
      edges: applyEdgeChanges(changes, diagram.edges),
    }));
  }, [updateActiveDiagram]);

  const handleConnect = useCallback((connection) => {
    const edgeColor = "#3b6fe0";
    updateActiveDiagram(diagram => ({
      ...diagram,
      edges: addEdge({
        ...connection,
        id: `edge-${Date.now()}`,
        type: "smoothstep",
        label: "",
        animated: false,
        data: { color: edgeColor, width: 2, dashed: false, withArrow: true },
        ...edgeStyleFor(edgeColor, 2, false, true),
      }, diagram.edges),
    }));
  }, [updateActiveDiagram]);

  function handleAddBlock(type) {
    const nodeId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    updateActiveDiagram(diagram => ({
      ...diagram,
      nodes: [
        ...diagram.nodes,
        {
          id: nodeId,
          type: "default",
          position: { x: 160 + diagram.nodes.length * 28, y: 160 + diagram.nodes.length * 18 },
          data: { label: type.label, color: type.color, blockType: type.id, shape: type.shape },
          style: nodeStyleFor({ color: type.color, shape: type.shape }),
        },
      ],
    }));
    setSelectedNodeId(nodeId);
    setSelectedEdgeId(null);
    setSelectedNodeIds([nodeId]);
    setSelectedEdgeIds([]);
    setContextMenu(null);
  }

  function handleCreateStarterBlock() {
    handleAddBlock(BLOCK_TYPES.find(type => type.id === "terminator") || BLOCK_TYPES[0]);
    window.setTimeout(() => handleFitView(), 80);
  }

  function handlePatchSelectedNode(patch) {
    if (!selectedNodeId) return;
    updateActiveDiagram(diagram => ({
      ...diagram,
      nodes: diagram.nodes.map(node => (
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, ...patch }, style: nodeStyleFor({ ...node.data, ...patch }) }
          : node
      )),
    }));
  }

  function handlePatchActiveDiagram(patch) {
    updateActiveDiagram(diagram => ({ ...diagram, ...patch }));
  }

  function handleDeleteSelectedNode() {
    if (!selectedNodeId) return;
    updateActiveDiagram(diagram => ({
      ...diagram,
      nodes: diagram.nodes.filter(node => node.id !== selectedNodeId),
      edges: diagram.edges.filter(edge => edge.source !== selectedNodeId && edge.target !== selectedNodeId),
    }));
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }

  function handleDuplicateSelectedNode() {
    if (!selectedNodeId) return;
    const duplicateId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    updateActiveDiagram(diagram => {
      const sourceNode = diagram.nodes.find(node => node.id === selectedNodeId);
      if (!sourceNode) return diagram;
      return {
        ...diagram,
        nodes: [
          ...diagram.nodes,
          {
            ...sourceNode,
            id: duplicateId,
            position: { x: sourceNode.position.x + 36, y: sourceNode.position.y + 36 },
            selected: false,
          },
        ],
      };
    });
    setSelectedNodeId(duplicateId);
    setSelectedEdgeId(null);
    setSelectedNodeIds([duplicateId]);
    setSelectedEdgeIds([]);
    setContextMenu(null);
  }

  function handleDuplicateSelection() {
    if (!activeDiagram || selectedNodeIds.length === 0) return;
    const duplicateMap = new Map();
    const selectedNodes = activeDiagram.nodes.filter(node => selectedNodeIds.includes(node.id));
    const selectedNodeIdSet = new Set(selectedNodeIds);
    const duplicatedNodes = selectedNodes.map(node => {
      const duplicateId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      duplicateMap.set(node.id, duplicateId);
      return {
        ...node,
        id: duplicateId,
        position: { x: node.position.x + 40, y: node.position.y + 40 },
        selected: false,
      };
    });
    const duplicatedEdges = activeDiagram.edges
      .filter(edge => selectedNodeIdSet.has(edge.source) && selectedNodeIdSet.has(edge.target))
      .map(edge => ({
        ...edge,
        id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        source: duplicateMap.get(edge.source) || edge.source,
        target: duplicateMap.get(edge.target) || edge.target,
      }));
    updateActiveDiagram(diagram => ({
      ...diagram,
      nodes: [...diagram.nodes, ...duplicatedNodes],
      edges: [...diagram.edges, ...duplicatedEdges],
    }));
    const duplicatedNodeIds = duplicatedNodes.map(node => node.id);
    setSelectedNodeId(duplicatedNodeIds.length === 1 ? duplicatedNodeIds[0] : null);
    setSelectedEdgeId(null);
    setSelectedNodeIds(duplicatedNodeIds);
    setSelectedEdgeIds([]);
    setContextMenu(null);
  }

  function handleSelectAll() {
    if (!activeDiagram) return;
    const nextNodeIds = activeDiagram.nodes.map(node => node.id);
    const nextEdgeIds = activeDiagram.edges.map(edge => edge.id);
    setSelectedNodeIds(nextNodeIds);
    setSelectedEdgeIds(nextEdgeIds);
    setSelectedNodeId(nextNodeIds.length === 1 ? nextNodeIds[0] : null);
    setSelectedEdgeId(nextEdgeIds.length === 1 ? nextEdgeIds[0] : null);
    setContextMenu(null);
  }

  function handleDeleteSelectedEdge() {
    if (!selectedEdgeId) return;
    updateActiveDiagram(diagram => ({
      ...diagram,
      edges: diagram.edges.filter(edge => edge.id !== selectedEdgeId),
    }));
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
  }

  function handleDeleteSelection() {
    if (!activeDiagram) return;
    const nodeIdsToDelete = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    const edgeIdsToDelete = selectedEdgeIds.length ? selectedEdgeIds : selectedEdgeId ? [selectedEdgeId] : [];
    if (!nodeIdsToDelete.length && !edgeIdsToDelete.length) return;
    updateActiveDiagram(diagram => ({
      ...diagram,
      nodes: diagram.nodes.filter(node => !nodeIdsToDelete.includes(node.id)),
      edges: diagram.edges.filter(edge => (
        !edgeIdsToDelete.includes(edge.id) &&
        !nodeIdsToDelete.includes(edge.source) &&
        !nodeIdsToDelete.includes(edge.target)
      )),
    }));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setContextMenu(null);
  }

  const handleSelectionChange = useCallback((selection) => {
    const nextNodeIds = (selection?.nodes || []).map(node => node.id);
    const nextEdgeIds = (selection?.edges || []).map(edge => edge.id);
    setSelectedNodeIds(nextNodeIds);
    setSelectedEdgeIds(nextEdgeIds);
    setSelectedNodeId(nextNodeIds.length === 1 ? nextNodeIds[0] : null);
    setSelectedEdgeId(nextEdgeIds.length === 1 ? nextEdgeIds[0] : null);
    setContextMenu(null);
  }, []);

  const handleQuickEditNode = useCallback((node) => {
    const nextLabel = window.prompt("Текст блока", node.data?.label || "");
    if (nextLabel === null) return;
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
    setContextMenu(null);
    updateActiveDiagram(diagram => ({
      ...diagram,
      nodes: diagram.nodes.map(item => (
        item.id === node.id
          ? { ...item, data: { ...item.data, label: nextLabel }, style: nodeStyleFor({ ...item.data, label: nextLabel }) }
          : item
      )),
    }));
  }, [updateActiveDiagram]);

  const handleQuickEditEdge = useCallback((edge) => {
    const nextLabel = window.prompt("Подпись связи", edge.label || "");
    if (nextLabel === null) return;
    setSelectedEdgeId(edge.id);
    setSelectedEdgeIds([edge.id]);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setContextMenu(null);
    updateActiveDiagram(diagram => ({
      ...diagram,
      edges: diagram.edges.map(item => (
        item.id === edge.id ? { ...item, label: nextLabel } : item
      )),
    }));
  }, [updateActiveDiagram]);

  function handlePatchSelectedEdge(patch) {
    if (!selectedEdgeId) return;
    updateActiveDiagram(diagram => ({
      ...diagram,
      edges: diagram.edges.map(edge => (
        edge.id === selectedEdgeId ? { ...edge, ...patch, data: { ...edge.data, ...patch.data } } : edge
      )),
    }));
  }

  function handlePatchSelectedEdgeColor(color) {
    const selectedEdge = activeDiagram?.edges.find(edge => edge.id === selectedEdgeId);
    const width = selectedEdge?.data?.width || 2;
    const dashed = Boolean(selectedEdge?.data?.dashed);
    const withArrow = selectedEdge?.data?.withArrow !== false;
    handlePatchSelectedEdge({
      data: { color, width, dashed, withArrow },
      ...edgeStyleFor(color, width, dashed, withArrow),
    });
  }

  function handlePatchSelectedEdgeAppearance(patch) {
    const selectedEdge = activeDiagram?.edges.find(edge => edge.id === selectedEdgeId);
    if (!selectedEdge) return;
    const color = patch.color || selectedEdge?.data?.color || selectedEdge?.style?.stroke || "#3b6fe0";
    const width = patch.width || selectedEdge?.data?.width || selectedEdge?.style?.strokeWidth || 2;
    const dashed = patch.dashed ?? Boolean(selectedEdge?.data?.dashed);
    const withArrow = patch.withArrow ?? (selectedEdge?.data?.withArrow !== false);
    handlePatchSelectedEdge({
      data: { color, width, dashed, withArrow },
      ...edgeStyleFor(color, width, dashed, withArrow),
    });
  }

  const openNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setSelectedNodeId(node.id);
    setSelectedNodeIds([node.id]);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
    setContextMenu({ type: "node", id: node.id, x: Math.min(event.clientX, window.innerWidth - 196), y: Math.min(event.clientY, window.innerHeight - 150) });
  }, []);

  const openEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault();
    setSelectedEdgeId(edge.id);
    setSelectedEdgeIds([edge.id]);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setContextMenu({ type: "edge", id: edge.id, x: Math.min(event.clientX, window.innerWidth - 196), y: Math.min(event.clientY, window.innerHeight - 150) });
  }, []);

  async function handleClearActiveDiagram() {
    if (!activeDiagram) return;
    const approved = await confirmAction({
      title: "Очистить схему?",
      message: "Все блоки и связи текущей схемы будут удалены.",
      itemTitle: activeDiagram.title,
      confirmText: "Очистить",
      cancelText: "Отмена",
      tone: "danger",
    });
    if (!approved) return;
    updateActiveDiagram(diagram => ({
      ...diagram,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    }));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setContextMenu(null);
    setTransferNotice({ tone: "success", text: `Схема «${activeDiagram.title}» очищена` });
  }

  const handleNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    setSelectedNodeIds([node.id]);
    setSelectedEdgeIds([]);
  }, []);

  const handleNodeDoubleClick = useCallback((_, node) => {
    handleQuickEditNode(node);
  }, [handleQuickEditNode]);

  const handleEdgeClick = useCallback((_, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
    setSelectedEdgeIds([edge.id]);
    setSelectedNodeIds([]);
  }, []);

  const handleEdgeDoubleClick = useCallback((_, edge) => {
    handleQuickEditEdge(edge);
  }, [handleQuickEditEdge]);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    setContextMenu(null);
  }, []);

  const handleFlowInit = useCallback((instance) => {
    setFlowInstance(instance);
    setZoomLevel(Math.round(instance.getZoom() * 100));
  }, []);

  if (activeDiagram) {
    return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "calc(100vh - 140px)", minHeight: 600 }}>
      {confirmDialog}
      {transferNotice && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            alignSelf: "flex-start",
            borderRadius: 12,
            padding: "10px 14px",
            background: transferNotice.tone === "success" ? "#e6f7f0" : "#fef2f2",
            color: transferNotice.tone === "success" ? "#15803d" : "#dc2626",
            border: transferNotice.tone === "success" ? "1px solid #bbf7d0" : "1px solid #fecaca",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          {transferNotice.text}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, padding: "18px 22px", boxShadow: "0 1px 4px rgba(37,99,235,.05)", flexWrap: "wrap", flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleCloseDiagram}
            title="Вернуться к схемам"
            style={{ width: 38, height: 38, borderRadius: 10, border: "none", background: "#f1f5fb", color: "#475569", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 6 9 12 15 18" /></svg>
          </button>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 800, marginBottom: 5 }}>Блок-схемы</div>
            <input
              value={activeDiagram.title}
              onChange={event => handlePatchActiveDiagram({ title: event.target.value })}
              style={{ width: "100%", maxWidth: 520, border: "none", borderBottom: "1.5px solid transparent", outline: "none", background: "transparent", fontFamily: "Inter", fontSize: 22, fontWeight: 800, color: "#1e3a6e", lineHeight: 1.2, padding: 0 }}
            />
            <input
              value={activeDiagram.desc}
              onChange={event => handlePatchActiveDiagram({ desc: event.target.value })}
              style={{ width: "100%", maxWidth: 620, border: "none", outline: "none", background: "transparent", fontFamily: "Inter", fontSize: 13, color: "#64748b", marginTop: 4, padding: 0 }}
            />
          </div>
          <div style={{ display: "flex", gap: 18, color: "#64748b", fontSize: 13, fontWeight: 700 }}>
            <span>{activeDiagram.nodes.length} блоков</span>
            <span>{activeDiagram.edges.length} связей</span>
            <span>{formatUpdatedLabel(activeDiagram.updatedAt)}</span>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, background: "#e6f7f0", color: "#22b07d", padding: "6px 10px", fontSize: 12, fontWeight: 800 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22b07d" }} />
            Сохранено
          </span>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1.5px solid #dbeafe", borderRadius: 10, padding: 4, background: "#fff" }}>
            <button type="button" onClick={handleUndo} disabled={historyPast.length === 0} title="Отменить" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: historyPast.length ? "#f8fbff" : "transparent", color: historyPast.length ? "#1e3a6e" : "#cbd5e1", cursor: historyPast.length ? "pointer" : "default", fontWeight: 900, fontFamily: "Inter" }}>↶</button>
            <button type="button" onClick={handleRedo} disabled={historyFuture.length === 0} title="Повторить" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: historyFuture.length ? "#f8fbff" : "transparent", color: historyFuture.length ? "#1e3a6e" : "#cbd5e1", cursor: historyFuture.length ? "pointer" : "default", fontWeight: 900, fontFamily: "Inter" }}>↷</button>
          </div>
          <button type="button" onClick={() => handleDuplicateDiagram(activeDiagram, { openCopy: true })} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1.5px solid #dbeafe", borderRadius: 10, background: "#f8fbff", color: "#2563eb", padding: "8px 13px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Сделать копию
          </button>
          <button type="button" onClick={handleExportActiveDiagram} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1.5px solid #dbeafe", borderRadius: 10, background: "#f8fbff", color: "#2563eb", padding: "8px 13px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Экспорт схемы
          </button>
          <button type="button" onClick={() => handleDeleteDiagram(activeDiagram)} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1.5px solid #fecaca", borderRadius: 10, background: "#fef2f2", color: "#ef4444", padding: "8px 13px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Удалить схему
          </button>
          <button type="button" onClick={handleClearActiveDiagram} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1.5px solid #fed7aa", borderRadius: 10, background: "#fff7ed", color: "#ea580c", padding: "8px 13px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Очистить схему
          </button>
          <button type="button" onClick={handleFitView} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1.5px solid #dbeafe", borderRadius: 10, background: "#f8fbff", color: "#2563eb", padding: "8px 13px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" /></svg>
            Центрировать
          </button>
          <button type="button" onClick={handleResetView} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1.5px solid #dbeafe", borderRadius: 10, background: "#f8fbff", color: "#2563eb", padding: "8px 13px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
            Сбросить вид
          </button>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1.5px solid #dbeafe", borderRadius: 10, padding: 4, background: "#fff" }}>
            <button type="button" onClick={handleZoomOut} title="Уменьшить масштаб" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#f8fbff", color: "#2563eb", cursor: "pointer", fontWeight: 900, fontFamily: "Inter", fontSize: 16 }}>-</button>
            <span style={{ minWidth: 44, textAlign: "center", color: "#64748b", fontSize: 12, fontWeight: 800 }}>{zoomLevel}%</span>
            <button type="button" onClick={handleZoomIn} title="Увеличить масштаб" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#f8fbff", color: "#2563eb", cursor: "pointer", fontWeight: 900, fontFamily: "Inter", fontSize: 16 }}>+</button>
          </div>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1.5px solid #dbeafe", borderRadius: 10, background: "#f8fbff", color: "#1e3a6e", fontSize: 12, fontWeight: 800 }}>
            <input type="checkbox" checked={showGrid} onChange={event => setShowGrid(event.target.checked)} />
            Сетка
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1.5px solid #dbeafe", borderRadius: 10, background: "#f8fbff", color: "#1e3a6e", fontSize: 12, fontWeight: 800 }}>
            <input type="checkbox" checked={snapToGridEnabled} onChange={event => setSnapToGridEnabled(event.target.checked)} />
            Привязка
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1.5px solid #dbeafe", borderRadius: 10, background: "#f8fbff", color: "#1e3a6e", fontSize: 12, fontWeight: 800 }}>
            <input type="checkbox" checked={showMiniMap} onChange={event => setShowMiniMap(event.target.checked)} />
            Миникарта
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "190px minmax(0, 1fr) 260px", gap: 14, flex: 1, minHeight: 0 }}>
          <aside style={{ background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, boxShadow: "0 1px 4px rgba(37,99,235,.05)", padding: 14, overflowY: "auto" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", letterSpacing: .4, textTransform: "uppercase", marginBottom: 12 }}>Блоки</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {BLOCK_TYPES.map(type => (
                <button key={type.id} type="button" onClick={() => handleAddBlock(type)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: "1px solid #e2edf8", background: "#f8fbff", color: "#1e3a6e", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 18, height: 18, borderRadius: type.shape === "diamond" ? 4 : type.shape === "pill" ? 999 : 6, transform: type.shape === "diamond" ? "rotate(45deg)" : type.shape === "document" ? "skewX(-10deg)" : "none", background: type.color, flexShrink: 0, opacity: type.shape === "note" ? .7 : 1 }} />
                  <span>{type.label}</span>
                </button>
              ))}
            </div>
          </aside>

          <div style={{ position: "relative", height: "100%", minHeight: 0, background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, boxShadow: "0 1px 4px rgba(37,99,235,.05)", overflow: "hidden" }}>
            <ReactFlow
              nodes={activeDiagram.nodes}
              edges={activeDiagram.edges}
              nodeTypes={NODE_TYPES}
              connectionMode={ConnectionMode.Loose}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              onConnect={handleConnect}
              onNodeClick={handleNodeClick}
              onNodeContextMenu={openNodeContextMenu}
              onNodeDoubleClick={handleNodeDoubleClick}
              onEdgeClick={handleEdgeClick}
              onEdgeContextMenu={openEdgeContextMenu}
              onEdgeDoubleClick={handleEdgeDoubleClick}
              onSelectionChange={handleSelectionChange}
              onPaneClick={handlePaneClick}
              onInit={handleFlowInit}
              onMoveEnd={handleViewportChange}
              snapToGrid={snapToGridEnabled}
              snapGrid={[22, 22]}
              fitView
            >
              {showGrid && <Background color="#dbe6f5" gap={22} />}
              <Controls />
              {showMiniMap && <MiniMap nodeColor={node => node.data?.color || "#3b6fe0"} />}
            </ReactFlow>
            {(selectedNodeIds.length + selectedEdgeIds.length) > 0 && (
              // Floating over the canvas instead of living in the static header above:
              // putting it in the header changed how many lines the toolbar wrapped to,
              // which shifted the whole page every time a selection changed.
              <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #dbeafe", borderRadius: 12, padding: "8px 10px", boxShadow: "0 8px 24px rgba(15,23,42,.14)" }}>
                <span style={{ color: "#2563eb", fontSize: 12, fontWeight: 800, padding: "0 4px" }}>
                  {(selectedNodeIds.length > 1 || selectedEdgeIds.length > 1)
                    ? `выбрано: ${selectedNodeIds.length + selectedEdgeIds.length}`
                    : `выбрано: ${selectedNodeId ? "блок" : "связь"}`}
                </span>
                {(selectedNodeIds.length > 1 || selectedEdgeIds.length > 1) && (
                  <button type="button" onClick={handleDuplicateSelection} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1.5px solid #dbeafe", borderRadius: 10, background: "#f8fbff", color: "#2563eb", padding: "8px 13px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                    Дублировать выделение
                  </button>
                )}
                <button type="button" onClick={handleDeleteSelection} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1.5px solid #fecaca", borderRadius: 10, background: "#fef2f2", color: "#ef4444", padding: "8px 13px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  Удалить выделение
                </button>
              </div>
            )}
            {activeDiagram.nodes.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ width: "min(440px, calc(100% - 48px))", borderRadius: 18, border: "1px solid #dbeafe", background: "rgba(255,255,255,.94)", boxShadow: "0 18px 40px rgba(37,99,235,.10)", padding: "24px 22px", textAlign: "center", pointerEvents: "auto" }}>
                  <div style={{ fontSize: 18, fontWeight: 850, color: "#1e3a6e", marginBottom: 8 }}>Схема пустая</div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: "#64748b", marginBottom: 18 }}>Добавьте стартовый блок, импортируйте JSON или вернитесь в каталог схем.</div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" onClick={handleCreateStarterBlock} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "none", borderRadius: 12, background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", padding: "10px 16px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                      Стартовый блок
                    </button>
                    <button type="button" onClick={() => importInputRef.current?.click()} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1.5px solid #dbeafe", borderRadius: 12, background: "#f8fbff", color: "#2563eb", padding: "10px 16px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                      Импорт JSON
                    </button>
                    <button type="button" onClick={handleCloseDiagram} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1.5px solid #dbeafe", borderRadius: 12, background: "#fff", color: "#1e3a6e", padding: "10px 16px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                      К схемам
                    </button>
                  </div>
                </div>
              </div>
            )}
            {contextMenu && (
              <div
                style={{
                  position: "fixed",
                  top: contextMenu.y,
                  left: contextMenu.x,
                  zIndex: 50,
                  minWidth: 180,
                  background: "#fff",
                  border: "1px solid #dbeafe",
                  borderRadius: 12,
                  boxShadow: "0 12px 28px rgba(15,23,42,.18)",
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {contextMenu.type === "node" ? (
                  <>
                    <button type="button" onClick={() => { const node = activeDiagram.nodes.find(item => item.id === contextMenu.id); if (node) handleQuickEditNode(node); }} style={{ border: "none", background: "#f8fbff", color: "#1e3a6e", borderRadius: 8, padding: "9px 10px", textAlign: "left", fontFamily: "Inter", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Редактировать текст</button>
                    <button type="button" onClick={handleDuplicateSelectedNode} style={{ border: "none", background: "#f8fbff", color: "#1e3a6e", borderRadius: 8, padding: "9px 10px", textAlign: "left", fontFamily: "Inter", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Дублировать блок</button>
                    <button type="button" onClick={handleDeleteSelectedNode} style={{ border: "none", background: "#fef2f2", color: "#ef4444", borderRadius: 8, padding: "9px 10px", textAlign: "left", fontFamily: "Inter", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Удалить блок</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { const edge = activeDiagram.edges.find(item => item.id === contextMenu.id); if (edge) handleQuickEditEdge(edge); }} style={{ border: "none", background: "#f8fbff", color: "#1e3a6e", borderRadius: 8, padding: "9px 10px", textAlign: "left", fontFamily: "Inter", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Редактировать подпись</button>
                    <button type="button" onClick={handleDeleteSelectedEdge} style={{ border: "none", background: "#fef2f2", color: "#ef4444", borderRadius: 8, padding: "9px 10px", textAlign: "left", fontFamily: "Inter", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Удалить связь</button>
                  </>
                )}
              </div>
            )}
          </div>

          <aside style={{ background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, boxShadow: "0 1px 4px rgba(37,99,235,.05)", padding: 16, overflowY: "auto" }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", letterSpacing: .4, textTransform: "uppercase", marginBottom: 12 }}>Свойства</div>
            {selectedNodeIds.length + selectedEdgeIds.length > 1 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.45 }}>
                  Выделено элементов: {selectedNodeIds.length + selectedEdgeIds.length}
                </div>
                <button type="button" onClick={handleDeleteSelection} style={{ border: "1.5px solid #fecaca", background: "#fef2f2", color: "#ef4444", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  Удалить выделение
                </button>
                <button type="button" onClick={handleDuplicateSelection} style={{ border: "1.5px solid #dbeafe", background: "#f8fbff", color: "#2563eb", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  Дублировать блоки
                </button>
              </div>
            ) : selectedNodeId ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Текст блока</label>
                <textarea
                  value={activeDiagram.nodes.find(node => node.id === selectedNodeId)?.data?.label || ""}
                  onChange={event => handlePatchSelectedNode({ label: event.target.value })}
                  rows={4}
                  style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #dbeafe", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter", fontSize: 14, color: "#1e3a6e", outline: "none", resize: "vertical", background: "#f8fbff" }}
                />
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Цвет</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {BLOCK_COLORS.map(color => (
                      <button key={color} type="button" onClick={() => handlePatchSelectedNode({ color })} title={color}
                        style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #fff", background: color, boxShadow: (activeDiagram.nodes.find(node => node.id === selectedNodeId)?.data?.color || "") === color ? "0 0 0 2px #1e3a6e" : "0 0 0 1px #dbeafe", cursor: "pointer" }} />
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Форма</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {BLOCK_TYPES.map(type => (
                      <button key={type.id} type="button" onClick={() => handlePatchSelectedNode({ shape: type.shape, blockType: type.id })}
                        style={{ border: "1px solid #dbeafe", background: "#f8fbff", color: "#1e3a6e", borderRadius: 9, padding: "8px 9px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={handleDuplicateSelectedNode} style={{ border: "1.5px solid #dbeafe", background: "#f8fbff", color: "#2563eb", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  Дублировать блок
                </button>
                <button type="button" onClick={handleDeleteSelectedNode} style={{ border: "1.5px solid #fecaca", background: "#fef2f2", color: "#ef4444", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  Удалить блок
                </button>
              </div>
            ) : selectedEdgeId ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.45 }}>Выбрана связь между блоками.</div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 6 }}>Подпись связи</label>
                  <input
                    value={activeDiagram.edges.find(edge => edge.id === selectedEdgeId)?.label || ""}
                    onChange={event => handlePatchSelectedEdge({ label: event.target.value })}
                    placeholder="например: да / нет"
                    style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #dbeafe", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter", fontSize: 14, color: "#1e3a6e", outline: "none", background: "#f8fbff" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Цвет линии</label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {EDGE_COLORS.map(color => {
                      const selectedEdge = activeDiagram.edges.find(edge => edge.id === selectedEdgeId);
                      const currentColor = selectedEdge?.data?.color || selectedEdge?.style?.stroke || "#3b6fe0";
                      return (
                        <button key={color} type="button" onClick={() => handlePatchSelectedEdgeColor(color)} title={color}
                          style={{ width: 26, height: 26, borderRadius: "50%", border: "2px solid #fff", background: color, boxShadow: currentColor === color ? "0 0 0 2px #1e3a6e" : "0 0 0 1px #dbeafe", cursor: "pointer" }} />
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Толщина</label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {EDGE_WIDTHS.map(width => (
                      <button
                        key={width}
                        type="button"
                        onClick={() => handlePatchSelectedEdgeAppearance({ width })}
                        style={{
                          border: "1px solid #dbeafe",
                          background: (activeDiagram.edges.find(edge => edge.id === selectedEdgeId)?.data?.width || 2) === width ? "#eaf1ff" : "#f8fbff",
                          color: "#1e3a6e",
                          borderRadius: 9,
                          padding: "8px 10px",
                          fontFamily: "Inter",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                        }}
                      >
                        {width}px
                      </button>
                    ))}
                  </div>
                </div>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px solid #dbeafe", background: "#f8fbff", borderRadius: 10, padding: "10px 12px", color: "#1e3a6e", fontSize: 13, fontWeight: 800 }}>
                  Анимация линии
                  <input
                    type="checkbox"
                    checked={Boolean(activeDiagram.edges.find(edge => edge.id === selectedEdgeId)?.animated)}
                    onChange={event => handlePatchSelectedEdge({ animated: event.target.checked })}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px solid #dbeafe", background: "#f8fbff", borderRadius: 10, padding: "10px 12px", color: "#1e3a6e", fontSize: 13, fontWeight: 800 }}>
                  Пунктирная линия
                  <input
                    type="checkbox"
                    checked={Boolean(activeDiagram.edges.find(edge => edge.id === selectedEdgeId)?.data?.dashed)}
                    onChange={event => handlePatchSelectedEdgeAppearance({ dashed: event.target.checked })}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px solid #dbeafe", background: "#f8fbff", borderRadius: 10, padding: "10px 12px", color: "#1e3a6e", fontSize: 13, fontWeight: 800 }}>
                  Стрелка на конце
                  <input
                    type="checkbox"
                    checked={activeDiagram.edges.find(edge => edge.id === selectedEdgeId)?.data?.withArrow !== false}
                    onChange={event => handlePatchSelectedEdgeAppearance({ withArrow: event.target.checked })}
                  />
                </label>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Тип линии</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                    {EDGE_TYPES.map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => handlePatchSelectedEdge({ type: type.id })}
                        style={{
                          border: "1px solid #dbeafe",
                          background: (activeDiagram.edges.find(edge => edge.id === selectedEdgeId)?.type || "smoothstep") === type.id ? "#eaf1ff" : "#f8fbff",
                          color: "#1e3a6e",
                          borderRadius: 9,
                          padding: "8px 10px",
                          fontFamily: "Inter",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={handleDeleteSelectedEdge} style={{ border: "1.5px solid #fecaca", background: "#fef2f2", color: "#ef4444", borderRadius: 10, padding: "10px 12px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  Удалить связь
                </button>
              </div>
            ) : (
              <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.45 }}>Выберите блок или связь на холсте. Двойной клик открывает быстрое редактирование текста.</div>
            )}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {confirmDialog}
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, padding: "22px 24px", boxShadow: "0 1px 4px rgba(37,99,235,.05)", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px", minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1e3a6e", marginBottom: 6 }}>Блок-схемы</div>
          <div style={{ fontSize: 14, color: "#64748b" }}>Редактор блок-схем и процессов.</div>
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 220, maxWidth: 360, position: "relative" }}>
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Поиск схем..."
            style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #dbeafe", borderRadius: 12, background: "#f8fbff", color: "#1e3a6e", padding: searchQuery ? "10px 42px 10px 14px" : "10px 14px", fontFamily: "Inter", fontSize: 14, outline: "none" }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              title="Очистить поиск"
              style={{ position: "absolute", top: "50%", right: 10, transform: "translateY(-50%)", width: 24, height: 24, borderRadius: "50%", border: "none", background: "#eaf1ff", color: "#2563eb", cursor: "pointer", fontFamily: "Inter", fontSize: 14, fontWeight: 800, display: "grid", placeItems: "center" }}
            >
              ×
            </button>
          )}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1.5px solid #dbeafe", borderRadius: 12, background: "#f8fbff" }}>
          <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>Сортировка</span>
          <select
            value={sortMode}
            onChange={event => setSortMode(event.target.value)}
            style={{ border: "none", background: "transparent", color: "#1e3a6e", fontFamily: "Inter", fontSize: 13, fontWeight: 800, outline: "none", cursor: "pointer" }}
          >
            <option value="recent">Сначала новые</option>
            <option value="title">По названию</option>
            <option value="blocks">По числу блоков</option>
          </select>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => importInputRef.current?.click()}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1.5px solid #dbeafe", borderRadius: 12, background: "#f8fbff", color: "#2563eb", padding: "10px 14px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
        >
          Импорт JSON
        </button>
        <button
          type="button"
          onClick={handleExportDiagrams}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1.5px solid #dbeafe", borderRadius: 12, background: "#f8fbff", color: "#2563eb", padding: "10px 14px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
        >
          Экспорт JSON
        </button>
        <button
          type="button"
          onClick={handleCreateDiagram}
          style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "none", borderRadius: 12, background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", padding: "10px 16px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 8px rgba(37,99,235,.25)" }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          Новая схема
        </button>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {DIAGRAM_TEMPLATES.map(template => (
            <button
              key={template.id}
              type="button"
              onClick={() => handleCreateTemplate(template.id)}
              title={template.description}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1.5px solid #dbeafe", borderRadius: 12, background: "#f8fbff", color: "#2563eb", padding: "10px 14px", fontFamily: "Inter", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
            >
              {template.label}
            </button>
          ))}
        </div>
      </div>
      {diagrams.length === 0 ? (
        <div style={{ minHeight: 260, border: "2px dashed #cbdaf0", borderRadius: 16, background: "#f8fbff", color: "#64748b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center", padding: 24 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#eaf1ff", color: "#2563eb", display: "grid", placeItems: "center", fontSize: 26, fontWeight: 800 }}>+</div>
          <div style={{ fontSize: 16, fontWeight: 850, color: "#1e3a6e" }}>Пока нет блок-схем</div>
          <div style={{ fontSize: 13 }}>Создайте первую схему, чтобы описать процесс или архитектуру.</div>
          <div style={{ marginTop: 6, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={handleCreateDiagram} style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 12, padding: "10px 16px", border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "Inter" }}>
              Новая схема
            </button>
            {DIAGRAM_TEMPLATES.filter(template => template.id !== "blank").map(template => (
              <button
                key={template.id}
                type="button"
                onClick={() => handleCreateTemplate(template.id)}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 12, padding: "10px 16px", border: "1.5px solid #dbeafe", background: "#f8fbff", color: "#2563eb", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "Inter" }}
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>
      ) : filteredDiagrams.length === 0 ? (
        <div style={{ minHeight: 220, border: "1px dashed #cbdaf0", borderRadius: 16, background: "#f8fbff", color: "#64748b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1e3a6e" }}>Ничего не найдено</div>
          <div style={{ fontSize: 13 }}>Измени запрос поиска или создай новую схему.</div>
        </div>
      ) : (
        <>
          <div style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>
            Найдено схем: <span style={{ color: "#1e3a6e" }}>{filteredDiagrams.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filteredDiagrams.map(diagram => (
          <div
            key={diagram.id}
            role="button"
            tabIndex={0}
            onClick={() => handleOpenDiagram(diagram.id)}
            onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleOpenDiagram(diagram.id); } }}
            style={{ textAlign: "left", background: "#fff", border: "1px solid #e2edf8", borderRadius: 16, padding: 18, boxShadow: "0 1px 4px rgba(37,99,235,.05)", cursor: "pointer", fontFamily: "Inter" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "6px 10px", borderRadius: 999, background: "#eef4ff", color: "#2563eb", fontSize: 11, fontWeight: 800 }}>
                {diagramKindLabel(diagram)}
              </span>
              <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>{formatUpdatedLabel(diagram.updatedAt)}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e3a6e", marginBottom: 6 }}>{diagram.title}</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>{diagram.desc}</div>
            <div style={{ marginTop: 14, borderRadius: 12, background: "#f8fbff", border: "1px solid #edf3fb", padding: 12, overflow: "hidden" }}>
              <div style={{ position: "relative", height: 76 }}>
                {diagram.nodes.slice(0, 4).map((node, index) => (
                  <div
                    key={node.id}
                    style={{
                      position: "absolute",
                      left: `${12 + index * 22}%`,
                      top: `${14 + (index % 2) * 20}px`,
                      width: node.data?.shape === "pill" ? 72 : node.data?.shape === "diamond" ? 48 : 68,
                      height: 28,
                      borderRadius: node.data?.shape === "pill" ? 999 : node.data?.shape === "diamond" ? 6 : 10,
                      transform: node.data?.shape === "diamond" ? "rotate(45deg)" : "none",
                      background: node.data?.shape === "note" ? `${node.data?.color || "#3b6fe0"}18` : "#fff",
                      border: `2px solid ${node.data?.color || "#3b6fe0"}`,
                    }}
                  />
                ))}
                {diagram.edges.slice(0, 3).map((edge, index) => (
                  <div
                    key={edge.id}
                    style={{
                      position: "absolute",
                      left: `${18 + index * 22}%`,
                      top: `${28 + (index % 2) * 20}px`,
                      width: 56,
                      height: 2,
                      background: edge.data?.color || "#3b6fe0",
                      opacity: .7,
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, paddingTop: 12, borderTop: "1px solid #edf3fb", fontSize: 12, fontWeight: 700, color: "#94a3b8", flexWrap: "wrap" }}>
              <span>{diagram.nodes.length} блоков</span>
              <span>{diagram.edges.length} связей</span>
              <span>{diagramPreviewStats(diagram).decisionCount} решений</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={event => { event.stopPropagation(); handleExportDiagram(diagram); }}
                style={{ border: "1px solid #dbeafe", background: "#fff", color: "#2563eb", borderRadius: 8, padding: "7px 10px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                Экспорт
              </button>
              <button
                type="button"
                onClick={event => { event.stopPropagation(); handleDuplicateDiagram(diagram); }}
                style={{ border: "1px solid #dbeafe", background: "#f8fbff", color: "#2563eb", borderRadius: 8, padding: "7px 10px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                Дублировать
              </button>
              <button
                type="button"
                onClick={event => { event.stopPropagation(); handleDeleteDiagram(diagram); }}
                style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#ef4444", borderRadius: 8, padding: "7px 10px", fontFamily: "Inter", fontSize: 12, fontWeight: 800, cursor: "pointer" }}
              >
                Удалить
              </button>
            </div>
          </div>
          ))}
          </div>
        </>
      )}
    </div>
  );
}

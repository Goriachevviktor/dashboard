import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const timelineSource = await readFile(new URL("./sections/RoadmapsSection.jsx", import.meta.url), "utf8");
const overlaySource = await readFile(new URL("./components/RoadmapDependencyOverlay.jsx", import.meta.url), "utf8");

test("dependency overlay owns SVG path and port presentation", () => {
  for (const marker of [
    "dependencyPathData",
    "<svg",
    "<path",
    'stroke="currentColor"',
    'strokeLinecap="round"',
    'strokeLinejoin="round"',
    'vectorEffect="non-scaling-stroke"',
    'pointerEvents: "none"',
    "RoadmapDependencyPort",
  ]) {
    assert.equal(overlaySource.includes(marker), true, `overlay presentation missing: ${marker}`);
  }
  assert.equal(timelineSource.includes("<RoadmapDependencyOverlay"), true);
  assert.equal(timelineSource.includes("<RoadmapDependencyPort"), true);
  assert.equal(timelineSource.includes("<svg viewBox={`0 0 ${width} ${height}`}"), false);
});

test("timeline routes dependencies from shared rendered bar rectangles", () => {
  for (const marker of [
    "resolveRenderedBarRect",
    "renderedBarRectById",
    "sourceRect",
    "targetRect",
    "obstacleRects",
  ]) {
    assert.equal(timelineSource.includes(marker), true, `rendered rectangle wiring missing: ${marker}`);
  }
});

test("timeline uses the shared source-bridge route serializer", () => {
  const printSource = timelineSource.slice(
    timelineSource.indexOf("function layoutPrintDependencies()"),
    timelineSource.indexOf("window.__timelineReady"),
  );

  assert.equal(overlaySource.includes("dependencyPathData(route)"), true);
  assert.equal(printSource.includes("dependencyPathData(route)"), true);
});

test("browser keeps route geometry stable while hover only remaps presentation", () => {
  const geometryStart = timelineSource.indexOf("const dependencyRouteEdges = useMemo(() => {");
  const presentationStart = timelineSource.indexOf("const dependencyEdges = useMemo(() =>", geometryStart);
  assert.notEqual(geometryStart, -1);
  assert.notEqual(presentationStart, -1);
  const geometryMemo = timelineSource.slice(geometryStart, presentationStart);
  const presentationMemo = timelineSource.slice(presentationStart, timelineSource.indexOf("const sideW", presentationStart));
  assert.equal(geometryMemo.includes("computeDependencyRoute"), true);
  assert.equal(geometryMemo.includes("dependencyVisualState.activeEdgeIds"), false);
  assert.equal(presentationMemo.includes("dependencyPresentation"), true);
  assert.equal(presentationMemo.includes("isDependencyRouteRenderable"), true);
  assert.equal(presentationMemo.includes("computeDependencyRoute"), false);
});

test("browser and print consumers suppress diagnostic blocked routes", () => {
  assert.equal(timelineSource.includes(".filter(edge => isDependencyRouteRenderable(edge.route))"), true);
  const printSource = timelineSource.slice(
    timelineSource.indexOf("function layoutPrintDependencies()"),
    timelineSource.indexOf("window.__timelineReady"),
  );
  assert.equal(printSource.includes("if (!isDependencyRouteRenderable(route)) return;"), true);
});

test("hover highlight does not shift a rendered gantt bar away from its route", () => {
  assert.equal(timelineSource.includes('transform: isHov ? "translateY(-1px)" : "none"'), false);
});

test("active dependency ports use the same pixel anchors as routes", () => {
  assert.equal(overlaySource.includes("RoadmapDependencyPort({ anchorX })"), true);
  assert.equal(overlaySource.includes("left: anchorX - 4"), true);
  assert.equal(timelineSource.includes("anchorX={rect.left}"), true);
  assert.equal(timelineSource.includes("anchorX={outgoingAnchorX}"), true);
  assert.equal(overlaySource.includes("calc(${left + width}% - 8px)"), false);
});

test("roadmap timeline contains no legacy dependency debug presentation", () => {
  for (const marker of [
    "dependencyLines",
    "TIMELINE_DEPENDENCY_LAYER",
    "TIMELINE_CONNECTOR_LAYER",
    "hasIncomingLink",
    "hasOutgoingLink",
    "Debug связей",
    ">Зависимость<",
    'class="dependency-overlay"',
    'class="connector"',
    "computeDependencyLineLayout.toString",
    "dependencyPathData.toString",
  ]) {
    assert.equal(timelineSource.includes(marker), false, `legacy dependency visual remains: ${marker}`);
  }
});

test("timeline print renders quiet dotted dependency paths without ports", () => {
  for (const marker of [
    "print-dependency-overlay",
    "print-dependency-path",
    "stroke-linecap: round",
    "stroke-linejoin: round",
    'pointer-events:none',
    "QUIET_DEPENDENCY_STYLE",
    "computeDependencyRoute",
    "dependencyPathData",
    "data-predecessors",
    "getBoundingClientRect",
  ]) {
    assert.equal(timelineSource.includes(marker), true, `print dependency structure missing: ${marker}`);
  }

  assert.equal(timelineSource.includes('class="connector"'), false);
  assert.equal(timelineSource.includes('class="print-dependency-port"'), false);
  assert.equal(timelineSource.includes("createElementNS(svgNamespace, 'circle')"), false);
});

test("timeline print routes dependencies from one measured rectangle map", () => {
  const printSource = timelineSource.slice(
    timelineSource.indexOf("function layoutPrintDependencies()"),
    timelineSource.indexOf("window.__timelineReady"),
  );
  for (const marker of [
    "renderedBarRectById",
    "sourceRect",
    "targetRect",
    "obstacleRects",
    "dependencyPathData(route)",
  ]) {
    assert.equal(printSource.includes(marker), true, `print rectangle routing missing: ${marker}`);
  }
  assert.equal(timelineSource.includes("${dependencyRoutingRuntimeSource()}"), true);

  assert.equal(printSource.includes("predecessorEndPct:"), false);
  assert.equal(printSource.includes("targetStartPct:"), false);
  assert.equal(printSource.includes("predecessorCenterY:"), false);
  assert.equal(printSource.includes("targetCenterY:"), false);
  assert.equal(printSource.includes("createElementNS(svgNamespace, 'circle')"), false);
});

test("timeline print keeps today and milestones above dependency paths", () => {
  assert.equal(
    timelineSource.includes(`.print-dependency-overlay { position: absolute; top: 0; pointer-events:none; overflow: visible; color: #475569; z-index: \${TIMELINE_BAR_LAYER + 1}; }`),
    true,
  );
  assert.equal(timelineSource.includes(`.today-line { position: absolute; top: 0; bottom: 0; width: 2px; background: #ff3b30; z-index: \${TIMELINE_BAR_LAYER + 2}; }`), true);
  assert.equal(timelineSource.includes(`transform: translateX(-50%); z-index: \${TIMELINE_BAR_LAYER + 2}; display: flex;`), true);
});

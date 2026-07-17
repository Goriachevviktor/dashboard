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

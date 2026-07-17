import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./sections/RoadmapsSection.jsx", import.meta.url), "utf8");

test("roadmap timeline contains no legacy dependency visuals", () => {
  for (const marker of [
    "dependencyLines",
    "TIMELINE_DEPENDENCY_LAYER",
    "TIMELINE_CONNECTOR_LAYER",
    "hasIncomingLink",
    "hasOutgoingLink",
    "Debug связей",
    ">Зависимость<",
  ]) {
    assert.equal(source.includes(marker), false, `legacy dependency visual remains: ${marker}`);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const navigation = await readFile(new URL("./constants.jsx", import.meta.url), "utf8");
const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");

test("development plan is available in navigation and opens its existing section", () => {
  assert.match(navigation, /\{ id: "plan", label: "План развития"/);
  assert.match(app, /plan:\s*\(\{ data, api, onError, currentUser \}\) => <PlanSection/);
});

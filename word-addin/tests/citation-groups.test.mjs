// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright (c) 2026 The Lattice Project Contributors
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import { renderCitationsAndBibliography } from "../web/lib/csl-processor.js";

const root = new URL("../", import.meta.url);
vm.runInThisContext(await readFile(new URL("web/vendor/citeproc/citeproc.js", root), "utf8"));
globalThis.fetch = async (url) => ({ ok: true,
  text: () => readFile(new URL(`web/${url.split("/plugins/word-addin/")[1]}`, root), "utf8")
});
globalThis.DOMParser = class {
  parseFromString(text) { return { body: { textContent: text.replace(/^<body>|<\/body>$/g, "") } }; }
};
const style = await readFile(new URL("tests/fixtures/numeric-ranges.csl", root), "utf8");
const ids = Array.from({ length: 12 }, (_, i) => `p${i + 1}`);
const items = Object.fromEntries(ids.map((id, i) => [id, {
  cslItem: { id, type: "article-journal", title: `Paper ${i + 1}` }
}]));
const initial = ids.map((id) => [id]);
function render(groups, customCSL = style) {
  return renderCitationsAndBibliography({ items, style: { type: "custom", customCSL } }, groups);
}

test("CSL collapses consecutive citations without dropping hidden bibliography members", async () => {
  const rendered = await render([...initial, ["p4", "p2", "p1", "p3", "p6"]]);
  assert.equal(rendered.renderedCitations.at(-1), "[1–4, 6]");
  assert.equal(rendered.renderedCitations.length, 13, "one rendered string per citation group");
  assert.deepEqual(rendered.citationGroups.at(-1), ["p1", "p2", "p3", "p4", "p6"]);
  assert.equal((rendered.bibliographyText.match(/Paper /g) || []).length, 12);
});

test("a CSL without collapse lists every number, and nonconsecutive references never form a range", async () => {
  const explicit = await render([...initial, ["p1", "p2", "p3", "p4"]], style.replace(' collapse="citation-number"', ""));
  assert.equal(explicit.renderedCitations.at(-1), "[1, 2, 3, 4]");
  const gaps = await render([...initial, ["p1", "p3", "p6"]]);
  assert.equal(gaps.renderedCitations.at(-1), "[1, 3, 6]");
});

test("repeated papers in one group are rendered once but remain cited elsewhere", async () => {
  const rendered = await render([["p1", "p1", "p2", "p3"], ["p2"]]);
  assert.deepEqual(rendered.renderedCitations, ["[1–3]", "[2]"]);
  assert.deepEqual(rendered.citationGroups, [["p1", "p2", "p3"], ["p2"]]);
  assert.equal((rendered.bibliographyText.match(/Paper /g) || []).length, 3);
});

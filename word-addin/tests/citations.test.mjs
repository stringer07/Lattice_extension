// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright (c) 2026 The Lattice Project Contributors
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import * as bridge from "../web/lib/word-bridge.js";
import { createEmptyStore, loadStore, saveStore, setStoreStyle, upsertStoreItem } from "../web/lib/document-store.js";
import { renderCitationsAndBibliography } from "../web/lib/csl-processor.js";

const root = new URL("../", import.meta.url);
vm.runInThisContext(await readFile(new URL("web/vendor/citeproc/citeproc.js", root), "utf8"));
globalThis.fetch = async (url) => ({ ok: true,
  text: () => readFile(new URL(`web/${url.split("/plugins/word-addin/")[1]}`, root), "utf8")
});
// These fixtures contain plain text. The browser fixture checks the real DOM.
globalThis.DOMParser = class {
  parseFromString(text, type) {
    if (type === "text/xml") {
      const payload = text.match(/<payload>([\s\S]*)<\/payload>/)?.[1];
      const entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
      return { getElementsByTagName: () => payload ? [{
        textContent: payload.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => entities[entity])
      }] : [] };
    }
    return { body: { textContent: text.replace(/^<body>|<\/body>$/g, "") } };
  }
};

function makeStore(style = { builtinId: "ieee" }) {
  return {
    ...createEmptyStore(), style,
    items: Object.fromEntries(Array.from({ length: 12 }, (_, i) => {
      const id = `p${i + 1}`;
      return [id, { id, citekey: `key${i + 1}`, cslItem: {
        id, type: "article-journal", title: `Paper ${i + 1}`,
        author: [{ family: `Author${String(i + 1).padStart(2, "0")}` }],
        issued: { "date-parts": [[2020]] }, "container-title": "Journal"
      } }];
    }))
  };
}

const prefix = "lattice-citation:v1:";
const groupPrefix = "lattice-citation-group:v1:";
const bibliographyTag = "lattice-bibliography:v1";
const rangeStyle = { type: "custom", customCSL: await readFile(new URL("tests/fixtures/numeric-ranges.csl", root), "utf8") };

function mockWord(parts) {
  const controls = [];
  const xmlParts = [];
  let documentText = "";
  let paragraphsCreated = 0;
  let selectedAfter = false;
  let parent = { isNullObject: true, load() {} };
  const activeControls = () => controls.filter((control) => !control.deleted).sort((a, b) => a.start - b.start || b.end - a.end);
  function replaceText(start, end, value, owner) {
    const delta = value.length - (end - start);
    documentText = documentText.slice(0, start) + value + documentText.slice(end);
    for (const control of activeControls()) {
      if (control === owner) control.end = start + value.length;
      else if (control.start >= end) { control.start += delta; control.end += delta; }
      else if (control.end > start) { control.end += delta; }
    }
  }
  function range(start, end) {
    return {
      text: documentText.slice(start, end), isNullObject: false, load() {}, start, end,
      compareLocationWith(other) {
        return { value: end < other.start ? "Before" : end === other.start ? "AdjacentBefore" : "Contains" };
      },
      expandTo(other) { return range(Math.min(start, other.start), Math.max(end, other.end)); },
      expandToOrNullObject(other) { return this.expandTo(other); },
      insertText(value) { replaceText(start, end, value); return range(start, start + value.length); },
      insertContentControl() { return createControl("", start, end); },
      select() { selectedAfter = true; }
    };
  }
  function createControl(tag, start, end) {
    const control = {
      id: controls.length + 1, tag, start, end, title: "", deleted: false, load() {},
      get text() { return documentText.slice(this.start, this.end); },
      insertText(value) { replaceText(this.start, this.end, value, this); },
      delete(keepContent) {
        this.deleted = true;
        if (!keepContent) replaceText(this.start, this.end, "");
      },
      getRange(location) {
        return location === "End" || location === "After" ? range(this.end, this.end)
          : location === "Start" ? range(this.start, this.start) : range(this.start, this.end);
      }
    };
    controls.push(control);
    return control;
  }
  for (const part of parts) {
    if (typeof part === "string") { documentText += part; continue; }
    const start = documentText.length;
    documentText += part.text ?? "[placeholder]";
    createControl(part.tag || `${prefix}${part.id}`, start, documentText.length);
  }
  const selection = {
    get parentContentControlOrNullObject() { return parent; },
    insertContentControl() {
      assert.equal(parent.isNullObject, true, "must not nest a citation control");
      return createControl("", documentText.length, documentText.length);
    }
  };
  const word = {
    controls, onSave: null,
    get activeControls() { return activeControls(); },
    get text() { return documentText; },
    get created() { return paragraphsCreated; },
    get selectedAfter() { return selectedAfter; },
    setParent(value) { parent = value; parent.isNullObject = false; },
    insertText(position, text) { replaceText(position, position, text); }
  };
  globalThis.Word = {
    InsertLocation: { replace: "Replace", end: "End" },
    RangeLocation: { end: "End", start: "Start", after: "After" },
    ContentControlAppearance: { boundingBox: "BoundingBox" },
    run: async (callback) => callback({
      sync: async () => {},
      document: {
        getSelection: () => selection,
        contentControls: { get items() { return activeControls(); }, load() {} },
        customXmlParts: {
          getByNamespace: () => ({ items: xmlParts.filter((part) => !part.deleted), load() {} }),
          add(xml) {
            word.onSave?.(xml);
            xmlParts.push({ deleted: false, getXml: () => ({ value: xml }), delete() { this.deleted = true; } });
          }
        },
        body: { insertParagraph() {
          paragraphsCreated++;
          return { insertContentControl: () => createControl("", documentText.length, documentText.length) };
        } }
      }
    })
  };
  return word;
}

function groupIds(groups) { return groups.map((group) => group.citationIds); }
async function refresh(store) {
  const groups = await bridge.collectCitationGroups(store);
  const rendered = await renderCitationsAndBibliography(store, groupIds(groups));
  return { store: await bridge.applyRenderedCitations(rendered, groups, store), rendered };
}

test("later numeric groups sort 8,6,4 numerically without reordering separated occurrences", async () => {
  const initial = Array.from({ length: 12 }, (_, i) => [`p${i + 1}`]);
  const rendered = await renderCitationsAndBibliography(makeStore(), [...initial, ["p8", "p6", "p4", "p12"]]);
  assert.deepEqual(rendered.citationGroups.at(-1), ["p4", "p6", "p8", "p12"]);
  assert.equal(rendered.renderedCitations.at(-1), "[4], [6], [8], [12]");
  assert.equal((rendered.bibliographyText.match(/Paper /g) || []).length, 12);
  const repeated = await renderCitationsAndBibliography(makeStore(), rendered.citationGroups);
  assert.deepEqual(repeated, rendered);
});

test("sorting respects an alphabetically ordered numeric bibliography", async () => {
  const csl = await readFile(new URL("web/vendor/csl/ieee.csl", root), "utf8");
  const store = makeStore({ type: "custom", customCSL: csl.replace(
    '<bibliography entry-spacing="0" second-field-align="flush">',
    '<bibliography entry-spacing="0" second-field-align="flush"><sort><key macro="author"/></sort>'
  ) });
  const rendered = await renderCitationsAndBibliography(store, [["p8"], ["p4"], ["p8", "p4"]]);
  assert.deepEqual(rendered.citationGroups, [["p8"], ["p4"], ["p4", "p8"]]);
  assert.deepEqual(rendered.renderedCitations, ["[2]", "[1]", "[1], [2]"]);
});

test("APA uses CSL's group sorting and punctuation, not numeric range formatting", async () => {
  const rendered = await renderCitationsAndBibliography(makeStore({ builtinId: "apa" }), [["p8", "p6", "p4"]]);
  assert.equal(rendered.renderedCitations.length, 1);
  assert.equal(rendered.renderedCitations[0], "(Author04, 2020; Author06, 2020; Author08, 2020)");
});

test("empty document produces no bibliography heading or CSL work", async () => {
  const csl = globalThis.CSL;
  globalThis.CSL = undefined;
  try {
    assert.deepEqual(await renderCitationsAndBibliography(makeStore(), []), {
      citationGroups: [], renderedCitations: [], bibliographyText: ""
    });
  } finally { globalThis.CSL = csl; }
});

test("collect adjacent controls only, never across prose, paragraphs, or unrelated controls", async () => {
  mockWord([
    { id: "p1" }, " text ", { id: "p8" }, ", ", { id: "p6" }, "", { id: "p4" },
    "\r", { id: "p2" }, " ", { tag: "other", text: "" }, " ", { id: "p3" }
  ]);
  assert.deepEqual(groupIds(await bridge.collectCitationGroups(makeStore())), [["p1"], ["p8", "p6", "p4"], ["p2"], ["p3"]]);
});

test("legacy controls become one nonnested group with persisted membership and no leftover separators", async () => {
  const word = mockWord(["Before ", { id: "p1" }, ", ", { id: "p2" }, "; ", { id: "p3" }, " ", { id: "p4" }, " after"]);
  word.onSave = () => assert.equal(word.activeControls.length, 4, "save membership before changing controls");
  const { store } = await refresh(makeStore(rangeStyle));
  assert.equal(word.text, "Before [1–4] after");
  assert.equal(word.activeControls.length, 1);
  const tag = word.activeControls[0].tag;
  assert.ok(tag.startsWith(groupPrefix));
  assert.ok(tag.length <= 64);
  assert.deepEqual(store.citationGroups[tag.slice(groupPrefix.length)], ["p1", "p2", "p3", "p4"]);
  word.onSave = null;
  const loaded = await loadStore();
  assert.deepEqual(loaded.citationGroups, store.citationGroups);
  assert.deepEqual(groupIds(await bridge.collectCitationGroups(loaded)), [["p1", "p2", "p3", "p4"]]);
  const before = { tag, id: word.activeControls[0].id, text: word.text };
  await refresh(loaded);
  assert.deepEqual({ tag: word.activeControls[0].tag, id: word.activeControls[0].id, text: word.text }, before);
});

test("multiple legacy groups migrate without absorbing intervening prose", async () => {
  const word = mockWord(["Before ", { id: "p1" }, ", ", { id: "p2" }, { id: "p3" },
    " middle ", { id: "p4" }, "; ", { id: "p5" }, { id: "p6" }, " after"]);
  const { store, rendered } = await refresh(makeStore(rangeStyle));
  assert.equal(word.text, "Before [1–3] middle [4–6] after");
  assert.equal(word.activeControls.length, 2);
  assert.deepEqual(rendered.renderedCitations, ["[1–3]", "[4–6]"]);
  assert.deepEqual(groupIds(await bridge.collectCitationGroups(store)), [["p1", "p2", "p3"], ["p4", "p5", "p6"]]);
});

test("group processing applies retroactive APA disambiguation updates to earlier occurrences", async () => {
  const store = makeStore({ builtinId: "apa" });
  store.items.p2.cslItem.author = store.items.p1.cslItem.author;
  const rendered = await renderCitationsAndBibliography(store, [["p1"], ["p1", "p2"]]);
  assert.equal(rendered.renderedCitations.length, 2);
  assert.match(rendered.renderedCitations[0], /2020a/);
  assert.match(rendered.renderedCitations[1], /2020b/);
});

test("copied groups and deleted/undone groups retain every hidden reference", async () => {
  const store = makeStore(rangeStyle);
  store.citationGroups.saved = ["p1", "p2", "p3", "p4"];
  const tag = groupPrefix + "saved";
  const word = mockWord([{ tag, text: "[1–4]" }, " prose ", { tag, text: "[1–4]" }]);
  const { rendered } = await refresh(store);
  assert.deepEqual(rendered.renderedCitations, ["[1–4]", "[1–4]"]);
  assert.equal((rendered.bibliographyText.match(/Paper /g) || []).length, 4);
  for (const control of word.activeControls) control.delete(false);
  const empty = await refresh(store);
  assert.equal(empty.rendered.bibliographyText, "");
  assert.deepEqual(empty.store.citationGroups.saved, ["p1", "p2", "p3", "p4"]);
  mockWord([{ tag, text: "[1–4]" }]); // Equivalent restored tag after Undo/reopen.
  assert.equal((await refresh(empty.store)).rendered.renderedCitations[0], "[1–4]");
});

test("new citations appended to an existing group extend it without overwriting its old membership", async () => {
  const store = makeStore(rangeStyle);
  store.citationGroups.saved = ["p1", "p2", "p3"];
  const word = mockWord([{ tag: groupPrefix + "saved", text: "[1–3]" }, ", ", { id: "p4" }]);
  const updated = await refresh(store);
  assert.equal(word.text, "[1–4]");
  assert.equal(word.activeControls.length, 1);
  assert.deepEqual(updated.store.citationGroups.saved, ["p1", "p2", "p3"]);
  assert.deepEqual(updated.store.citationGroups[word.activeControls[0].tag.slice(groupPrefix.length)], ["p1", "p2", "p3", "p4"]);
});

test("missing group metadata fails safely rather than clearing a bibliography or losing members", async () => {
  const word = mockWord([{ tag: groupPrefix + "missing", text: "[1–4]" }, { tag: bibliographyTag, text: "keep bibliography" }]);
  await assert.rejects(bridge.collectCitationGroups(makeStore()), /Missing Lattice citation group data/);
  assert.equal(word.activeControls[1].text, "keep bibliography");
});

test("edits to citation identity or intervening prose during rendering stop all text writes", async () => {
  for (const change of ["identity", "prose"]) {
    const word = mockWord([{ id: "p1" }, ", ", { id: "p2" }]);
    const store = makeStore();
    const groups = await bridge.collectCitationGroups(store);
    const rendered = await renderCitationsAndBibliography(store, groupIds(groups));
    if (change === "identity") word.activeControls[1].tag = prefix + "p3";
    else word.insertText(word.activeControls[0].end, "new prose");
    const before = word.text;
    await assert.rejects(bridge.applyRenderedCitations(rendered, groups, store), /changed/);
    assert.equal(word.text, before);
  }
});

test("nested controls and metadata save failures cannot be overwritten by migration", async () => {
  const word = mockWord([{ id: "p1" }, { id: "p2" }]);
  const store = makeStore();
  const groups = await bridge.collectCitationGroups(store);
  const rendered = await renderCitationsAndBibliography(store, groupIds(groups));
  const getRange = word.controls[0].getRange.bind(word.controls[0]);
  word.controls[0].getRange = (...args) => ({ ...getRange(...args), compareLocationWith: () => ({ value: "Contains" }) });
  await assert.rejects(bridge.applyRenderedCitations(rendered, groups, store), /overlap/);
  assert.equal(word.activeControls.length, 2);
  const failing = mockWord([{ id: "p1" }, { id: "p2" }]);
  const validGroups = await bridge.collectCitationGroups(store);
  failing.onSave = () => { throw new Error("save failed"); };
  await assert.rejects(bridge.applyRenderedCitations(rendered, validGroups, store), /save failed/);
  assert.equal(failing.text, "[placeholder][placeholder]");
  assert.equal(failing.activeControls.length, 2);
});

test("a Word failure while unwrapping cannot strand citation text without stored membership", async () => {
  const word = mockWord([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
  const store = makeStore(rangeStyle);
  const groups = await bridge.collectCitationGroups(store);
  const rendered = await renderCitationsAndBibliography(store, groupIds(groups));
  word.controls[0].delete = () => { throw new Error("Word refused to unwrap a locked control"); };
  await assert.rejects(bridge.applyRenderedCitations(rendered, groups, store), /Word refused/);
  const saved = await loadStore();
  const replacement = word.activeControls.find((control) => control.tag.startsWith(groupPrefix));
  assert.ok(replacement, "group identity must exist before any old wrapper is removed");
  assert.deepEqual(saved.citationGroups[replacement.tag.slice(groupPrefix.length)], ["p1", "p2", "p3"]);
  assert.equal(word.text, "[placeholder][placeholder][placeholder]");
});

test("partial citation deletion prunes only the bibliography, not snapshots or group history", async () => {
  const store = makeStore();
  store.citationGroups.old = ["p1", "p2"];
  const rendered = await renderCitationsAndBibliography(store, [["p4"], ["p8"], ["p4"]]);
  assert.deepEqual(rendered.renderedCitations, ["[1]", "[2]", "[1]"]);
  assert.equal((rendered.bibliographyText.match(/Paper /g) || []).length, 2);
  assert.equal(Object.keys(store.items).length, 12);
  assert.deepEqual(store.citationGroups.old, ["p1", "p2"]);
});

test("bibliography creates, updates, and clears only managed blocks", async () => {
  const existing = mockWord([{ tag: bibliographyTag, text: "old" }, "User references", { tag: "user", text: "keep" }]);
  await bridge.upsertBibliography("new bibliography");
  assert.equal(existing.controls[0].text, "new bibliography");
  assert.equal(existing.created, 0);
  await bridge.upsertBibliography("");
  assert.equal(existing.controls[0].deleted, true);
  assert.equal(existing.controls[1].deleted, false);
  assert.equal(existing.text, "User referenceskeep");
  const empty = mockWord([]);
  await bridge.upsertBibliography("");
  assert.equal(empty.created, 0);
  await bridge.upsertBibliography("new bibliography");
  assert.equal(empty.created, 1);
  assert.equal(empty.controls[0].tag, bibliographyTag);
});

test("inserting inside single or grouped citations leaves a separate control and cursor outside", async () => {
  for (const tag of [prefix + "p1", groupPrefix + "saved"]) {
    const word = mockWord([{ tag }]);
    word.setParent(word.controls[0]);
    await bridge.insertCitationPlaceholder(makeStore().items.p2);
    assert.equal(word.activeControls.length, 2);
    assert.equal(word.controls[0].tag, tag);
    assert.equal(word.controls[1].tag, prefix + "p2");
    assert.equal(word.selectedAfter, true);
  }
});

test("legacy stores normalize group metadata, and style/item saves preserve it", async () => {
  mockWord([]);
  const legacy = makeStore();
  delete legacy.citationGroups;
  const normalized = await saveStore(legacy);
  assert.deepEqual(normalized.citationGroups, {});
  normalized.citationGroups.saved = ["p1", "p2", "p3"];
  await saveStore(setStoreStyle(upsertStoreItem(normalized, makeStore().items.p4), rangeStyle));
  assert.deepEqual((await loadStore()).citationGroups.saved, ["p1", "p2", "p3"]);
});

test("Update button hydrates, groups, reloads, changes style, and clears after deleting all citations", async () => {
  const elements = new Map();
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        addEventListener(event, handler) { this[event] = handler; },
        append() {}, value: "", disabled: false
      });
      return elements.get(id);
    },
    addEventListener(event, handler) { if (event === "DOMContentLoaded") this.ready = handler; },
    createElement() { return {}; }
  };
  globalThis.Office = {
    onReady: async () => ({ host: "Word" }), HostType: { Word: "Word" },
    context: { requirements: { isSetSupported: () => true } }
  };
  const fetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (!url.startsWith("/api/v1")) return fetch(url);
    const id = url.match(/\/papers\/(p\d+)$/)?.[1];
    return { ok: true, json: async () => id ? makeStore().items[id] : { appVersion: "test", papers: [] } };
  };
  try {
    const empty = mockWord([{ tag: bibliographyTag, text: "stale bibliography" }]);
    await import("../web/taskpane/taskpane.js");
    await document.ready();
    await elements.get("update-button").click();
    assert.equal(empty.controls[0].deleted, true);
    assert.doesNotMatch(elements.get("document-status").className, /error/);

    const cited = mockWord([{ id: "p1" }, ", ", { id: "p2" }, { id: "p3" }, { id: "p4" }]);
    await saveStore({ ...createEmptyStore(), style: rangeStyle });
    const updating = elements.get("update-button").click();
    const duplicateUpdate = elements.get("update-button").click();
    assert.equal(elements.get("style-select").disabled, true);
    elements.get("style-select").value = "apa";
    await elements.get("style-select").change(); // Must not overwrite the in-flight group store.
    await Promise.all([updating, duplicateUpdate]);
    assert.equal((await loadStore()).style.type, "custom");
    assert.equal(Object.keys((await loadStore()).citationGroups).length, 1);
    assert.match(elements.get("document-status").textContent, /Citations and bibliography updated/);
    assert.equal(cited.activeControls[0].text, "[1–4]");
    assert.equal(cited.activeControls[1].tag, bibliographyTag);
    assert.equal((cited.activeControls[1].text.match(/Paper /g) || []).length, 4);
    const tag = cited.activeControls[0].tag;
    const partialStore = await loadStore();
    delete partialStore.items.p2;
    delete partialStore.items.p3;
    await saveStore(partialStore);
    await elements.get("update-button").click();
    assert.ok((await loadStore()).items.p2, "hydrate hidden group members as well as visible endpoints");
    assert.ok((await loadStore()).items.p3);
    assert.equal(cited.activeControls[0].tag, tag);
    assert.equal(cited.activeControls[0].text, "[1–4]");

    elements.get("style-select").value = "ieee";
    await elements.get("style-select").change();
    await elements.get("update-button").click();
    assert.equal(cited.activeControls[0].tag, tag);
    assert.equal(cited.activeControls[0].text, "[1], [2], [3], [4]");
    assert.equal((cited.activeControls[1].text.match(/Paper /g) || []).length, 4);
    await elements.get("custom-style-input").change({ target: {
      files: [{ name: "ranges.csl", text: async () => rangeStyle.customCSL }], value: "ranges.csl"
    } });
    await elements.get("update-button").click();
    assert.equal(cited.activeControls[0].tag, tag);
    assert.equal(cited.activeControls[0].text, "[1–4]");
    cited.activeControls[0].delete(false);
    await elements.get("update-button").click();
    assert.equal(cited.activeControls.length, 0);
    assert.match(elements.get("document-status").textContent, /Bibliography cleared/);
    assert.deepEqual((await loadStore()).citationGroups[tag.slice(groupPrefix.length)], ["p1", "p2", "p3", "p4"]);
  } finally { globalThis.fetch = fetch; }
});

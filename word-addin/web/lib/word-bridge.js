// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright (c) 2026 The Lattice Project Contributors
import { saveStore } from "./document-store.js";

const citationPrefix = "lattice-citation:v1:";
const groupPrefix = "lattice-citation-group:v1:";
const bibliographyTag = "lattice-bibliography:v1";

export function hasRequiredWordApi() {
  return Office.context.requirements.isSetSupported("WordApi", "1.4");
}

function isCitationTag(tag) {
  return tag.startsWith(citationPrefix) || tag.startsWith(groupPrefix);
}

function citationIdsForTag(tag, store) {
  if (tag.startsWith(citationPrefix)) {
    const id = tag.slice(citationPrefix.length);
    if (id) return [id];
  } else if (tag.startsWith(groupPrefix)) {
    const ids = store.citationGroups?.[tag.slice(groupPrefix.length)];
    if (Array.isArray(ids) && ids.length && ids.every((id) => typeof id === "string" && id.length)) {
      return ids;
    }
  } else {
    return null;
  }
  throw new Error("Missing Lattice citation group data. Restore the document's citation metadata before updating.");
}

export async function insertCitationPlaceholder(snapshot) {
  return Word.run(async (context) => {
    let selection = context.document.getSelection();
    const parent = selection.parentContentControlOrNullObject;
    parent.load("tag");
    await context.sync();

    if (!parent.isNullObject && (isCitationTag(parent.tag || "") || parent.tag === bibliographyTag)) {
      selection = parent.getRange(Word.RangeLocation.after);
    }
    const contentControl = selection.insertContentControl();
    contentControl.tag = `${citationPrefix}${snapshot.id}`;
    contentControl.title = `Lattice Citation ${snapshot.citekey}`;
    contentControl.appearance = Word.ContentControlAppearance.boundingBox;
    contentControl.insertText(`[${snapshot.citekey}]`, Word.InsertLocation.replace);
    contentControl.getRange(Word.RangeLocation.after).select();
    await context.sync();
  });
}

async function readCitationGroups(context, store) {
  const controls = context.document.contentControls;
  controls.load("items/id,items/tag");
  await context.sync();

  const entries = controls.items.map((control) => ({ control, ids: citationIdsForTag(control.tag || "", store) }));
  const citationEntries = entries.filter((entry) => entry.ids);
  for (const { control } of citationEntries) control.load("text");
  const relations = citationEntries.slice(1).map((entry, index) =>
    citationEntries[index].control.getRange().compareLocationWith(entry.control.getRange())
  );
  const gaps = new Map();
  for (let index = 1; index < entries.length; index++) {
    if (entries[index - 1].ids && entries[index].ids) {
      const gap = entries[index - 1].control.getRange(Word.RangeLocation.end)
        .expandToOrNullObject(entries[index].control.getRange(Word.RangeLocation.start));
      gap.load("text");
      gaps.set(index, gap);
    }
  }
  await context.sync();
  if (relations.some(({ value }) => value !== "Before" && value !== "AdjacentBefore" && value !== "Unrelated")) {
    throw new Error("Lattice citation controls overlap. Separate the nested citations before updating.");
  }

  const groups = [];
  entries.forEach(({ control, ids }, index) => {
    if (!ids) return;
    const gap = gaps.get(index);
    // Never merge across prose, paragraph/table boundaries, or unrelated controls.
    if (groups.length && gap && !gap.isNullObject && /^[ \u00a0\u202f,;，；、]*$/u.test(gap.text)) {
      const group = groups[groups.length - 1];
      group.citationIds.push(...ids);
      group.controls.push(control);
      group.separators.push(gap.text);
    } else {
      groups.push({ citationIds: [...ids], controls: [control], separators: [] });
    }
  });
  return groups;
}

function snapshotGroup(group) {
  return {
    citationIds: group.citationIds,
    controls: group.controls.map(({ id, tag, text }) => ({ id, tag, text })),
    separators: group.separators
  };
}

export async function collectCitationGroups(store) {
  return Word.run(async (context) => (await readCitationGroups(context, store)).map(snapshotGroup));
}

export async function applyRenderedCitations(rendered, originalGroups, store) {
  const nextGroups = { ...store.citationGroups };
  let hasNewGroups = false;
  const tags = originalGroups.map((group, index) => {
    const ids = rendered.citationGroups[index];
    if (ids.length === 1) return `${citationPrefix}${ids[0]}`;
    if (group.controls.length === 1 && group.controls[0].tag.startsWith(groupPrefix)) {
      return group.controls[0].tag;
    }
    // Store membership in Custom XML, not in the bounded Word content-control tag.
    const groupId = crypto.randomUUID();
    nextGroups[groupId] = ids;
    hasNewGroups = true;
    return `${groupPrefix}${groupId}`;
  });

  // Save membership before creating any group control; keep old mappings for Undo.
  if (hasNewGroups) {
    store = await saveStore({ ...store, citationGroups: nextGroups, updatedAt: new Date().toISOString() });
  }

  await Word.run(async (context) => {
    const currentGroups = await readCitationGroups(context, store);
    if (JSON.stringify(currentGroups.map(snapshotGroup)) !== JSON.stringify(originalGroups)) {
      throw new Error("Citations changed during update. Please update again.");
    }

    for (let index = currentGroups.length - 1; index >= 0; index--) {
      const group = currentGroups[index];
      let contentControl = group.controls[0];
      if (group.controls.length > 1) {
        const range = contentControl.getRange().expandTo(group.controls[group.controls.length - 1].getRange());
        contentControl = range.insertContentControl();
        contentControl.appearance = Word.ContentControlAppearance.boundingBox;
      }
      const ids = rendered.citationGroups[index];
      contentControl.tag = tags[index];
      contentControl.title = ids.length > 1 ? "Lattice Citation Group" : `Lattice Citation ${store.items[ids[0]].citekey}`;
      if (group.controls.length > 1) {
        // Establish the new identity before unwrapping, so a failed Word operation
        // cannot leave the old text without its paper associations.
        for (const control of group.controls) control.delete(true);
      }
      contentControl.insertText(rendered.renderedCitations[index], Word.InsertLocation.replace);
    }
    await context.sync();
  });
  return store;
}

export async function upsertBibliography(bibliographyText) {
  return Word.run(async (context) => {
    const controls = context.document.contentControls;
    controls.load("items/tag");
    await context.sync();

    if (!bibliographyText) {
      for (const control of controls.items.filter((control) => control.tag === bibliographyTag)) {
        control.delete(false);
      }
      await context.sync();
      return;
    }

    const bibliographyControl = controls.items.find((control) => control.tag === bibliographyTag);
    if (bibliographyControl) {
      bibliographyControl.insertText(bibliographyText, Word.InsertLocation.replace);
      await context.sync();
      return;
    }

    const paragraph = context.document.body.insertParagraph("", Word.InsertLocation.end);
    const contentControl = paragraph.insertContentControl();
    contentControl.tag = bibliographyTag;
    contentControl.title = "Lattice Bibliography";
    contentControl.appearance = Word.ContentControlAppearance.boundingBox;
    contentControl.insertText(bibliographyText, Word.InsertLocation.replace);
    await context.sync();
  });
}

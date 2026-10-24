// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// Copyright (c) 2026 The Lattice Project Contributors
import { renderCitationsAndBibliography, getBuiltinStyles } from "../lib/csl-processor.js";
import { createEmptyStore, loadStore, saveStore, setStoreStyle, upsertStoreItem } from "../lib/document-store.js";
import { fetchPaperSnapshot, getBridgeStatus, searchLattice } from "../lib/lattice-client.js";
import { applyRenderedCitations, collectCitationGroups, hasRequiredWordApi, insertCitationPlaceholder, upsertBibliography } from "../lib/word-bridge.js";

const RECENT_LIMIT = 3;
const SEARCH_LIMIT = 12;

const state = {
  documentBusy: false,
  searchTimer: null,
  store: createEmptyStore()
};

const elements = {
  bridgeStatus: document.getElementById("bridge-status"),
  connectionDot: document.getElementById("connection-dot"),
  reconnectButton: document.getElementById("reconnect-button"),
  customStyleInput: document.getElementById("custom-style-input"),
  customStyleLabel: document.getElementById("custom-style-label"),
  documentStatus: document.getElementById("document-status"),
  results: document.getElementById("search-results"),
  searchInput: document.getElementById("search-input"),
  styleSelect: document.getElementById("style-select"),
  updateButton: document.getElementById("update-button"),
  creditsToggle: document.getElementById("credits-toggle"),
  creditsClose: document.getElementById("credits-close"),
  creditsPanel: document.getElementById("credits-panel")
};

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  renderStyleOptions();

  const hostInfo = await Office.onReady();
  if (hostInfo.host !== Office.HostType.Word) {
    setConnectionStatus("This add-in only runs inside Microsoft Word.", true);
    disableActions();
    return;
  }

  if (!hasRequiredWordApi()) {
    setConnectionStatus("Word build does not support WordApi 1.4.", true);
    disableActions();
    return;
  }

  try {
    state.store = await loadStore();
    syncStyleSelectionFromStore();
    renderCustomStyleLabel();
  } catch (error) {
    setDocumentStatus(`Failed to load document store: ${formatError(error)}`, true);
  }

  await reconnectBridge();
  await runSearch();
});

function bindEvents() {
  elements.reconnectButton.addEventListener("click", async () => {
    await reconnectBridge();
  });

  elements.searchInput.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      runSearch().catch((error) => {
        setDocumentStatus(`Search failed: ${formatError(error)}`, true);
      });
    }, 300);
  });

  elements.styleSelect.addEventListener("change", async () => withDocumentEdit(async () => {
    try {
      state.store = await loadStore();
      const selectedId = elements.styleSelect.value;
      if (selectedId === "__custom__") {
        const currentStyle = state.store.style ?? {};
        if (!currentStyle.customCSL) {
          syncStyleSelectionFromStore();
          setDocumentStatus("Load a custom CSL file first.", true);
          return;
        }

        const customName = currentStyle.customName || "Custom CSL";
        const nextStore = setStoreStyle(state.store, {
          ...currentStyle,
          type: "custom",
          label: customName
        });
        state.store = await saveStore(nextStore);
        renderCustomStyleLabel();
        setDocumentStatus(`Selected ${customName}.`);
        return;
      }

      const builtin = getBuiltinStyles().find((style) => style.id === selectedId) ?? getBuiltinStyles()[0];
      const currentStyle = state.store.style ?? {};
      const nextStore = setStoreStyle(state.store, {
        type: "builtin",
        builtinId: builtin.id,
        label: builtin.label,
        customName: currentStyle.customName ?? null,
        customCSL: currentStyle.customCSL ?? null
      });
      state.store = await saveStore(nextStore);
      renderCustomStyleLabel();
      setDocumentStatus(`Selected ${builtin.label}.`);
    } catch (error) {
      syncStyleSelectionFromStore();
      renderCustomStyleLabel();
      setDocumentStatus(`Style change failed: ${formatError(error)}`, true);
    }
  }));

  elements.customStyleInput.addEventListener("change", async (event) => withDocumentEdit(async () => {
    try {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      state.store = await loadStore();
      const currentStyle = state.store.style ?? {};
      const cslText = await file.text();
      const nextStore = setStoreStyle(state.store, {
        type: "custom",
        builtinId: currentStyle.builtinId || "ieee",
        label: file.name,
        customName: file.name,
        customCSL: cslText
      });
      state.store = await saveStore(nextStore);
      elements.styleSelect.value = "__custom__";
      renderCustomStyleLabel();
      setDocumentStatus(`Loaded custom CSL: ${file.name}.`);
    } catch (error) {
      syncStyleSelectionFromStore();
      renderCustomStyleLabel();
      setDocumentStatus(`Custom CSL load failed: ${formatError(error)}`, true);
    } finally {
      event.target.value = "";
    }
  }));

  elements.updateButton.addEventListener("click", async () => {
    await updateDocument();
  });

  elements.creditsToggle.addEventListener("click", () => {
    setCreditsPanelOpen(true);
  });

  elements.creditsClose.addEventListener("click", () => {
    setCreditsPanelOpen(false);
  });

  elements.creditsPanel.addEventListener("click", (event) => {
    if (event.target === elements.creditsPanel) {
      setCreditsPanelOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.creditsPanel.hidden) {
      setCreditsPanelOpen(false);
    }
  });
}

function setCreditsPanelOpen(open) {
  elements.creditsPanel.hidden = !open;
  elements.creditsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    elements.creditsClose.focus();
  } else {
    elements.creditsToggle.focus();
  }
}

function renderStyleOptions() {
  elements.styleSelect.innerHTML = "";
  for (const style of getBuiltinStyles()) {
    const option = document.createElement("option");
    option.value = style.id;
    option.textContent = style.label;
    elements.styleSelect.append(option);
  }
  const customOption = document.createElement("option");
  customOption.value = "__custom__";
  customOption.textContent = "Custom CSL";
  elements.styleSelect.append(customOption);
}

function syncStyleSelectionFromStore() {
  if (state.store.style.type === "custom" && state.store.style.customCSL) {
    elements.styleSelect.value = "__custom__";
    return;
  }
  elements.styleSelect.value = state.store.style.builtinId || "ieee";
}

function renderCustomStyleLabel() {
  if (state.store.style.type === "custom" && state.store.style.customName) {
    elements.customStyleLabel.textContent = state.store.style.customName;
    return;
  }
  elements.customStyleLabel.textContent = "";
}

async function reconnectBridge() {
  try {
    const status = await getBridgeStatus();
    setConnectionStatus(`v${status.appVersion}`);
    elements.searchInput.disabled = false;
    elements.updateButton.disabled = false;
  } catch (error) {
    setConnectionStatus(`Offline – ${formatError(error)}`, true);
    elements.searchInput.disabled = true;
    elements.updateButton.disabled = true;
  }
}

async function runSearch() {
  if (elements.searchInput.disabled) {
    renderEmptyState("Start Lattice first, then click to reconnect.");
    return;
  }

  const query = elements.searchInput.value.trim();
  const limit = query ? SEARCH_LIMIT : RECENT_LIMIT;
  const response = await searchLattice(query, limit);
  const papers = Array.isArray(response?.papers) ? response.papers : [];

  if (!papers.length) {
    renderEmptyState(query ? "No matching papers." : "Your library is empty.");
    return;
  }

  elements.results.innerHTML = "";

  if (!query) {
    const label = document.createElement("div");
    label.className = "results-label";
    label.textContent = "Recent";
    elements.results.append(label);
  }

  for (const paper of papers) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "result-item";
    button.innerHTML = `
      <span class="result-title"></span>
      <span class="result-meta"></span>
      <span class="result-citekey"></span>
    `;
    button.querySelector(".result-title").textContent = paper.title;
    button.querySelector(".result-meta").textContent = paper.subtitle || paper.authorsDisplay || "";
    button.querySelector(".result-citekey").textContent = paper.citekey;
    button.addEventListener("click", async () => {
      await insertPaperCitation(paper.id);
    });
    elements.results.append(button);
  }
}

async function withDocumentEdit(action) {
  if (state.documentBusy) return;
  state.documentBusy = true;
  elements.updateButton.disabled = true;
  elements.styleSelect.disabled = true;
  elements.customStyleInput.disabled = true;
  try {
    return await action();
  } finally {
    state.documentBusy = false;
    elements.updateButton.disabled = elements.searchInput.disabled;
    elements.styleSelect.disabled = false;
    elements.customStyleInput.disabled = false;
  }
}

async function insertPaperCitation(paperId) {
  return withDocumentEdit(async () => {
    try {
      setDocumentStatus("Fetching metadata…");
      const snapshot = await fetchPaperSnapshot(paperId);
      state.store = upsertStoreItem(await loadStore(), snapshot);
      await saveStore(state.store);
      await insertCitationPlaceholder(snapshot);
      setDocumentStatus(`Inserted [${snapshot.citekey}].`, false, true);
    } catch (error) {
      setDocumentStatus(`Insert failed: ${formatError(error)}`, true);
    }
  });
}

async function updateDocument() {
  return withDocumentEdit(async () => {
    try {
      setDocumentStatus("Scanning for citations…");
      let store = await loadStore();
      const citationGroups = await collectCitationGroups(store);
      const groupIds = citationGroups.map((group) => group.citationIds);
      const citationIds = groupIds.flat();

      const missingIds = [...new Set(citationIds.filter((id) => !store.items[id]))];
      if (missingIds.length) {
        setDocumentStatus("Hydrating missing metadata…");
        for (const id of missingIds) {
          const snapshot = await fetchPaperSnapshot(id);
          store = upsertStoreItem(store, snapshot);
        }
        store = await saveStore(store);
      }

      const rendered = await renderCitationsAndBibliography(store, groupIds);
      store = await applyRenderedCitations(rendered, citationGroups, store);
      await upsertBibliography(rendered.bibliographyText);
      state.store = store;
      setDocumentStatus(citationIds.length
        ? "Citations and bibliography updated."
        : "No Lattice citations remain. Bibliography cleared.", false, true);
    } catch (error) {
      setDocumentStatus(`Update failed: ${formatError(error)}`, true);
    }
  });
}

function renderEmptyState(message) {
  elements.results.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  elements.results.append(empty);
}

function setConnectionStatus(message, isError = false) {
  elements.bridgeStatus.textContent = message;
  elements.connectionDot.className = isError ? "connection-dot error" : "connection-dot online";
}

function setDocumentStatus(message, isError = false, isSuccess = false) {
  elements.documentStatus.textContent = message;
  elements.documentStatus.className = isError
    ? "status-message error"
    : isSuccess
      ? "status-message success"
      : "status-message";
}

function disableActions() {
  elements.searchInput.disabled = true;
  elements.updateButton.disabled = true;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

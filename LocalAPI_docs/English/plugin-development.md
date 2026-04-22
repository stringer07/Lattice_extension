# Building Plugins on Top of the Local API

Language versions:
[简体中文](../Chinese/插件开发指南.md)

Related documents:
[Overview](./README.md) · [Quick Start](./quickstart.md) · [API Reference](./api-reference.md)

## Target use cases

The Local API is not only for scripts. It also works well for locally hosted plugin front ends such as:

- document editor add-ins
- Obsidian companion panels
- local web dashboards
- automation configuration pages
- any plugin UI that needs local access to Lattice paper data

## What plugin hosting means

In addition to `/api/v1/...`, Lattice also exposes:

```text
/plugins/{name}/...
```

That means you can deploy a plugin as a static website into Lattice's plugin directory, and Lattice will serve it over the same local HTTP service.

Examples:

```text
http://127.0.0.1:29467/plugins/my-plugin/index.html
http://127.0.0.1:29467/plugins/my-plugin/app.js
http://127.0.0.1:29467/plugins/my-plugin/assets/icon.png
```

## Why this model is recommended

The advantages are straightforward:

- your plugin page and `/api/v1` stay on the same origin
- you do not need to run a separate local web server
- you avoid extra cross-origin complexity
- packaging and distribution stay simple
- it is easy to turn into a "user installs it and it works" desktop plugin

## Where plugin files live

For the sandboxed Lattice app, plugins are placed under the app container's Application Support directory. A typical path looks like:

```text
~/Library/Containers/com.aurelian.Lattice/Data/Library/Application Support/Plugins/<plugin-name>/
```

After deployment, the corresponding public URL becomes:

```text
http://127.0.0.1:<port>/plugins/<plugin-name>/...
```

## Recommended plugin directory layout

Lattice does not require a specific framework. You only need static assets.

A minimal plugin can look like this:

```text
my-plugin/
  index.html
  app.js
  styles.css
  assets/
    icon.png
```

If your source repository also contains build scripts, templates, or source code, the installation step should copy only the final static output into the plugin directory.

## Common static asset types supported

The Local API already serves the asset types most plugins need, including:

- `.html`
- `.js`
- `.css`
- `.json`
- `.png`
- `.svg`
- `.xml`
- `.csl`

That means a plugin with UI, styles, icons, and CSL templates can be hosted directly.

## Minimal client pattern

If the plugin page itself is loaded from `/plugins/{name}/...`, the recommended pattern is to always call the API with relative paths:

```js
async function requestJson(path, init = {}) {
  const headers = {
    Accept: "application/json",
    ...(init.headers ?? {})
  };

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    method: init.method ?? "GET",
    headers
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export async function getBridgeStatus() {
  return requestJson("/status");
}

export async function searchLattice(query, limit = 10) {
  return requestJson(`/search?q=${encodeURIComponent(query ?? "")}&limit=${encodeURIComponent(String(limit))}`);
}

export async function fetchPaperSnapshot(id) {
  return requestJson(`/papers/${encodeURIComponent(id)}`);
}

export async function getCollections() {
  return requestJson("/collections");
}

export async function getTags() {
  return requestJson("/tags");
}

export async function lookupMetadata(params) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      query.set(key, value);
    }
  }
  return requestJson(`/metadata?${query.toString()}`);
}

export async function createPaper(body) {
  return requestJson("/papers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

export async function uploadPaperPdf(id, pdfBytes, { force = false } = {}) {
  const suffix = force ? "?force=true" : "";
  const response = await fetch(`/api/v1/papers/${encodeURIComponent(id)}/pdf${suffix}`, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: pdfBytes
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || payload?.reason || `${response.status} ${response.statusText}`);
  }

  return await response.json();
}
```

This is also the recommended default integration pattern.

## Handle capability-gated write access

Do not assume write routes are always available.

Recommended pattern:

1. call `/api/v1/status`
2. inspect `capabilities`
3. only show create UI or send create requests if `create-paper` is present
4. only show raw PDF upload UI if `pdf-upload` is present
5. if you depend on duplicate strategy support and rich success payloads, check for `create-paper-v2`

Example:

```js
export async function getCapabilities() {
  const status = await getBridgeStatus();
  return new Set(status.capabilities ?? []);
}

export async function canCreatePapers() {
  return (await getCapabilities()).has("create-paper");
}

export async function canUploadPdfBytes() {
  return (await getCapabilities()).has("pdf-upload");
}
```

## Build pickers and prefill flows from server data

For write-oriented plugins, the public Local API already exposes the primitives you usually need:

- call `/api/v1/collections` to populate collection pickers
- call `/api/v1/tags` to populate tag pickers or autosuggest
- call `/api/v1/metadata` with `doi`, `arxivId`, `isbn`, or `title` to prefill a create or replace form before writing

## Recommended development workflow

### 1. Verify the API first

Start with `curl` or a browser check:

```bash
curl http://127.0.0.1:29467/api/v1/status
```

### 2. Build your front end locally

Use any stack you want:

- plain HTML/CSS/JS
- built static output from React / Vue / Svelte
- Office Add-in front ends
- any other setup that produces static files

### 3. Copy the built output into the plugin directory

Deploy the final output to:

```text
.../Application Support/Plugins/<plugin-name>/
```

### 4. Open it through the plugin URL

```text
http://127.0.0.1:29467/plugins/<plugin-name>/index.html
```

### 5. If the host application needs registration, generate its manifest or loader

Examples:

- some hosts require a manifest or registration file
- some desktop tools may require a custom protocol or WebView entrypoint

## Recommended architecture for local external extensions

A robust pattern looks like this:

1. the UI page is hosted by Lattice under `/plugins/<name>/...`
2. the page calls `/api/v1/...` using relative paths
3. the host application only needs to open that page
4. the plugin keeps its own cache for paper snapshots and rendering settings

This keeps responsibilities simple:

- Lattice provides local data and static asset hosting
- the plugin owns UI, state, rendering, and host integration

## Understand the data boundary

The current read endpoints are citation-oriented and intentionally smaller than the full internal Lattice paper model.

Read payloads currently do not expose:

- `abstract`
- `collections`
- `tags`
- `pdfPath`
- `pdfURL`
- `latticeURL`

Important implications:

- if your plugin only needs to open a paper in Lattice, synthesize `lattice://paper/{id}` from the paper `id`
- if your plugin needs the actual filesystem PDF path, the current Local API does not expose it
- `pdfPath` is currently an input field accepted by `POST /api/v1/papers`, not a field returned by `GET /api/v1/papers/{id}`
- raw PDF byte upload is a separate `PUT /api/v1/papers/{id}/pdf` flow gated by `pdf-upload`; it is not part of the paper-detail payload

## What not to rely on

### A remote website calling the Local API directly

This is not the intended default model. The Local API is designed around local-origin, local-integration usage.

### Assuming write access is always available

It is optional. The user must explicitly turn `Read-Only Mode` off, and clients should gate write behavior on `/status.capabilities`.

### Treating the read endpoints as full paper serialization

They are not. The Local API is currently optimized for citation workflows, lightweight paper selection, and controlled paper creation.

## Debugging advice

- Start with `/api/v1/status` to distinguish availability problems from data problems
- If search results look wrong, inspect `/api/v1/search` directly
- If a plugin page does not open, first verify that the plugin assets were actually copied into the plugin directory
- If static files load but API requests fail, verify that the configured port in Lattice still matches the URL being used
- If `POST /api/v1/papers` returns `403`, ask the user to turn `Read-Only Mode` off
- If paper creation succeeds but `pdfAttached` is `false`, inspect the `warnings` array for Trusted Folder or PDF validation failures
- If `PUT /api/v1/papers/{id}/pdf` returns `409`, decide whether your UI should retry with `?force=true`
- If `PUT /api/v1/papers/{id}/pdf` returns `503`, ask the user to configure a usable PDF upload destination first
- If the host application caches an entry URL, changing the Local API port usually requires re-registration or reinstallation

## Related documents

- For a first-time integration flow, start with [Quick Start](./quickstart.md)
- For exact endpoint fields and error handling details, use [API Reference](./api-reference.md)

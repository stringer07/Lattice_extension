# Lattice Local API

Language versions:
[简体中文](../Chinese/总览.md)

Lattice provides a localhost-only HTTP API so external tools can access citation-oriented library data, host local plugin front ends, and optionally create papers when `Read-Only Mode` is turned off in Settings.

Related documents:
[Quick Start](./quickstart.md) · [API Reference](./api-reference.md) · [Plugin Development Guide](./plugin-development.md)

This documentation is written for external developers and focuses on the practical questions:

- What the Local API can do
- Which endpoints it provides
- What the request and response shapes look like
- How to build your own local plugin or integration

This English version is the primary documentation set.

This documentation set intentionally covers the public `/api/v1` API and `/plugins/{name}/...` static hosting surface. It does not document browser-extension-specific internal routes.

## Capability Overview

| Capability | Description |
| --- | --- |
| Local health check | Check whether the Local API is available, which API version is active, the current Lattice version, capability list, and current localhost base URL |
| Paper search | Search papers by title, author, venue/source, citekey, or year |
| Single-paper detail | Fetch detailed citation metadata for one paper |
| Metadata lookup | Resolve metadata by DOI, arXiv ID, ISBN, or title before creating or updating a paper |
| Collections and tags directory | Fetch assignable collections and tags for write UIs |
| CSL-JSON output | The paper detail response includes a `cslItem` ready for citeproc-style processors |
| Paper creation | Create a paper with metadata, optional collection/tag assignment, optional PDF attachment, duplicate strategy, and optional background enrichment when `create-paper` is present in `/status.capabilities` |
| PDF byte upload | Upload raw PDF bytes to an existing paper when `pdf-upload` is present in `/status.capabilities` |
| Plugin static hosting | Serve local plugin front-end assets through `/plugins/{name}/...` |

## Scope and Boundaries

- This is a local API. It only listens on `127.0.0.1`.
- It is intended for local scripts, automations, desktop companion tools, and plugin-style integrations such as Office, Raycast, or Obsidian.
- All business endpoints live under `/api/v1`.
- This document set covers the public `/api/v1` business endpoints and `/plugins/{name}/...` static hosting only.
- Write access is opt-in. `POST /api/v1/papers` is only usable when the user turns `Read-Only Mode` off in `Settings → Local API`. `PUT /api/v1/papers/{id}/pdf` additionally requires `pdf-upload` to be present in `/status.capabilities`. If a create request includes `pdfPath`, the file must live inside a `Trusted Folders` entry or one of its subfolders.
- Read payloads are citation-oriented snapshots, not full exports of Lattice's internal `Paper` model.

Fields intentionally not exposed by the current read endpoints include:

- `abstract`
- `collections`
- `tags`
- `notes`
- `pdfPath`
- `pdfURL`
- `latticeURL`

If your integration only needs to open a paper in Lattice, you can synthesize `lattice://paper/{id}` from the paper `id`. If you need the actual local PDF file path, the current Local API does not expose it.

## Documentation Index

Recommended reading order:

1. Start with [Quick Start](./quickstart.md)
2. Use [API Reference](./api-reference.md) when you need endpoint or field-level details
3. Use [Plugin Development Guide](./plugin-development.md) when you are building a local plugin or external extension

What each document is for:

| Document | When to read it | What it covers |
| --- | --- | --- |
| [quickstart.md](./quickstart.md) | First-time integration | How to enable Local API, detect capabilities, make minimal read/write requests, and troubleshoot connectivity |
| [api-reference.md](./api-reference.md) | Client implementation, SDK wrappers, endpoint integration | Public endpoints, request parameters, response shapes, a field-by-method matrix, error codes, field definitions, and API boundaries |
| [plugin-development.md](./plugin-development.md) | Local plugin or host extension development | `/plugins/{name}/...` hosting, directory layout, integration patterns, write-capability handling, deployment, and debugging advice |

## One-Minute Start

Assuming your Local API is running on the default port `29467`:

```bash
curl http://127.0.0.1:29467/api/v1/status
curl "http://127.0.0.1:29467/api/v1/metadata?doi=10.48550/arXiv.1706.03762"
curl http://127.0.0.1:29467/api/v1/collections
curl "http://127.0.0.1:29467/api/v1/search?q=transformer&limit=5"
curl http://127.0.0.1:29467/api/v1/papers/550E8400-E29B-41D4-A716-446655440000
curl -X POST http://127.0.0.1:29467/api/v1/papers \
  -H "Content-Type: application/json" \
  -d '{"title":"Attention Is All You Need"}'
```

## Good Fits for the API

- Shell / Python / Node scripts: call `http://127.0.0.1:<port>/api/v1/...` directly
- Local web UIs: deploy static assets under `/plugins/{name}/...` and call `/api/v1/...` with relative paths
- Office / desktop plugins: let the host load a page from `/plugins/{name}/...`, then let that page call the Local API

## Existing External Extension References

The repository's [word-addin](../word-addin/) and [raycast-extension](../raycast-extension/) directories contain external extension assets built on top of the public Local API, and can serve as references for packaging, static asset layout, and local hosting integration patterns.

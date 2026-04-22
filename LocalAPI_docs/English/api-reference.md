# Local API Reference

Language versions:
[简体中文](../Chinese/接口参考.md)

Related documents:
[Overview](./README.md) · [Quick Start](./quickstart.md) · [Plugin Development Guide](./plugin-development.md)

## Basics

- Protocol: HTTP
- Default address: `http://127.0.0.1:29467`
- API prefix: `/api/v1`
- Data format: `application/json; charset=utf-8`
- Supported API methods: `GET`, `POST`, `PUT`, `OPTIONS`
- Write access: optional, disabled by default while `Read-Only Mode` is on, and only available after the user turns `Read-Only Mode` off in `Settings → Local API`. `PUT /api/v1/papers/{uuid}/pdf` additionally requires `pdf-upload` in `/status.capabilities`
- Plugin static hosting lives under `/plugins/{name}/...` and is not under `/api/v1`

## General Conventions

### Successful responses

- Normal business endpoints return `200 OK`
- Successful paper creation returns `201 Created`
- Preflight requests return `204 No Content`

### Error responses

Most error responses include at least:

```json
{
  "error": "Error message"
}
```

Some error payloads include extra fields:

```json
{
  "error": "Duplicate paper found",
  "existingPaperID": "550E8400-E29B-41D4-A716-446655440000"
}
```

```json
{
  "error": "Library limit reached",
  "currentCount": 50,
  "limit": 50
}
```

### Common status codes

| Status | Meaning | Typical reason |
| --- | --- | --- |
| `200` | Success | The request completed normally |
| `201` | Created | `POST /api/v1/papers` created a paper, or `PUT /api/v1/papers/{uuid}/pdf` uploaded bytes |
| `204` | No content | `OPTIONS` preflight |
| `400` | Bad request | Invalid request format, malformed JSON, empty title, invalid `paperType`, invalid `strategy`, missing metadata lookup query, or invalid PDF request shape |
| `403` | Forbidden | Non-local request, origin not allowed, or public write access is still read-only |
| `404` | Not found | Unknown endpoint, missing paper, failed metadata lookup, or missing plugin asset |
| `405` | Method not allowed | Unsupported method such as `PATCH` or `DELETE`, or a method/path combination the API does not implement |
| `409` | Conflict | Duplicate paper was detected during create, or a PDF is already attached and upload was not forced |
| `422` | Unprocessable Content | Free-tier paper limit was reached |
| `413` | Payload too large | Request body exceeded the configured size limit |
| `503` | Service unavailable | PDF upload was requested but no usable upload destination is configured |
| `500` | Internal server error | Lattice failed to process the request |

## Capability Detection

Use `GET /api/v1/status` before relying on optional behavior.

In particular:

- treat `create-paper` in `capabilities` as the source of truth for whether `POST /api/v1/papers` is usable
- treat `create-paper-v2` as the signal that duplicate strategy and rich create/replace responses are supported
- treat `pdf-upload` as the source of truth for whether `PUT /api/v1/papers/{uuid}/pdf` is usable
- do not assume write access is enabled on every machine

## Field-by-Method Matrix

This section is the quickest way to answer two questions:

- which fields exist at all
- which HTTP methods expose or accept each field

### Status and capability fields

| Field | `GET /status` response | Notes |
| --- | --- | --- |
| `ok` | `ok` | Health flag |
| `apiVersion` | `apiVersion` | Local API version string |
| `appVersion` | `appVersion` | Lattice app version string |
| `capabilities[]` | `capabilities[]` | Capability list for the current instance |
| `readOnly` | `readOnly` | Whether the public `/api/v1` write surface is currently read-only |
| `baseURL` | `baseURL` | Current localhost base address |
| `browserExtensionEnabled` | `browserExtensionEnabled` | Mirrors the Browser Extension toggle in Settings |

### Search fields

| Field | `GET /search` query | `GET /search` response | Notes |
| --- | --- | --- | --- |
| `q` | `q` | — | Empty query returns recent papers |
| `limit` | `limit` | — | Clamped to `1...50`; unparsable values fall back to `10` |
| `papers[]` | — | `papers[]` | Top-level result array |
| `id` | — | `papers[].id` | Search hit paper UUID |
| `title` | — | `papers[].title` | Search hit display title |
| `authorsDisplay` | — | `papers[].authorsDisplay` | Search-only author summary |
| `subtitle` | — | `papers[].subtitle` | Search-only secondary summary |
| `year` | — | `papers[].year` | Search hit year |
| `citekey` | — | `papers[].citekey` | Search hit citation key |
| `paperType` | — | `papers[].paperType` | Search hit paper type |

### Metadata lookup fields

| Field | `GET /metadata` query | `GET /metadata` response | Notes |
| --- | --- | --- | --- |
| `doi` | `doi` | `doi` | At least one of `doi`, `arxivId`, `isbn`, or `title` is required |
| `arxivId` | `arxivId` | — | Lookup input only |
| `isbn` | `isbn` | `isbn` | Can be used as both lookup input and output |
| `title` | `title` | `title` | Can be used as both lookup input and output |
| `authors` | — | `authors` | Semicolon-separated author string |
| `year` | — | `year` | Resolved publication year |
| `journal` | — | `journal` | Resolved source / venue |
| `abstract` | — | `abstract` | Resolved abstract text |
| `volume` | — | `volume` | Resolved volume |
| `issue` | — | `issue` | Resolved issue |
| `pages` | — | `pages` | Resolved pages |
| `paperType` | — | `paperType` | Resolved paper type when available |

### Collection directory fields

| Field | `GET /collections` response | Notes |
| --- | --- | --- |
| `id` | `[].id` | Collection UUID |
| `name` | `[].name` | Leaf collection name |
| `path` | `[].path` | Full slash-delimited collection path |
| `depth` | `[].depth` | Nesting depth for UI indentation |

### Tag directory fields

| Field | `GET /tags` response | Notes |
| --- | --- | --- |
| `id` | `[].id` | Tag UUID |
| `name` | `[].name` | Tag display name |
| `colorHex` | `[].colorHex` | Optional stored color |

### Core paper fields

| Field | `GET /papers/{uuid}` response | `GET /metadata` response | `POST /papers` request | `POST /papers` response | Notes |
| --- | --- | --- | --- | --- | --- |
| `id` | `id` | — | — | `id` | Stable paper UUID; can be used to synthesize `lattice://paper/{id}` |
| `citekey` | `citekey` | — | — | — | Read-only citation key |
| `title` | `title` | `title` | `title` | `title` | Present in read and write flows |
| `authors` | `authors[]` | `authors` | `authors` | `authors` | Detail uses `string[]`; metadata lookup and write request/response use a semicolon-separated string |
| `year` | `year` | `year` | `year` | `year` | Shared core field |
| `journal` | `journal` | `journal` | `journal` | — | Accepted on create, returned on detail and metadata lookup, not echoed by create response |
| `abstract` | — | `abstract` | `abstract` | — | Stored on create and returned by metadata lookup, not currently exposed by paper-detail payloads |
| `doi` | `doi` | `doi` | `doi` | `doi` | Shared core identifier |
| `volume` | `volume` | `volume` | `volume` | — | Accepted on create, returned on detail and metadata lookup |
| `issue` | `issue` | `issue` | `issue` | — | Accepted on create, returned on detail and metadata lookup |
| `pages` | `pages` | `pages` | `pages` | — | Accepted on create, returned on detail and metadata lookup |
| `isbn` | `isbn` | `isbn` | `isbn` | — | Accepted on create, returned on detail and metadata lookup |
| `paperType` | `paperType` | `paperType` | `paperType` | — | Accepted on create, returned on detail, metadata lookup, and search |
| `pdfPath` | — | — | `pdfPath` | — | Input-only field for path-based PDF attachment attempts during create |
| `collections` | — | — | `collections[]` | — | Input-only case-insensitive collection-path list |
| `tags` | — | — | `tags[]` | — | Input-only tag-name list |
| `enrich` | — | — | `enrich` | — | Input-only background enrichment flag |
| `strategy` | — | — | `strategy` | — | Duplicate strategy for create: `"skip"` or `"replace"` |
| `pdfAttached` | — | — | — | `pdfAttached` | Whether the paper has an attached PDF after the operation |
| `enrichmentStatus` | — | — | — | `enrichmentStatus` | Output-only write result field: `pending` or `none` |
| `warnings` | — | — | — | `warnings[]` | Output-only non-fatal write warnings |
| `alreadyExists` | — | — | — | `alreadyExists` | `false` for new creates, `true` when `strategy: "replace"` updated an existing paper |
| `conflict` | — | — | — | `conflict` | Conflict summary object returned on successful replace responses |
| `cslItem` | `cslItem` | — | — | — | Read-only CSL payload object |

### PDF upload fields

| Field | `PUT /papers/{uuid}/pdf` request | `PUT /papers/{uuid}/pdf` response | Notes |
| --- | --- | --- | --- |
| `uuid` | path segment | — | Existing paper UUID |
| `Content-Type` | `application/pdf` | — | Required |
| request body | raw PDF bytes | — | Must start with `%PDF-` |
| `force` | `force=true` query | — | Optional; bypasses the existing-PDF conflict check |
| `reason` | — | `reason` | Success payload currently returns `{ "reason": "uploaded" }` |

### CSL subfields

| Field | `GET /papers/{uuid}` response | Notes |
| --- | --- | --- |
| `cslItem.id` | `cslItem.id` | Same UUID as top-level `id` |
| `cslItem.type` | `cslItem.type` | CSL item type |
| `cslItem.title` | `cslItem.title` | CSL title |
| `cslItem.author[]` | `cslItem.author[]` | CSL author array |
| `cslItem.author[].family` | `cslItem.author[].family` | Present when the name can be split |
| `cslItem.author[].given` | `cslItem.author[].given` | Present when the name can be split |
| `cslItem.author[].literal` | `cslItem.author[].literal` | Used for mononyms, institutional names, or unsplittable names |
| `cslItem.container-title` | `cslItem.container-title` | Used for non-book container titles |
| `cslItem.publisher` | `cslItem.publisher` | Used for book-like items |
| `cslItem.issued.date-parts` | `cslItem.issued.date-parts` | Currently `[[YYYY]]` when a year exists |
| `cslItem.DOI` | `cslItem.DOI` | CSL DOI |
| `cslItem.volume` | `cslItem.volume` | CSL volume |
| `cslItem.issue` | `cslItem.issue` | CSL issue |
| `cslItem.page` | `cslItem.page` | CSL pages |
| `cslItem.ISBN` | `cslItem.ISBN` | CSL ISBN |

### Fields not currently exposed by read endpoints

These fields are not available in `GET /search` or `GET /papers/{uuid}` today:

- `abstract`
- `collections`
- `tags`
- `notes`
- `pdfPath`
- `pdfURL`
- `latticeURL`

## `GET /status`

Checks whether the service is online and reports which capabilities the current instance supports.

### Request

```http
GET /api/v1/status
```

### Response fields

| Field | Type | Description |
| --- | --- | --- |
| `ok` | `boolean` | Health flag. Normally `true` when the service is available |
| `apiVersion` | `string` | Current Local API version |
| `appVersion` | `string` | Current Lattice app version |
| `capabilities` | `string[]` | Supported capability list |
| `readOnly` | `boolean` | Whether the public `/api/v1` write surface is currently read-only |
| `baseURL` | `string` | Current localhost base URL |
| `browserExtensionEnabled` | `boolean` | Mirrors the Browser Extension toggle in Settings |

### Current capability values

| Capability | Description |
| --- | --- |
| `search` | Paper search is available |
| `paper-detail` | Per-paper detail fetch by paper ID is available |
| `csl-item` | Detail payloads include CSL-JSON usable by citation engines |
| `create-paper-v2` | The create route supports duplicate strategy and rich create/replace responses |
| `create-paper` | `POST /api/v1/papers` is enabled for this Lattice instance |
| `pdf-upload` | `PUT /api/v1/papers/{uuid}/pdf` is currently available |
| `plugin-hosting` | Local plugin static hosting is available |

### Example

```json
{
  "ok": true,
  "apiVersion": "1",
  "appVersion": "1.2.3 (456)",
  "readOnly": false,
  "baseURL": "http://127.0.0.1:29467",
  "browserExtensionEnabled": true,
  "capabilities": [
    "search",
    "paper-detail",
    "csl-item",
    "plugin-hosting",
    "create-paper",
    "create-paper-v2",
    "pdf-upload"
  ]
}
```

## `GET /search`

Searches the Lattice library and returns lightweight result cards suitable for suggestion UIs, pickers, and search result lists.

### Request

```http
GET /api/v1/search?q=<query>&limit=<n>
```

### Query parameters

| Parameter | Required | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `q` | No | `string` | empty string | Search query. If empty, the endpoint returns recently added papers |
| `limit` | No | `integer` | `10` | Requested result count. Valid integers are clamped to `1...50`; unparsable values fall back to `10` |

### Matching scope

From an external integration point of view, search matches the following kinds of fields:

- title
- author
- journal / venue / source
- `citekey`
- year

### Response shape

```json
{
  "papers": [
    {
      "id": "550E8400-E29B-41D4-A716-446655440000",
      "title": "Attention Is All You Need",
      "authorsDisplay": "Ashish Vaswani, Noam Shazeer, Niki Parmar, ...",
      "subtitle": "Ashish Vaswani, Noam Shazeer, Niki Parmar, ... • 2017 • NeurIPS",
      "year": 2017,
      "citekey": "vaswani2017attention",
      "paperType": "inproceedings"
    }
  ]
}
```

### `papers[]` field reference

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Paper UUID |
| `title` | `string` | Display title. Empty titles are returned as `Untitled` |
| `authorsDisplay` | `string` | Author text formatted for direct UI display |
| `subtitle` | `string` | Secondary summary text, typically combining author, year, and source |
| `year` | `integer \| null` | Publication year |
| `citekey` | `string` | Preferred citation key. If no persisted key exists, a usable generated key is returned |
| `paperType` | `string` | Paper type |

### Possible `paperType` values

- `article`
- `book`
- `inproceedings`
- `thesis`
- `report`
- `misc`

### Example

```bash
curl "http://127.0.0.1:29467/api/v1/search?q=transformer&limit=5"
```

## `GET /papers/{uuid}`

Fetches detailed citation metadata for a single paper.

### Request

```http
GET /api/v1/papers/{uuid}
```

### Path parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `uuid` | `string` | Paper UUID. If the path segment is not a valid UUID, the request falls through to `404 Not Found` |

### Response shape

```json
{
  "id": "550E8400-E29B-41D4-A716-446655440000",
  "citekey": "vaswani2017attention",
  "title": "Attention Is All You Need",
  "authors": [
    "Ashish Vaswani",
    "Noam Shazeer"
  ],
  "year": 2017,
  "journal": "NeurIPS",
  "doi": "10.5555/example-doi",
  "volume": "30",
  "issue": null,
  "pages": "5998-6008",
  "isbn": null,
  "paperType": "inproceedings",
  "cslItem": {
    "id": "550E8400-E29B-41D4-A716-446655440000",
    "type": "paper-conference",
    "title": "Attention Is All You Need",
    "author": [
      {
        "family": "Vaswani",
        "given": "Ashish"
      },
      {
        "family": "Shazeer",
        "given": "Noam"
      }
    ],
    "container-title": "NeurIPS",
    "publisher": null,
    "issued": {
      "date-parts": [[2017]]
    },
    "DOI": "10.5555/example-doi",
    "volume": "30",
    "issue": null,
    "page": "5998-6008",
    "ISBN": null
  }
}
```

### Top-level field reference

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Paper UUID |
| `citekey` | `string` | Preferred citation key |
| `title` | `string` | Title |
| `authors` | `string[]` | Array of author strings |
| `year` | `integer \| null` | Year |
| `journal` | `string \| null` | Journal, conference, publisher, or other source text |
| `doi` | `string \| null` | DOI |
| `volume` | `string \| null` | Volume |
| `issue` | `string \| null` | Issue |
| `pages` | `string \| null` | Page range |
| `isbn` | `string \| null` | ISBN |
| `paperType` | `string` | Paper type |
| `cslItem` | `object` | Object ready to be passed to a CSL citation processor |

### `cslItem` field reference

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Same as the paper ID |
| `type` | `string` | CSL item type |
| `title` | `string` | Title |
| `author` | `object[]` | Author array with `family` / `given` / `literal` fields |
| `container-title` | `string \| null` | Journal, proceedings, or other container title |
| `publisher` | `string \| null` | Publisher. Common for book-like items |
| `issued` | `object \| null` | Date object in the form `{"date-parts": [[YYYY]]}` |
| `DOI` | `string \| null` | DOI |
| `volume` | `string \| null` | Volume |
| `issue` | `string \| null` | Issue |
| `page` | `string \| null` | Pages |
| `ISBN` | `string \| null` | ISBN |

### `cslItem.author[]` field reference

| Field | Type | Description |
| --- | --- | --- |
| `family` | `string \| null` | Family name when Lattice can split the author name |
| `given` | `string \| null` | Given name when Lattice can split the author name |
| `literal` | `string \| null` | Literal name used for one-part, institutional, or otherwise unsplittable names |

### `cslItem.issued` field reference

| Field | Type | Description |
| --- | --- | --- |
| `date-parts` | `integer[][]` | Currently `[[YYYY]]` when a year exists |

### `paperType` to `cslItem.type` mapping

| `paperType` | `cslItem.type` |
| --- | --- |
| `article` | `article-journal` |
| `book` | `book` |
| `inproceedings` | `paper-conference` |
| `thesis` | `thesis` |
| `report` | `report` |
| `misc` | `article` |

### Fields intentionally not returned

`GET /api/v1/papers/{uuid}` is citation-oriented. It currently does not expose:

- `abstract`
- `collections`
- `tags`
- `notes`
- `pdfPath`
- `pdfURL`
- `latticeURL`

### Deep-link note

If your integration only needs to open the paper in Lattice, you can synthesize:

```text
lattice://paper/{id}
```

The current Local API does not return a dedicated `latticeURL` field, and it does not expose the local PDF file path.

### Typical uses

- Fetch a full paper snapshot before inserting a citation
- Build input for citeproc / CSL engines
- Show a detailed citation card in an external tool
- Maintain a local metadata cache inside a plugin

## `GET /collections`

Returns assignable collections for write-oriented clients.

### Request

```http
GET /api/v1/collections
```

### Response shape

```json
[
  {
    "id": "550E8400-E29B-41D4-A716-446655440000",
    "name": "Transformers",
    "path": "Deep Learning/Transformers",
    "depth": 1
  }
]
```

### Behavioral notes

- the response is a top-level JSON array, not an object wrapper
- collections are sorted by `path` using localized case-insensitive comparison
- use `path` as the write-side identifier for `POST /api/v1/papers`

## `GET /tags`

Returns assignable tags for write-oriented clients.

### Request

```http
GET /api/v1/tags
```

### Response shape

```json
[
  {
    "id": "550E8400-E29B-41D4-A716-446655440000",
    "name": "foundational",
    "colorHex": "#FF9500"
  }
]
```

### Behavioral notes

- the response is a top-level JSON array, not an object wrapper
- tags are sorted by stored `sortOrder` first and by name second
- use `name` as the write-side identifier for `POST /api/v1/papers`

## `GET /metadata`

Looks up citation metadata from a lightweight identifier.

### Request

```http
GET /api/v1/metadata?doi=<doi>
GET /api/v1/metadata?arxivId=<id>
GET /api/v1/metadata?isbn=<isbn>
GET /api/v1/metadata?title=<title>
```

### Query parameters

| Parameter | Required | Type | Description |
| --- | --- | --- | --- |
| `doi` | Conditionally | `string` | DOI lookup input |
| `arxivId` | Conditionally | `string` | arXiv ID lookup input |
| `isbn` | Conditionally | `string` | ISBN lookup input |
| `title` | Conditionally | `string` | Title lookup input |

At least one of these parameters must be present and non-empty.

### Response shape

```json
{
  "title": "Attention Is All You Need",
  "authors": "Ashish Vaswani; Noam Shazeer; Niki Parmar",
  "year": 2017,
  "journal": "NeurIPS",
  "abstract": "The dominant sequence transduction models are based on...",
  "doi": "10.48550/arXiv.1706.03762",
  "volume": "30",
  "issue": null,
  "pages": "5998-6008",
  "isbn": null,
  "paperType": "inproceedings"
}
```

### Error responses

| Status | Typical payload | Meaning |
| --- | --- | --- |
| `400` | `{"error":"Provide at least one of doi, arxivId, isbn, or title."}` | No lookup key was provided |
| `404` | `{"error":"Not found"}` | No metadata was resolved |
| `500` | `{"error":"Internal server error"}` | Encoding or server-side processing failed unexpectedly |

### Typical uses

- Prefill a create form from a DOI, arXiv ID, ISBN, or title
- Enrich a host application's lightweight search result before the user commits a write
- Resolve a better title / author list before deciding whether a duplicate should be skipped or replaced

## `POST /papers`

Creates one paper in the library.

### Availability

- The endpoint path is `POST /api/v1/papers`
- It is intended for localhost callers only
- It only works when `/status.capabilities` contains `create-paper`
- If write access is disabled, the endpoint returns `403`

### Request body

```json
{
  "title": "Attention Is All You Need",
  "authors": "Vaswani, Ashish; Shazeer, Noam; Parmar, Niki",
  "year": 2017,
  "journal": "NeurIPS",
  "abstract": "The dominant sequence transduction models are based on...",
  "doi": "10.48550/arXiv.1706.03762",
  "volume": "30",
  "issue": null,
  "pages": "5998-6008",
  "isbn": "9780306406157",
  "paperType": "inproceedings",
  "pdfPath": "/Users/me/Papers/attention.pdf",
  "collections": ["Deep Learning/Transformers"],
  "tags": ["foundational", "NLP"],
  "strategy": "skip",
  "enrich": true
}
```

### Request body field reference

| Field | Required | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `title` | Yes | `string` | none | Paper title. Leading/trailing whitespace is trimmed. Empty or whitespace-only titles are rejected |
| `authors` | No | `string \| null` | `null` | Author list as a single semicolon-separated string. Example: `"Einstein, Albert; Bohr, Niels"` |
| `year` | No | `integer \| null` | `null` | Publication year |
| `journal` | No | `string \| null` | `null` | Journal, venue, publisher, or other source text |
| `abstract` | No | `string \| null` | `null` | Abstract text. Stored on the paper, but not returned by the current read endpoints |
| `doi` | No | `string \| null` | `null` | DOI. Lattice cleans DOI URLs to the canonical DOI form before saving |
| `volume` | No | `string \| null` | `null` | Volume |
| `issue` | No | `string \| null` | `null` | Issue |
| `pages` | No | `string \| null` | `null` | Page range |
| `isbn` | No | `string \| null` | `null` | ISBN. Cleaned and validated before saving; invalid values are dropped |
| `paperType` | No | `string \| null` | `"misc"` | Paper type. Matching is case-insensitive. Invalid non-empty values return `400` |
| `pdfPath` | No | `string \| null` | `null` | Local filesystem path to a PDF to attach. The file must exist, be a PDF, and live inside a Trusted Folder or one of its subfolders. This is an input-only field; it is not returned by `GET /papers/{uuid}` |
| `collections` | No | `string[] \| null` | `[]` | Collection paths to assign, using existing collection paths such as `"AI/Transformers"`. Matching is case-insensitive |
| `tags` | No | `string[] \| null` | `[]` | Tag names to attach. Existing tags are reused; missing tags are created automatically |
| `strategy` | No | `string \| null` | `"skip"` | Duplicate handling strategy. `"skip"` returns `409` on duplicate; `"replace"` updates the existing paper and returns a success response |
| `enrich` | No | `boolean \| null` | `false` | When `true`, Lattice queues background enrichment if the created paper has a DOI or an attached PDF |

### Request limits

- `title`: at most `1024` UTF-8 bytes
- `abstract`: at most `65536` UTF-8 bytes
- `authors`: at most `16384` UTF-8 bytes
- `collections`: at most `100` items
- `tags`: at most `100` items
- each `collections[i]` and `tags[i]`: at most `256` UTF-8 bytes

### Possible `paperType` values

- `article`
- `book`
- `inproceedings`
- `thesis`
- `report`
- `misc`

### Successful response

Status: `201 Created`

```json
{
  "id": "550E8400-E29B-41D4-A716-446655440000",
  "title": "Attention Is All You Need",
  "authors": "Vaswani, Ashish; Shazeer, Noam; Parmar, Niki",
  "year": 2017,
  "doi": "10.48550/arXiv.1706.03762",
  "pdfAttached": true,
  "enrichmentStatus": "pending",
  "warnings": ["Collection not found: Deep Learning/Missing"],
  "alreadyExists": false,
  "conflict": null
}
```

When `strategy: "replace"` updates an existing paper, the status is `200 OK` and `alreadyExists` becomes `true`.

### Successful response field reference

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | Newly created paper UUID |
| `title` | `string` | Saved display title |
| `authors` | `string \| null` | Saved authors joined with `"; "` |
| `year` | `integer \| null` | Saved year |
| `doi` | `string \| null` | Cleaned DOI |
| `pdfAttached` | `boolean` | Whether the paper has an attached PDF after the operation |
| `enrichmentStatus` | `string` | `"pending"` when enrichment was queued, otherwise `"none"` |
| `warnings` | `string[]` | Non-fatal issues such as unknown collections or PDF attachment failures |
| `alreadyExists` | `boolean` | `false` for new creates, `true` when `strategy: "replace"` updated an existing paper |
| `conflict` | `object \| null` | Conflict summary describing the matched existing paper when replace succeeded |

### Error responses

| Status | Typical payload | Meaning |
| --- | --- | --- |
| `400` | `{"error":"Malformed JSON"}` | Invalid JSON request body |
| `400` | `{"error":"Title is required and must not be empty"}` | Missing or blank title |
| `400` | `{"error":"Invalid paperType"}` | Unsupported `paperType` value |
| `400` | `{"error":"Invalid strategy"}` | Unsupported `strategy` value |
| `403` | `{"error":"API is in read-only mode"}` | `Read-Only Mode` is still on |
| `404` | `{"error":"Not found"}` | Path other than `/api/v1/papers` |
| `409` | `{"error":"Duplicate paper found","existingPaperID":"uuid","existingTitle":"...","conflictField":"doi","latticeURL":"lattice://paper/..."}` | Duplicate DOI or normalized title match was found while `strategy` resolved to `"skip"` |
| `422` | `{"error":"Library limit reached","currentCount":50,"limit":50}` | Free-tier paper limit was reached |
| `500` | `{"error":"Failed to save"}` | Save failed unexpectedly |

### Behavioral notes

- Duplicate detection checks DOI first and normalized title second
- `strategy` defaults to `"skip"`
- `"replace"` overwrites fields the incoming request actually supplies, but preserves existing values for omitted optional fields
- `collections` are matched against existing collection paths case-insensitively; missing collections become warnings and are not auto-created
- `tags` are matched by normalized name; missing tags are created automatically
- `pdfPath` must point to an existing PDF inside a Trusted Folder or one of its subfolders; failures become warnings and do not abort paper creation
- If `pdfPath` is outside every Trusted Folder, the warning is: `PDF path is not inside a Trusted Folder. Add the enclosing folder in Settings > Local API > Trusted Folders, or attach the PDF manually in Lattice.`
- Lattice does not copy the PDF file into app storage; it stores a security-scoped bookmark instead
- `enrich: true` only queues background enrichment when the created paper has a DOI or an attached PDF
- After creation, `GET /api/v1/papers/{uuid}` still returns the citation-oriented read payload, not a full echo of all write-time fields

### Minimal example

```bash
curl -X POST http://127.0.0.1:29467/api/v1/papers \
  -H "Content-Type: application/json" \
  -d '{"title":"A Brief History of Time"}'
```

## `PUT /papers/{uuid}/pdf`

Uploads raw PDF bytes to an existing paper.

### Availability

- The endpoint path is `PUT /api/v1/papers/{uuid}/pdf`
- It is intended for localhost callers only
- Treat `pdf-upload` in `/status.capabilities` as the source of truth for whether the endpoint is usable
- If write access is disabled, the endpoint returns `403`

### Request

```http
PUT /api/v1/papers/{uuid}/pdf
Content-Type: application/pdf
```

Request body: raw PDF bytes.

Optional query parameter:

| Parameter | Required | Type | Default | Description |
| --- | --- | --- | --- | --- |
| `force` | No | `boolean` | `false` | When `true`, bypasses the existing-PDF conflict check |

### Successful response

Status: `201 Created`

```json
{
  "reason": "uploaded"
}
```

### Error responses

| Status | Typical payload | Meaning |
| --- | --- | --- |
| `400` | `{"error":"Content-Type must be application/pdf"}` | Wrong or missing content type |
| `400` | `{"error":"Invalid PDF payload"}` | Body did not look like a PDF |
| `403` | `{"error":"API is in read-only mode"}` | `Read-Only Mode` is still on |
| `404` | `{"error":"Not found"}` | Unknown paper or unknown path |
| `409` | `{"error":"PDF already attached"}` | The paper already has a PDF and `force=true` was not supplied |
| `413` | `{"error":"Payload too large"}` | The PDF body exceeded the upload limit |
| `503` | `{"reason":"not-configured"}` | No usable PDF upload destination is currently configured |
| `500` | `{"error":"..."}` | Upload failed unexpectedly |

### Behavioral notes

- the request body must be raw bytes and begin with `%PDF-`
- the current upload limit for this route is `200000000` bytes
- a successful upload updates the paper's stored PDF bookmark and may trigger a background refresh

## `GET /plugins/{name}/...`

Serves static files from Lattice's local plugin directory.

### Characteristics

- Endpoint prefix: `/plugins/`
- Purpose: host local front-end assets for plugins and add-ins
- Not part of `/api/v1`
- Static files are served from Lattice's sandboxed Application Support plugin directory
- Path traversal attempts are rejected

### Common content types

- `.html`
- `.js`
- `.css`
- `.json`
- `.png`
- `.svg`
- `.xml`
- `.csl`

## `OPTIONS`

The Local API also accepts `OPTIONS` to support browser preflight requests.

### Characteristics

- Returns `204 No Content`
- Returns CORS headers for allowed origins
- Does not return business payload data

If your page is hosted by Lattice under `/plugins/{name}/...`, you usually do not need to handle this explicitly.

## CORS and origin restrictions

By default, the Local API is intended for local browser origins:

- `http://localhost:*`
- `https://localhost:*`
- `http://127.0.0.1:*`
- `https://127.0.0.1:*`

This is why hosting your plugin page under `/plugins/{name}/...` is the simplest and most reliable option.

Advanced note:

- the server allows `GET, POST, PUT, OPTIONS`
- the CORS allowlist can be extended with the `citationBridgeAllowedOrigins` user-defaults override when needed for advanced integrations

## Request size limit

For most routes, the total HTTP request size is limited to `262144` bytes (`256 KiB`), including headers and body.

`PUT /api/v1/papers/{uuid}/pdf` has a larger PDF body limit of `200000000` bytes.

## Error examples

### Invalid paper path segment

```bash
curl http://127.0.0.1:29467/api/v1/papers/not-a-uuid
```

```json
{
  "error": "Not found"
}
```

### Missing metadata lookup key

```bash
curl http://127.0.0.1:29467/api/v1/metadata
```

```json
{
  "error": "Provide at least one of doi, arxivId, isbn, or title."
}
```

### Unknown endpoint

```json
{
  "error": "Not found"
}
```

## Related documents

- If you have not yet verified that the service is reachable, start with [Quick Start](./quickstart.md)
- If you are building a local plugin or host extension, pair this with [Plugin Development Guide](./plugin-development.md)

# Lattice Word Add-in

[中文说明](./README.zh-CN.md)

![Lattice Word Add-in Demo](./demo/demo.png)

This plugin lets you search your Lattice library from Microsoft Word, insert citation placeholders, and generate formatted citations plus a bibliography inside the document.

The current implementation is a local Office Add-in hosted by Lattice itself. It talks to the Lattice Local API on `127.0.0.1` and installs a Word manifest into the local Word container on macOS.

## Requirements

- Lattice `> 1.2`
- Local API enabled in Lattice
- Microsoft Word that supports `WordApi 1.4`
- macOS for the installer in this repository

## What This Plugin Does

- Search your Lattice library by title, author, year, or citekey
- Show recent papers when the search box is empty
- Insert citation placeholders into the current Word selection
- Render formatted citations and a bibliography using CSL
- Support built-in styles:
  - `IEEE Numeric`
  - `APA 7th`
- Support loading a custom CSL file
- Render multi-paper citation groups, including numeric ranges when the selected CSL style requests them
- Persist citation metadata, group membership, and style selection inside the Word document

## How It Works

This add-in depends on the Lattice Local API and local plugin hosting.

It uses these API endpoints:

- `GET /api/v1/status`
- `GET /api/v1/search?q=...&limit=...`
- `GET /api/v1/papers/:id`

It also loads the add-in web assets from the Lattice local origin:

- `http://127.0.0.1:<port>/plugins/word-addin/...`

Port behavior:

- The installer automatically reads the port from the macOS defaults key `com.aurelian.Lattice:citationBridgePort`
- If no saved port exists, it falls back to `29467`
- In normal use, you do not need to specify the port manually
- If the Local API port changes later, uninstall and reinstall the Word add-in so the manifest points to the new local origin

Because of this architecture, Lattice must be running whenever Word needs to:

- connect to the add-in
- search the library
- fetch paper metadata
- refresh citations and bibliography

## Install

Download the release package first:

- Release page:
  `https://github.com/stringer07/Lattice_extension/releases/tag/word-addin-v1.1`
- Direct zip download:
  `https://github.com/stringer07/Lattice_extension/releases/download/word-addin-v1.1/Lattice-Word-Addin-macOS-1.1.zip`

Installation steps:

1. Launch Lattice at least once.
2. Enable the Local API in Lattice.
3. Keep Lattice running.
4. Download `Lattice-Word-Addin-macOS-1.1.zip`.
5. Extract the downloaded zip file.
6. Open the extracted `Lattice-Word-Addin-macOS-1.1/word-addin/` folder.
7. Double-click `install.command` to run the installer.

If you prefer the command line, run:

```bash
cd Lattice-Word-Addin-macOS-1.1/word-addin
./install.command
```

If macOS blocks the script, right-click `install.command`, choose `Open`, and confirm the prompt.

After installation:

1. Quit Microsoft Word completely.
2. Reopen Word.
3. Open the `Home` tab and look in the `Add-ins` area for the Lattice entry.

## Use

1. Open a Word document.
2. Click `Home` -> `Add-ins` and open `Lattice`.
3. Wait for the connection badge to show the Lattice app version.
4. Search by title, author, year, or citekey.
5. Click a result to insert a citation placeholder at the current cursor position.
6. Choose a citation style or load a custom CSL file.
7. Click `Update Citations & Bibliography`.

What happens during update:

- the add-in scans the document for Lattice citation controls
- missing citation metadata is fetched from the Local API
- citations are re-rendered in document order
- adjacent citations become a single, nonnested citation group; spaces, commas, and semicolons may separate the old controls, but prose, paragraph boundaries, and unrelated controls are never crossed
- CSL formats the whole group, including ordering, punctuation, and optional numeric ranges: a collapsing style can render `[1–4, 6]`, whereas a noncollapsing style lists each number. Built-in IEEE retains its original CSL behavior (`[1], [2], [3], [4]`); load a custom CSL with `<citation collapse="citation-number">` for ranges
- a managed bibliography block is inserted or updated near the end of the document; deleting all citations and updating removes this block, without touching manually written references

Inserting while the cursor is inside a Lattice citation or group places the new citation after it, and leaves the cursor outside the new control. Update again to include the new paper in the adjacent group; no dragging is needed. A group is one managed field: to remove an individual paper, delete that group and reinsert the desired papers, rather than editing its displayed numbers. If older edits have already nested controls, update stops with a warning rather than overwriting them; separate those controls before retrying.

Group membership is stored in the document's Custom XML store (`citationGroups`, an additive schema-version-1 field). New group controls use `lattice-citation-group:v1:<uuid>` tags; legacy `lattice-citation:v1:<paper-uuid>` controls remain readable. All members, including the numbers hidden inside a range, remain cited. Group mappings are immutable and retained after deletion/extension to allow Undo and copied controls to resolve their members; missing group metadata stops update rather than guessing from displayed numbers or clearing the bibliography. Keep using the updated add-in for documents with group controls; older add-in versions do not recognize them.

## Development checks

From `word-addin/`, run the dependency-free regression suite with Node.js 22 or later:

```bash
node --test tests/*.test.mjs
```

`tests/browser-check.html` also checks the bundled CSL engine with a real browser DOM. Serve this directory over HTTP and map `/plugins/word-addin/` to `web/` when opening that fixture.

For a Word smoke test, cite at least 12 distinct papers separated by prose or paragraphs, then insert adjacent repeats in order 8, 6, 4, 12 and update. Confirm they appear in order 4, 6, 8, 12 in one group, a second update is unchanged, and prose-separated citations do not move. With a range-enabled CSL, cite 1, 2, 3, 4, 6 together and confirm `[1–4, 6]` while all five papers remain in the bibliography. Switch to a noncollapsing CSL and back, save/reopen, copy/paste a group within the document, append another paper, and Undo then update. Delete some groups and update, then delete all citations at once and update: the bibliography should shrink and finally disappear. Cross-document copies require their associated Custom XML metadata and are not automatically hydrated from the displayed range.

To try source changes, rerun this checkout's `install.command`, then fully quit and reopen Word. Published release zip files are not rebuilt automatically.

## Release packaging

Version **1.1** uses Office manifest version **1.1.0.0**. See [CHANGELOG.md](./CHANGELOG.md) for changes and document compatibility notes.

From a source checkout, build the standalone macOS package with:

```bash
./release/package-word-addin.sh 1.1
```

The zip is written to `release/Lattice-Word-Addin-macOS-1.1.zip`. It contains only the Word add-in, its source assets, tests, and license notices. Release artifacts are not committed to Git; they are uploaded to the Word add-in's GitHub release.

## Uninstall

1. Quit Microsoft Word.
2. Open the extracted `Lattice-Word-Addin-macOS-1.1/word-addin/` folder.
3. Double-click `uninstall.command`.

If you prefer the command line, run:

```bash
cd Lattice-Word-Addin-macOS-1.1/word-addin
./uninstall.command
```

4. Reopen Word.

This removes:

- the plugin files copied into the Lattice container
- the Word manifest installed into Word's local `wef` directory

If the Lattice Local API port has changed, use this uninstall flow first and then run `./install.command` again.

## Contributing

PRs are welcome.

That includes more than the Word add-in. Contributions are welcome for:

- improvements to `word-addin`
- new plugins built on top of the Lattice Local API
- better install flows
- better citation rendering and style support
- footnote or endnote support
- documentation, tests, and examples for Local API-based plugins

If you open a PR, please include:

- what problem the change solves
- any Local API assumptions or endpoint changes
- installation or migration notes if needed
- manual test steps for user-visible behavior

If you are building a new plugin on top of the Local API, this repository is a good place to contribute it.

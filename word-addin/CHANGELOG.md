# Changelog

## 1.1

- Adjacent citations now form one citation group and are rendered together by CSL, including group sorting and numeric ranges such as `[1–4, 6]` when the selected style enables them.
- Styles without numeric collapsing continue to list every reference; the bundled IEEE and APA CSL files are unchanged. For numeric ranges, load a custom CSL that specifies `<citation collapse="citation-number">`.
- All group members, including numbers hidden inside a range, remain associated with their paper snapshots and bibliography entries in the document's Custom XML store.
- Existing single-paper controls remain readable and migrate to groups during update. New citations can be inserted after an existing group and included by updating again, without dragging or nesting citation boxes.
- Group mappings are retained for same-document copies and Undo. Missing group data, overlapping controls, and document edits during an update are reported rather than silently losing references.
- Updating after deleting every citation now removes the managed bibliography block. Manually written references are left alone.
- Includes 22 automated regression tests and a real-browser rendering/XML persistence fixture.

### Compatibility and limitations

- Product/package version: **1.1**; Office manifest version: **1.1.0.0**.
- Requires macOS, Lattice with Local API enabled, and WordApi 1.4, as before. Reinstall the add-in and fully quit/reopen Word to load the update.
- A citation group is one managed field. To remove an individual member, delete the group and reinsert the papers you want; editing the displayed range does not change membership.
- Documents containing the new group controls require the updated add-in. Older add-in versions do not recognize those groups.
- Cross-document copies require their associated Custom XML metadata; displayed citation numbers alone cannot recover the original papers.
- Automated tests and browser rendering checks pass. Native Microsoft Word interaction, including system Undo and save/reopen, still needs a Word smoke test; Word was not installed in the validation environment.

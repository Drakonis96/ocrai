# Changelog

## v1.2.1 - 2026-03-25

### Fixed
- Kept frontend progress polling alive while documents remain in `processing`, even when consecutive refreshes return identical metadata, so dashboard progress bars update without reloading the browser.
- Reworked document downloads to use hidden off-screen anchors and preserved scroll position, preventing the export button from jumping the page, opening and closing erratically, or getting stuck in a frontend loop.
- Hardened the editor export menu with outside-click detection based on element containment instead of brittle document click bubbling, reducing the chance of similar issues affecting other action buttons.

### Testing
- Added regression coverage for persistent processing polling and for the shared download helper used by frontend exports.

## v1.2.0 - 2026-03-25

### Added
- Gemini-driven blank page classification with a persisted `blankPage` state so empty scanned pages are treated as completed pages instead of OCR errors.
- Rich text rendering in the editor so Markdown content is shown visually as headings, emphasis, lists, quotes, code blocks, and links instead of raw syntax.
- Rich copy behavior from the editor using both `text/html` and `text/plain`, allowing formatted paste targets to preserve presentation without copying raw Markdown markers.
- New PDF export alongside the existing HTML and EPUB exports, generated from the rendered rich text document.
- Coverage for rich text rendering/export helpers and for the batch-processing concurrency behavior.

### Changed
- Fixed the background document processing manager so concurrent page batches no longer lose page state during metadata normalization, avoiding duplicate attempts and major slowdowns.
- Improved multi-page processing throughput verification and support for `pagesPerBatch` values such as 1, 2, 5, and 10.
- Moved blank-page detection authority to Gemini response JSON via `blankPage`, including prompt/schema changes and persistence through reprocessing flows.
- Accelerated PDF-to-image preparation with bounded parallel rasterization instead of fully sequential page rendering.
- Updated the upload screen layout so the settings card matches the height of the drag-and-drop card on desktop.
- Changed plain-text downloads and dashboard bulk export so they strip Markdown syntax instead of exporting raw formatting markers.

### Maintenance
- Added ignore rules for local/generated artifacts such as `.env.*`, `data/`, and the local PDF fixture.
- Updated project dependencies to support the rich text pipeline and browser-based PDF export.

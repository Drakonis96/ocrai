# Changelog

## v1.3.1 - 2026-03-31

### Added
- Added the same `Pages Processed At Once` selector to full-document reprocessing that is already available during new uploads, so users can choose the parallel page batch size before restarting a document.

### Fixed
- Limited expandable button labels so only the hovered or focused button reveals its text, preventing document-list rows and other grouped toolbars from expanding every action label at once.
- Strengthened OCR instructions for multi-column layouts so left-to-right column reading is treated as mandatory, column gutters are not crossed, and adjacent columns are not merged into one paragraph flow.
- Strengthened OCR paragraph detection so visible first-line indentation is treated as a decisive new-paragraph signal instead of being merged into the previous paragraph.

### Testing
- Added regression coverage for the full-document reprocess modal batch-size selector, scoped action-button label expansion, and the strengthened OCR prompt rules.
- Verified the full automated suite (`46` tests), server syntax, and production build before release.

## v1.3.0 - 2026-03-31

### Added
- New `Labeling` settings tab with automatic AI-based document labeling, label creation, and label management.
- Manual document labels directly from the dashboard, including inline label chips under each title and a dedicated label picker modal.
- Persistent read/unread state with quick checkbox toggles from the main document list.
- Persistent document rename flows from both the dashboard and editor.
- Functional dashboard pagination with configurable page sizes (`10`, `15`, `25`, `50`, `100`, `150`) and a floating scroll-to-top action.
- New `Move` actions for folders and documents with destination picker modals.
- Full-document `Reprocess` action from the dashboard with explicit model selection.

### Changed
- Standardized OCR prompting across processing and reprocessing so paragraph reconstruction, de-hyphenation, indentation-aware paragraph detection, and multi-column reading rules are enforced everywhere.
- Switched the default processing model to `gemini-flash-lite-latest` throughout the app, while still honoring explicit user selection of the normal Flash model.
- Updated settings navigation so the previous settings surface now lives under the `AI` tab and labeling has its own dedicated tab.
- Improved the dashboard toolbar and mobile header layouts so primary controls stay aligned on small screens.

### Fixed
- Removed remaining `DocuClean AI` / `docucleanai` branding from user-visible outputs, including download/export metadata.
- Ensured edited document names, read state, and labels remain preserved while background OCR processing is still running.
- Made downloaded/exported content, manual prompts, and background processing flows respect the latest OCR reconstruction rules consistently.
- Cleaned App-level test mocks so new labeling settings do not generate fetch errors during validation.
- Hardened Docker release builds by switching container dependency installs to lockfile-based `npm ci` with retry settings for registry fetches.

### Testing
- Added regression coverage for dashboard labeling, labeling settings, document-label preservation during background processing, and App polling with labeling-aware settings loads.
- Verified the full automated suite (`45` tests), server syntax, and production build before release.

## v1.2.2 - 2026-03-25

### Fixed
- Reworked the editor header so very long document titles stay truncated and no longer push `Save`, `Export`, or `Reprocess` into unstable wraps on compact layouts.
- Changed compact export behavior to a fixed bottom sheet, avoiding the broken dropdown loop when the header had insufficient horizontal or vertical space.
- Stabilized the editor action bar on smaller screens with a responsive grid so the same overflow bug does not reappear on mobile.

### Testing
- Added regression coverage for long-title editor headers and compact export behavior.

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

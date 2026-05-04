# Changelog

## v1.5.0 - 2026-05-04

### Changed
- Default pages-per-batch is now 15 instead of 1 for faster Gemini processing out of the box.
- Raised default OCR page-processing concurrency from 2 to 5 and PDF rasterization concurrency from 1 to 2 for smoother multi-document uploads.
- Increased per-document PDF render concurrency from 2 to 4 pages for faster rasterization of large PDFs.

### Fixed
- Fixed "Page count unavailable" banner blocking the page summary when only some files fail client-side page counting — now shows a partial count with a note instead of hiding everything.

## v1.4.5 - 2026-05-04

### Added
- Added an initial-processing retry selector to uploads so each document can choose its own retry count and new uploads default to `0` retries.
- Added a reprocess error dialog that preserves the raw server response, including HTML fallback pages returned instead of JSON.

### Changed
- Reduced dashboard polling latency for in-flight documents and surfaced a retry-queue label while pages are waiting for their next OCR attempt.
- Queued PDF rasterization per document and added a global OCR page-processing slot limit so multi-document runs stop oversubscribing CPU and provider capacity.

### Fixed
- Fixed initial document processing so failed pages are only retried when the upload explicitly requested retries.
- Fixed page reprocessing so non-JSON responses are reported clearly instead of crashing on `Unexpected token '<'`.

### Testing
- Added regression coverage for upload retry selection, document-level retry defaults, retry-queue rendering, and raw reprocess error details.
- Verified focused processing, dashboard, editor, upload, and service regressions plus the production build.

## v1.4.4 - 2026-05-04

### Added
- Added a retry-count selector to page-level reprocessing so manual page retries default to `0` extra attempts and can be increased per run.

### Changed
- Reworked manual page reprocessing feedback so the progress overlay now shows the current retry attempt when a page is retried.

### Fixed
- Fixed page reprocessing so it no longer accepts OCR responses that return no text unless the page was explicitly classified as blank.
- Fixed manual page reprocessing so OCR/provider errors are surfaced back to the editor with the actual page-specific message instead of a generic failure.
- Fixed manual page reprocessing so the first failed page is brought back into view after refresh, making the persisted error state visible immediately.

### Testing
- Added regression coverage for empty OCR responses during processing, default page-reprocess option inheritance, retry selection, and page-level error reporting.
- Verified focused regression tests and production build before release.

## v1.4.3 - 2026-05-04

### Added
- Added per-document upload progress cards that track PDF rasterization and OCR page processing after files are queued.

### Changed
- Moved PDF rasterization fully into the background upload pipeline so large PDF uploads return earlier and progress can be polled incrementally.
- Changed the upload progress UI from a blocking full-screen modal to a non-blocking floating panel once documents are already queued.
- Updated dashboard processing bars so documents in the rasterization phase are shown as `Uploading` instead of generic processing.

### Fixed
- Fixed false `Failed to upload` client errors that could appear even when the server had already persisted the document and continued processing it.
- Fixed the dashboard state so queued documents are inserted or recovered immediately without requiring a manual page refresh.
- Fixed resume logic so OCR does not start for documents whose source PDF pages are still being rasterized.

### Testing
- Added regression coverage for upload-progress polling recovery, source-rasterization document state normalization, and rasterization progress callbacks.
- Verified focused regression tests plus production build before release.

## v1.4.0 - 2026-04-01

### Added
- Added full-text dashboard search that can be toggled on demand, so users can switch between lightweight filename search and OCR-content search without changing the core list workflow.
- Added dashboard filters for labels, status, date range, and folder selection, making large document libraries much easier to narrow down.
- Added local OCR provider support for `LM Studio` and `Ollama`, including provider selection, default-model selection, autodetection of installed local models, and configurable host/port settings.
- Added page-count summaries during upload so the UI shows how many pages are in the selected document set before users choose `Pages Processed At Once`.

### Changed
- Expanded the OCR settings surface so `Gemini`, `LM Studio`, and `Ollama` can all be managed from Settings with a shared default-provider workflow.
- Reworked the dashboard header to place the search bar directly between `Home` and the creation actions, reclaiming vertical space and removing an unnecessary toolbar row.
- Reworked the upload screen layout so the drag-and-drop panel and processing-settings panel are vertically centered within the available viewport space.
- Refreshed the README with a more product-oriented presentation, improved setup guidance, local-provider documentation, and embedded screenshots.

### Fixed
- Fixed mobile document cards so they no longer overflow horizontally on narrow devices when long names or controls are present.
- Fixed local-provider autodetection so `LM Studio` and `Ollama` use the host and port currently being edited in Settings instead of only the last saved values.
- Fixed the upload flow to surface document page counts before processing, giving users the context needed to choose sensible parallel page batch sizes.

### Testing
- Added regression coverage for dashboard full-text search and filters, OCR provider settings and autodetection, local OCR provider service calls, upload page-count summaries, and the updated dashboard toolbar layout.
- Verified the full automated suite (`61` tests) and production build before release.

## v1.3.4 - 2026-03-31

### Changed
- Replaced the pixel-based split-columns pipeline with a Gemini-driven layout-order flow that keeps the full page intact and asks the model to return explicit `columnIndex` and `readingOrder` metadata for each block.
- Updated the OCR schema and prompt so column metadata is only required when `Split columns before OCR` is enabled, while the normal single-page OCR flow keeps the simpler block format.

### Fixed
- Stopped the clean-text reconstruction step from reordering column-mode blocks geometrically after OCR; when Gemini returns `readingOrder`, that order is now respected directly instead of mixing left and right columns again.
- Removed the previous cropped-column `singleColumn` path so column-mode behavior no longer depends on brittle gutter detection or local crop coordinates.

### Testing
- Updated the prompt-builder regression coverage for the new column metadata instructions and verified the full automated suite (`47` tests).

## v1.3.3 - 2026-03-31

### Fixed
- Replaced the unreliable Gemini-based column detection with deterministic pixel-level analysis using `sharp` — the new approach scans vertical brightness profiles to find gutter whitespace, producing correct left-to-right column ordering every time.
- Added a dedicated `singleColumn` OCR prompt mode so each cropped column is sent to Gemini with explicit "read top to bottom, do not look for multiple columns" instructions, preventing the model from re-splitting or misordering the isolated column image.

### Testing
- Added coverage for the `singleColumn` prompt builder mode (`47` tests total).
- Verified the full automated suite, TypeScript compilation, and server syntax after the column detection rewrite.

## v1.3.2 - 2026-03-31

### Added
- Added an optional `Split columns before OCR` processing mode for new uploads and full-document reprocessing, so each detected column is cropped and sent to Gemini independently from left to right.

### Changed
- Added server-side automatic column detection and image cropping before OCR, using Gemini for layout detection plus `sharp` to extract each column region.

### Fixed
- Reduced OCR ordering mistakes on multi-column pages by preventing Gemini from jumping across gutters and by feeding each full column as an isolated input.

### Testing
- Verified the automated suite (`46` tests), TypeScript compilation, and server syntax after the multi-column processing changes.

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

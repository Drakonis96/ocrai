
-1

# DocuClean AI

DocuClean AI is a document cleanup and note-taking assistant. Upload PDFs or images, let Gemini OCR extract page content with layout-aware blocks, and review the cleaned text inside a simple editor. Documents, folders, and exportable notes are stored locally on the server so you can organize and download everything in one place.

## How it works
- **Upload & ingestion**: From the dashboard you can create folders, upload PDFs or images, and pick the Gemini model used for OCR. PDFs are converted to page images in the browser before being sent to the backend.
- **Background processing**: The backend queues each document for processing, saves page images under `data/<docId>`, and calls the configured Gemini model (`gemini-2.5-flash` by default) to produce labeled text blocks for every page.
- **Editing & export**: Open a processed document to view or tweak the reconstructed text (including headers, captions, and footnotes). You can export all ready documents as a ZIP of `.txt` files or download individual markdown files generated per page under `data/<docId>`.
- **Storage model**: All metadata and generated files live under the `data/` directory (one subfolder per document) alongside a `metadata.json` file that tracks status, pages, and saved edits.

## Requirements
- Node.js 20+
- A Gemini API key exposed as `GEMINI_API_KEY` in `.env.local` or your environment
- (Optional) Docker and Docker Compose for containerized deployments

## Local development with Vite
1. Install dependencies: `npm install`.
2. Create `.env.local` with your API key:
   ```
   GEMINI_API_KEY=your-key-here
   ```
3. Start the Vite dev server and API in one step:
   ```
   npm run dev
   ```
   - Vite serves the React UI.
   - The Express server (`server.js`) proxies Gemini requests and persists uploads under `data/`.
4. Open the app at the URL printed by Vite (typically `http://localhost:5173`).

## Production build
1. Build the frontend: `npm run build`.
2. Start the bundled server that serves the built assets and API on port `5037`:
   ```
   npm start
   ```
3. Persisted files remain in `data/`. Make sure the `data/` directory is writable in your environment.

## Docker
### Build and run
```bash
docker build -t docuclean-ai .
docker run -p 5037:5037 --env-file .env.local -v $(pwd)/data:/app/data docuclean-ai
```

### Docker Compose
```bash
docker compose up --build
```
- Exposes the app on port `5037`.
- Binds `./data` on the host for persistent storage.
- Mounts `.env.local` so `GEMINI_API_KEY` is available inside the container.
- Restarts automatically unless stopped.

## Troubleshooting
- If uploads never finish, confirm `GEMINI_API_KEY` is set and the key has access to the selected Gemini models.
- Ensure the `data/` directory exists and is writable so the server can store images, markdown, and metadata.
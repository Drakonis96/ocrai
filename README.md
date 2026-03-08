<p align="center">
  <img src="images/logo.png" alt="ocrAI Logo" width="150"/>
</p>

# ocrAI

ocrAI is a document cleanup and note-taking assistant. Upload PDFs or images, let Gemini OCR extract page content with layout-aware blocks, and review the cleaned text inside a simple editor. Documents, folders, and exportable notes are stored locally on the server so you can organize and download everything in one place.

## How it works
- **Upload & ingestion**: From the dashboard you can create folders, upload PDFs or images, and pick the Gemini model used for OCR. PDFs are converted to page images in the browser before being sent to the backend.
- **Background processing**: The backend queues each document for processing, saves page images under `data/<docId>`, and calls the configured Gemini model (`gemini-2.5-flash` by default) to produce labeled text blocks for every page.
- **Editing & export**: Open a processed document to view or tweak the reconstructed text (including headers, captions, and footnotes). You can export all ready documents as a ZIP of `.txt` files or download individual markdown files generated per page under `data/<docId>`.
- **Storage model**: All metadata and generated files live under the `data/` directory (one subfolder per document) alongside a `metadata.json` file that tracks status, pages, and saved edits.

## Features
- **Authentication**: Secure login system to protect your documents
- **Document processing**: AI-powered OCR using Google's Gemini models
- **Editing & organization**: Review and edit extracted text in a built-in editor
- **Export capabilities**: Download documents individually or as a ZIP archive
## Local development with Vite
1. Install dependencies: `npm install`.
2. Create `.env.local` with your API key and login credentials:
   ```env
   GEMINI_API_KEY=your-gemini-api-key-here
   ADMIN_USERNAME=your-username
   ADMIN_PASSWORD=your-password
   ```
3. Start the Vite dev server and API in one step:
## Configuration
Create a `.env.local` file in the root directory with the following variables:

```env
# Gemini API Key (required)
GEMINI_API_KEY=your-gemini-api-key-here

# Authentication credentials (required)
ADMIN_USERNAME=your-username
ADMIN_PASSWORD=your-password
```

**Important**: Keep your `.env.local` file secure and never commit it to version control.

## Local development with Vite
1. Install dependencies: `npm install`.
2. Create `.env.local` with your API key:
   ```
   GEMINI_API_KEY=your-key-here
   ```
   npm run dev
   ```
   - Vite serves the React UI.
   - The Express server (`server.js`) proxies Gemini requests and persists uploads under `data/`.
4. Open the app at the URL printed by Vite (typically `http://localhost:5173`).
5. Log in using the credentials you set in `.env.local`.
   - The Express server (`server.js`) proxies Gemini requests and persists uploads under `data/`.
4. Open the app at the URL printed by Vite (typically `http://localhost:5173`).

## Production build
1. Build the frontend: `npm run build`.
2. Start the bundled server that serves the built assets and API on port `5037`:
   ```
   npm start
   ```
### Build and run
```bash
docker build -t ocrai .
docker run -p 5037:5037 --env-file .env.local -v $(pwd)/data:/app/data ocrai
```bash
docker build -t docuclean-ai .
docker run -p 5037:5037 --env-file .env.local -v $(pwd)/data:/app/data docuclean-ai
```bash
docker compose up --build
```
- Exposes the app on port `5037`.
- Binds `./data` on the host for persistent storage.
- Mounts `.env.local` so `GEMINI_API_KEY`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` are available inside the container.
- Restarts automatically unless stopped.
- Binds `./data` on the host for persistent storage.
- Mounts `.env.local` so `GEMINI_API_KEY` is available inside the container.
- Restarts automatically unless stopped.
## Troubleshooting
- **Cannot log in**: Verify that `ADMIN_USERNAME` and `ADMIN_PASSWORD` are correctly set in `.env.local`.
- **Uploads never finish**: Confirm `GEMINI_API_KEY` is set and the key has access to the selected Gemini models.
- **Storage issues**: Ensure the `data/` directory exists and is writable so the server can store images, markdown, and metadata.
- **Environment variables not loading**: Make sure `.env.local` is in the root directory and properly formatted.ls.
- Ensure the `data/` directory exists and is writable so the server can store images, markdown, and metadata.

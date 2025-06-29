<div align="center">
  <img src="/backend/static/logo.png" alt="ocrAI Logo" width="250">
</div>

# ocrAI 🤖

A simple web app combining OCR, AI-assisted correction, translation and optional compression with an intuitive interface.

## Contents
- [Features](#features)
- [Installation](#installation)
- [How to Use](#how-to-use)
- [Screenshots](#screenshots)
- [License](#license)

## Features
- **File Management**: upload PDFs or images, unique file names and one-click cleanup.
- **OCR Processing Modes**
  - **OCR (Tesseract Only)**: extract text and embed it into the PDF.
  - **OCR + AI**: Tesseract followed by Gemini AI correction embedded into the PDF.
  - **AI (Full AI OCR)**: Gemini AI processes each page and outputs Markdown.
  - **Compression**: optional PDF or image compression after processing.
  - All modes show real-time emoji progress.
- **TXT to PDF**: convert TXT files into clean PDFs.
- **Translation**: translate PDF or TXT documents page by page.
- **Configuration**: manage prompts, models and languages.

## Installation

### Windows or macOS (Docker Desktop)
1. Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
   Launch Docker Desktop once the installation completes.
2. Download this repository:
   - **Option A:** click the green **Code** button on GitHub and choose **Download ZIP**. Unzip the file anywhere you like.
   - **Option B:** if you have Git installed, run:
     ```bash
     git clone https://github.com/Drakonis96/ocrai.git
     ```
3. Open the `ocrai` folder and edit the `docker-compose.yml` file with Notepad (Windows) or TextEdit (macOS).
   Replace `your_gemini_api_key` with your own Gemini API key.
4. Open a terminal inside this folder:
   - **Windows:** right-click the folder and select **Open PowerShell window here**.
   - **macOS:** open **Terminal**, then `cd` into the folder.
5. Run the application:
   ```bash
   docker compose up --build
   ```
   The first run may take a few minutes while Docker downloads everything.
6. When the terminal shows that the app is running, open your web browser at <http://localhost:5015>.
7. To stop the app later, press `Ctrl+C` in the terminal and run `docker compose down`.

## How to Use
### OCR Mode
1. Go to the **OCR** tab.
2. Upload a PDF or image.
3. Select **OCR** and click **Upload and process**.

### OCR + AI Mode
1. Go to the **OCR** tab.
2. Upload a file and choose **OCR + AI**.
3. Pick an AI prompt and start processing.

### AI Mode
1. Go to the **OCR** tab.
2. Upload a file and select **AI**.
3. Choose a prompt and process the file.
4. Convert the resulting Markdown TXT to PDF using the **TXT to PDF** tab if needed.

### Optional Compression
1. Enable compression in the **OCR** tab.
2. Adjust DPI, quality and format as desired.
3. Process the file in any mode; the output will be compressed if enabled.

## Screenshots
![UI](screenshots/Screenshot%201.png)
![Processing](screenshots/Screenshot%202.png)
![Results](screenshots/Screenshot%203.png)

## License
This project is licensed under the **GNU GENERAL PUBLIC LICENSE Version 3**. See the [LICENSE](LICENSE) file for details.

<center>
  <img src="logo.png" alt="ocrAI Logo" width="150">
</center>

# ocrAI 🤖

ocrAI is a unified web application that combines Optical Character Recognition (OCR) and Artificial Intelligence (AI) to process and translate documents, offering a simple, intuitive interface with real-time feedback (even with emojis!).

## Key Features

- **File Management** 📤  
  - Upload PDF or image files using drag & drop or manual selection.
  - Files are saved with unique names to avoid overwrites.
  - The "Delete All Files" button removes all files from both the "uploads" and "outputs" folders.

- **OCR Processing Modes** 🔍  
  - **OCR (Tesseract Only):**  
    Extracts text with Tesseract and embeds it into the PDF using OCRmyPDF. The TXT file contains the raw OCR output.
  - **OCR + AI (Tesseract + AI):**  
    Uses Tesseract to extract text and then sends it to an AI model (e.g., Gemini) to correct and format the content. The TXT file shows the corrected and structured text, while the PDF retains the original Tesseract output.
  - **AI (Full AI OCR):**  
    Leverages the AI model's OCR capabilities to process the document page by page. The TXT file includes clear page markers, making it easy to compare with the original document, and the original PDF is preserved.
  - All modes display real-time progress updates with emojis (e.g., 📤, ✅, 🤖, 🎉) and run in the background.

- **Translation** 🌐  
  - Translates PDF or TXT documents page by page.
  - You can upload a new file or select one from the list of processed files.
  - Progress updates are displayed, and a TXT file with the final translation (including page markers) is generated.

- **Configuration** ⚙️  
  - Manage and add new AI models (including the ability to add or delete Gemini models) and languages.
  - Update or add custom prompts for OCR, correction, and translation functions.
  - Download or upload the complete configuration (which includes prompts and models).

## How to Use the Application

1. **Upload and Process Files:**
   - Go to the **OCR** tab.
   - Select your file (PDF or image).
   - Choose one of the processing modes:
     - **OCR** (Tesseract Only)
     - **OCR + AI** (Tesseract + AI for correction)
     - **AI** (Full AI OCR)
   - Select the desired prompt.
   - Click **Upload and process** and watch the real-time progress.

2. **Translate Documents:**
   - Go to the **Translation** tab.
   - Upload a new file or select one from the list of processed files.
   - Choose the target language and translation prompt.
   - Click **Translate** and observe the progress as each page is processed.
   - The result is saved in a TXT file with page markers.

3. **View Processed Files:**
   - Go to the **Processed Files** tab.
   - Download or delete files (with confirmation prompts).

4. **Configure the Application:**
   - Go to the **Configurations** tab.
   - Add, edit, or delete custom prompts.
   - Manage Gemini models: add new models or delete existing ones.
   - Configure languages and download or upload the complete configuration.

## How to Run ocrAI

### Prerequisites
- Docker
- Docker Compose

### Build and Run

```bash
docker-compose up --build
Then, open your browser at http://localhost:5015 to start using ocrAI.

Technologies Used
Frontend: React, Axios
Backend: Flask, Python
OCR: Tesseract, pdf2image, OCRmyPDF
AI: OpenAI, Gemini, Mistral APIs
Containerization: Docker, Docker Compose
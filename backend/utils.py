# backend/utils.py
import os
import time
import pytesseract
from PIL import Image
from pdf2image import convert_from_path
import shutil
import asyncio
import uuid
import subprocess
import base64
import re
from models import get_prompt

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER

# Se agrega BeautifulSoup para procesar HTML
from bs4 import BeautifulSoup

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "outputs"

def encode_image(file_path):
    with open(file_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

def run_tesseract(file_path):
    """
    Si el archivo es un PDF, se realiza OCR página a página añadiendo al principio de cada una
    la cabecera con el formato [Page 0001], [Page 0002], etc.
    Para otros formatos se realiza OCR normal.
    """
    extracted_text = ""
    if file_path.lower().endswith(".pdf"):
        try:
            pages = convert_from_path(file_path)
            for i, page in enumerate(pages, start=1):
                page_text = pytesseract.image_to_string(page, lang='eng')
                extracted_text += f"[Page {i:04d}]\n{page_text}\n\n"
        except Exception as e:
            extracted_text = f"❌ Error processing PDF: {str(e)}"
    else:
        image = Image.open(file_path)
        extracted_text = pytesseract.image_to_string(image, lang='eng')
    return extracted_text

def call_api_correction(api, model, text, prompt_key="ocr_correction"):
    prompt = get_prompt(prompt_key) + text
    try:
        from google import genai
    except ImportError:
        raise ImportError("Please install 'google-genai' to use Gemini.")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    response = client.models.generate_content(model=model, contents=[prompt])
    return response.text

def call_api_ocr(api, model, file_path, prompt_key="ocr"):
    try:
        from google import genai
    except ImportError:
        raise ImportError("Please install 'google-genai' to use Gemini.")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    file_ref = client.files.upload(file=file_path)
    prompt = get_prompt(prompt_key)
    response = client.models.generate_content(model=model, contents=[file_ref, prompt])
    return response.text

def call_api_translation(api, model, text, target_language, prompt_key="translation"):
    prompt_template = get_prompt(prompt_key)
    prompt = prompt_template.format(target_language=target_language) + text
    try:
        from google import genai
    except ImportError:
        raise ImportError("Please install 'google-genai' to use Gemini.")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    response = client.models.generate_content(model=model, contents=[prompt])
    return response.text

def embed_ocr_in_pdf(input_pdf, output_pdf):
    try:
        subprocess.run(["ocrmypdf", input_pdf, output_pdf], check=True)
        return True
    except Exception as e:
        return False

def ocr_file_by_pages(file_path, api, model, prompt_key, update_progress, is_cancelled):
    final_text = ""
    if file_path.lower().endswith(".pdf"):
        try:
            pages = convert_from_path(file_path)
        except Exception as e:
            return f"❌ Error processing PDF: {str(e)}"
        total = len(pages)
        for i, page in enumerate(pages, start=1):
            if is_cancelled():
                update_progress(0, "⏹️ Cancelled")
                return "Process cancelled."
            temp_filename = os.path.join(OUTPUT_FOLDER, f"temp_page_{uuid.uuid4().hex}.png")
            page.save(temp_filename, "PNG")
            page_text = call_api_ocr(api, model, temp_filename, prompt_key)
            final_text += f"[Page {i:04d}]\n{page_text}\n\n"
            os.remove(temp_filename)
            progress = int((i / total) * 100)
            update_progress(progress, f"📄 Processed page {i} of {total}.")
            time.sleep(1)
        return final_text
    else:
        return call_api_ocr(api, model, file_path, prompt_key)

def translate_file_by_pages(file_path, api, model, target_language, prompt_key, update_progress, is_cancelled):
    final_translation = ""
    if file_path.lower().endswith(".pdf"):
        try:
            pages = convert_from_path(file_path)
        except Exception as e:
            return f"❌ Error processing PDF: {str(e)}"
        total = len(pages)
        for i, page in enumerate(pages, start=1):
            if is_cancelled():
                update_progress(0, "⏹️ Cancelled")
                return "Process cancelled."
            temp_filename = os.path.join(OUTPUT_FOLDER, f"temp_page_{uuid.uuid4().hex}.png")
            page.save(temp_filename, "PNG")
            page_text = pytesseract.image_to_string(page, lang='eng')
            translated_page = call_api_translation(api, model, page_text, target_language, prompt_key)
            final_translation += f"[Page {i:04d}]\n{translated_page}\n\n"
            os.remove(temp_filename)
            progress = int((i / total) * 100)
            update_progress(progress, f"📄 Processed page {i} of {total}.")
            time.sleep(1)
        return final_translation
    elif file_path.lower().endswith(".txt"):
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        translated = call_api_translation(api, model, text, target_language, prompt_key)
        update_progress(100, "🎉 Process completed")
        return f"[Page {1:04d}]\n{translated}"
    else:
        return "Unsupported file type for translation."

def process_file(file_path, api, model, mode, prompt_key, update_progress, is_cancelled):
    """
    NOTA: Ahora solo usamos [Page XXXX] al inicio de cada página (por Tesseract).
    """
    if is_cancelled():
        update_progress(0, "⏹️ Cancelled")
        return "Process cancelled."
    update_progress(25, "📤 File uploaded.")
    base_name = os.path.splitext(os.path.basename(file_path))[0]

    if mode == "OCR":
        processed_text = run_tesseract(file_path)
        if is_cancelled():
            update_progress(25, "⏹️ Cancelled")
            return "Process cancelled."
        update_progress(50, "✅ Tesseract OCR completed.")
        pdf_output = os.path.join(OUTPUT_FOLDER, base_name + "_ocr.pdf")
        if file_path.lower().endswith(".pdf"):
            if embed_ocr_in_pdf(file_path, pdf_output):
                update_progress(95, "📄 OCR embedded into PDF.")
            else:
                shutil.copy(file_path, pdf_output)
                update_progress(95, "⚠️ Failed to embed OCR; original PDF copied.")
        else:
            shutil.copy(file_path, pdf_output)

    elif mode == "OCR + AI":
        processed_text = run_tesseract(file_path)
        if is_cancelled():
            update_progress(25, "⏹️ Cancelled")
            return "Process cancelled."
        update_progress(50, "✅ Tesseract OCR completed.")
        processed_text = call_api_correction(api, model, processed_text, prompt_key)
        pdf_output = os.path.join(OUTPUT_FOLDER, base_name + "_ocr.pdf")
        if file_path.lower().endswith(".pdf"):
            if embed_ocr_in_pdf(file_path, pdf_output):
                update_progress(95, "📄 OCR embedded into PDF.")
            else:
                shutil.copy(file_path, pdf_output)
                update_progress(95, "⚠️ Failed to embed OCR; original PDF copied.")
        else:
            shutil.copy(file_path, pdf_output)

    elif mode == "AI":
        update_progress(25, "📂 File ready for full AI processing.")
        if file_path.lower().endswith(".pdf"):
            processed_text = ocr_file_by_pages(file_path, api, model, prompt_key, update_progress, is_cancelled)
        else:
            processed_text = call_api_ocr(api, model, file_path, prompt_key)

    else:
        processed_text = "Unrecognized processing mode."
        update_progress(25, "❌ Error: Unrecognized mode.")

    if is_cancelled():
        update_progress(75, "⏹️ Cancelled")
        return "Process cancelled."

    update_progress(75, "🤖 API processing completed.")

    # Guardar el TXT final
    txt_file = os.path.join(OUTPUT_FOLDER, base_name + ".txt")
    with open(txt_file, "w", encoding="utf-8") as f:
        f.write(processed_text)

    update_progress(100, "🎉 Process completed")
    return processed_text

def organize_paragraphs(text):
    """
    Organiza el texto plano en párrafos de forma más flexible.
    Si se detecta doble salto de línea se usa como separador;
    si no, se procesa línea a línea para unirlas en párrafos, creando uno nuevo cuando:
      - Se encuentra una línea vacía, o
      - La línea actual termina en punto.
    Dentro de cada párrafo se unen las líneas; se inserta un <br/> si la línea termina en punto.
    """
    text = text.strip()
    paragraphs = []
    if "\n\n" in text:
        blocks = re.split(r'\n\s*\n', text)
    else:
        lines = text.splitlines()
        blocks = []
        buffer = ""
        for line in lines:
            stripped = line.strip()
            if not stripped:
                if buffer:
                    blocks.append(buffer)
                    buffer = ""
            else:
                if buffer and buffer.endswith("."):
                    blocks.append(buffer)
                    buffer = stripped
                else:
                    if buffer:
                        buffer += " " + stripped
                    else:
                        buffer = stripped
        if buffer:
            blocks.append(buffer)
    for block in blocks:
        line_list = block.splitlines()
        if len(line_list) == 1:
            paragraphs.append(line_list[0].strip())
        else:
            new_block = ""
            for i, line in enumerate(line_list):
                line = line.strip()
                if not line:
                    continue
                if i < len(line_list) - 1:
                    if line.endswith("."):
                        new_block += line + "<br/>"
                    else:
                        new_block += line + " "
                else:
                    new_block += line
            paragraphs.append(new_block.strip())
    return paragraphs

def convert_txt_to_pdf(txt_file_path):
    """
    Convierte un archivo TXT a PDF siguiendo estas reglas:
      - Se detecta el patrón [Page XXXX] para separar páginas (solo al inicio).
      - Este marcador se convierte en un encabezado (h1).
      - Si el contenido proviene de un bloque markdown con ```html se elimina ese marcador y
        se parsea con BeautifulSoup para generar párrafos independientes.
      - Para contenido en texto plano se organiza en párrafos con organize_paragraphs.
      - Se inserta un PageBreak después de cada bloque de página.
    """
    with open(txt_file_path, "r", encoding="utf-8") as f:
        content = f.read()

    base_name = os.path.splitext(os.path.basename(txt_file_path))[0]
    output_pdf = os.path.join(OUTPUT_FOLDER, base_name + "_txt.pdf")
    doc = SimpleDocTemplate(
        output_pdf,
        pagesize=A4,
        rightMargin=40, leftMargin=40,
        topMargin=40, bottomMargin=40
    )
    styles = getSampleStyleSheet()
    header_styles = {
        "h1": ParagraphStyle('Heading1', parent=styles['Heading1'], alignment=TA_CENTER),
        "h2": ParagraphStyle('Heading2', parent=styles['Heading2'], alignment=TA_CENTER),
        "h3": ParagraphStyle('Heading3', parent=styles['Heading3'], alignment=TA_CENTER),
        "h4": ParagraphStyle('Heading4', parent=styles['Heading4'], alignment=TA_CENTER),
        "h5": ParagraphStyle('Heading5', parent=styles['Heading5'], alignment=TA_CENTER),
        "h6": ParagraphStyle('Heading6', parent=styles['Heading6'], alignment=TA_CENTER),
    }
    normal_style = ParagraphStyle(
        'Normal',
        parent=styles['Normal'],
        alignment=TA_JUSTIFY,
        leading=15,
        leftIndent=20
    )

    flowables = []
    # Patrón para detectar el marcador [Page XXXX]
    page_pattern = re.compile(r'\[Page\s+\d{4}\]')
    parts = re.split(r'(\[Page\s+\d{4}\])', content)
    first_page_encountered = False

    for part in parts:
        part = part.strip()
        if not part:
            continue

        if page_pattern.fullmatch(part):
            if first_page_encountered:
                flowables.append(PageBreak())
            else:
                first_page_encountered = True
            header_para = Paragraph(part, styles['Heading1'])
            flowables.append(header_para)
            flowables.append(Spacer(1, 12))
        else:
            if part.startswith("```"):
                lines = part.splitlines()
                if lines and lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]
                part = "\n".join(lines)
            # Si parece HTML, se procesa para separar cada etiqueta de interés
            if re.search(r'<\s*html', part, re.IGNORECASE) or re.search(r'<\s*(p|h[1-6])', part, re.IGNORECASE):
                if not part.lower().startswith("<html"):
                    part = "<html>" + part + "</html>"
                soup = BeautifulSoup(part, "html.parser")
                for element in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p']):
                    if element.name.lower() in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                        style = header_styles.get(element.name.lower(), styles['Heading1'])
                    else:
                        style = normal_style
                    text_content = element.get_text().strip()
                    if text_content:
                        flowables.append(Paragraph(text_content, style))
                        flowables.append(Spacer(1, 12))
            else:
                # Texto plano -> organizar en párrafos
                paragraphs = organize_paragraphs(part)
                for para_text in paragraphs:
                    if para_text:
                        flowables.append(Paragraph(para_text, normal_style))
                        flowables.append(Spacer(1, 12))

    doc.build(flowables)
    return output_pdf

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
    If the file is a PDF, perform OCR page by page and add a "Page X:" header;
    otherwise, perform OCR normally.
    """
    extracted_text = ""
    if file_path.lower().endswith(".pdf"):
        try:
            pages = convert_from_path(file_path)
            for i, page in enumerate(pages, start=1):
                page_text = pytesseract.image_to_string(page, lang='eng')
                extracted_text += f"Page {i}:\n{page_text}\n\n"
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
            final_text += f"Page {i}:\n{page_text}\n\n"
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
            final_translation += f"Page {i}:\n{translated_page}\n\n"
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
        return f"Page 1:\n{translated}"
    else:
        return "Unsupported file type for translation."

def process_file(file_path, api, model, mode, prompt_key, update_progress, is_cancelled):
    if is_cancelled():
        update_progress(0, "⏹️ Cancelled")
        return "Process cancelled."
    update_progress(25, "📤 File uploaded.")
    base_name = os.path.splitext(os.path.basename(file_path))[0]

    if mode == "OCR":
        # Process using tesseract with page-structure if PDF.
        processed_text = run_tesseract(file_path)
        if is_cancelled():
            update_progress(25, "⏹️ Cancelled")
            return "Process cancelled."
        update_progress(50, "✅ Tesseract OCR completed.")
        # Generate PDF copy as before.
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
        # In AI mode, do not generate a new PDF.
    else:
        processed_text = "Unrecognized processing mode."
        update_progress(25, "❌ Error: Unrecognized mode.")

    if is_cancelled():
        update_progress(75, "⏹️ Cancelled")
        return "Process cancelled."

    update_progress(75, "🤖 API processing completed.")

    # Write the output TXT file (it is already structured by page in OCR and OCR+AI modes)
    txt_file = os.path.join(OUTPUT_FOLDER, base_name + ".txt")
    with open(txt_file, "w", encoding="utf-8") as f:
        f.write(processed_text)
    update_progress(100, "🎉 Process completed")
    return processed_text

def process_text(text):
    lines = text.splitlines()
    processed_lines = []
    buffer = ""
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if buffer:
                processed_lines.append(buffer)
                buffer = ""
            else:
                processed_lines.append("")
            continue
        if buffer:
            if buffer.endswith('.'):
                processed_lines.append(buffer)
                buffer = stripped
            else:
                buffer += " " + stripped
        else:
            buffer = stripped
    if buffer:
        processed_lines.append(buffer)
    return "\n".join(processed_lines)

def convert_txt_to_pdf(txt_file_path):
    """
    Se ha modificado para que, si el contenido del TXT está formateado en HTML,
    se interpreten los tags que indiquen títulos (<h1>, <h2>, etc.), párrafos (<p>)
    y saltos de página (<pagebreak> o div con clase "page-break").
    
    En caso de que el contenido sea texto plano y contenga patrones en el formato
    [Page X] (entre corchetes), se usará ese separador para dividir las páginas.
    El encabezado (sin los corchetes) se incluirá en la parte superior de cada página.
    """
    with open(txt_file_path, "r", encoding="utf-8") as f:
        content = f.read()

    base_name = os.path.splitext(os.path.basename(txt_file_path))[0]
    output_pdf = os.path.join(OUTPUT_FOLDER, base_name + "_txt.pdf")
    doc = SimpleDocTemplate(output_pdf, pagesize=A4,
                            rightMargin=40, leftMargin=40,
                            topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    # Estilos para encabezados
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
        leftIndent=20  # Sangría al inicio de cada párrafo
    )

    flowables = []
    # Detectamos si el contenido es HTML (buscando etiquetas comunes)
    is_html = any(tag in content.lower() for tag in ["<html", "<p", "<h1", "<h2", "<h3"])
    
    if is_html:
        soup = BeautifulSoup(content, "html.parser")
        body = soup.body if soup.body else soup
        for element in body.children:
            if element.name is None:
                text = element.strip()
                if text:
                    para = Paragraph(text, normal_style)
                    flowables.append(para)
                    flowables.append(Spacer(1, 12))
            elif element.name.lower() in ["h1", "h2", "h3", "h4", "h5", "h6"]:
                tag = element.name.lower()
                style = header_styles.get(tag, styles['Heading1'])
                para = Paragraph(element.decode_contents(), style)
                flowables.append(para)
                flowables.append(Spacer(1, 12))
            elif element.name.lower() == "p":
                para = Paragraph(element.decode_contents(), normal_style)
                flowables.append(para)
                flowables.append(Spacer(1, 12))
            elif element.name.lower() == "pagebreak" or (element.name.lower() == "div" and "page-break" in element.get("class", [])):
                flowables.append(PageBreak())
            else:
                text = element.get_text().strip()
                if text:
                    para = Paragraph(text, normal_style)
                    flowables.append(para)
                    flowables.append(Spacer(1, 12))
    else:
        # Si se detecta el patrón [Page X] en el contenido, se usa para dividir las páginas.
        if re.search(r'\[Page\s+\d+\]', content, re.IGNORECASE):
            # Dividir incluyendo el separador (usamos grupo de captura)
            parts = re.split(r'(\[Page\s+\d+\])', content, flags=re.IGNORECASE)
            current_header = ""
            for part in parts:
                part = part.strip()
                if not part:
                    continue
                # Si es un encabezado [Page X]
                if re.match(r'\[Page\s+\d+\]', part, re.IGNORECASE):
                    # Extraemos el número o texto sin los corchetes para usarlo como encabezado
                    current_header = part.strip("[]")
                    header_para = Paragraph(current_header, styles['Heading1'])
                    flowables.append(header_para)
                    flowables.append(Spacer(1, 12))
                else:
                    # Es el contenido de la página
                    processed = process_text(part)
                    para = Paragraph(processed.replace("\n", "<br/>"), normal_style)
                    flowables.append(para)
                    flowables.append(Spacer(1, 12))
                    flowables.append(PageBreak())
        else:
            # Si no se detectan separadores, se usa el método anterior basado en "Page X:" sin corchetes.
            pages = re.split(r'(?i)Page\s+\d+:\s*', content)
            if pages and pages[0].strip() == "":
                pages = pages[1:]
            if len(pages) <= 1:
                pages = content.split("\n\n")
            processed_pages = [process_text(page) for page in pages if page.strip() != ""]
            for i, page_text in enumerate(processed_pages, start=1):
                header = Paragraph(f"PAGE {i}", styles['Heading1'])
                flowables.append(header)
                flowables.append(Spacer(1, 12))
                para = Paragraph(page_text.replace("\n", "<br/>"), normal_style)
                flowables.append(para)
                if i < len(processed_pages):
                    flowables.append(Spacer(1, 24))
                    flowables.append(PageBreak())

    doc.build(flowables)
    return output_pdf

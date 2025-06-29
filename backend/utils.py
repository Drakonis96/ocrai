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

def embed_ai_text_in_pdf(input_pdf: str, output_pdf: str) -> bool:
    from pathlib import Path
    backend_path = Path(__file__).parent
    sidecar = Path(output_pdf).with_suffix('.txt')
    import subprocess
    import os
    env = os.environ.copy()
    env['PYTHONPATH'] = f"{backend_path}:{env.get('PYTHONPATH','')}"
    try:
        subprocess.run([
            'ocrmypdf',
            '--plugin', 'backend.my_ai_ocr_plugin',
            '--pdf-renderer', 'hocr',
            '--force-ocr',
            '--sidecar', str(sidecar),
            input_pdf, output_pdf
        ], check=True, env=env)
        return True
    except subprocess.CalledProcessError as e:
        print("OCRmyPDF failed:", e)
        return False

def compress_pdf_images(input_pdf, output_pdf, target_dpi=150, fmt='jpeg', quality=85,
                        keep_original=False, preserve_metadata=False):
    """Compress images inside a PDF using Pillow with optional mozjpeg/pngquant."""
    import tempfile
    import subprocess
    import pikepdf
    from pikepdf import PdfImage, Name

    tmpdir = tempfile.mkdtemp()
    pdf = pikepdf.open(input_pdf)
    for page in pdf.pages:
        for name, img in page.images.items():
            pdf_img = PdfImage(img)
            pil_img = pdf_img.as_pil_image()

            # Downsample image to target DPI if higher
            orig_dpi = pil_img.info.get('dpi', (72, 72))[0]
            if orig_dpi > target_dpi:
                scale = target_dpi / orig_dpi
                new_size = (
                    max(1, int(pil_img.width * scale)),
                    max(1, int(pil_img.height * scale))
                )
                pil_img = pil_img.resize(new_size, Image.LANCZOS)

            if not preserve_metadata and 'exif' in pil_img.info:
                pil_img.info.pop('exif')

            # Save the optimized image into an in-memory buffer
            from io import BytesIO
            buf = BytesIO()
            if fmt.lower() == 'jpeg':
                pil_img = pil_img.convert('RGB')
                pil_img.save(buf, 'JPEG', quality=quality, optimize=True, dpi=(target_dpi, target_dpi))
                if shutil.which('cjpeg'):
                    temp_jpg = os.path.join(tmpdir, f"{name}.jpg")
                    with open(temp_jpg, 'wb') as f:
                        f.write(buf.getvalue())
                    subprocess.run(['cjpeg', '-quality', str(quality), '-outfile', temp_jpg, temp_jpg], check=True)
                    buf = open(temp_jpg, 'rb')
                else:
                    buf.seek(0)
            else:
                pil_img.save(buf, 'PNG', optimize=True, dpi=(target_dpi, target_dpi))
                if shutil.which('pngquant'):
                    temp_png = os.path.join(tmpdir, f"{name}.png")
                    with open(temp_png, 'wb') as f:
                        f.write(buf.getvalue())
                    subprocess.run(['pngquant', '--force', '--output', temp_png, f'--quality={quality}-{quality}', temp_png], check=True)
                    buf = open(temp_png, 'rb')
                else:
                    buf.seek(0)

            # Replace the image stream with the optimized one and update filters
            buf.seek(0)
            new_stream = pikepdf.Stream(pdf, buf.read())
            page.images[name].stream = new_stream
            if fmt.lower() == 'jpeg':
                page.images[name]['/Filter'] = Name('/DCTDecode')
                page.images[name]['/ColorSpace'] = Name('/DeviceRGB')
            else:
                page.images[name]['/Filter'] = Name('/FlateDecode')
                # keep existing ColorSpace if present
            if keep_original:
                pdf_img.extract_to(os.path.join(tmpdir, f"{name}_orig.png"))

    pdf.save(output_pdf)
    shutil.rmtree(tmpdir)

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
                update_progress(0, "⏹️ Process cancelled")
                return "Process cancelled."
            temp_filename = os.path.join(OUTPUT_FOLDER, f"temp_page_{uuid.uuid4().hex}.png")
            page.save(temp_filename, "PNG")
            update_progress(int((i-1)/total*100), f"🔍 Processing page {i} of {total} (AI OCR)")
            page_text = call_api_ocr(api, model, temp_filename, prompt_key)
            final_text += f"[Page {i:04d}]\n{page_text}\n\n"
            os.remove(temp_filename)
            progress = int((i / total) * 100)
            update_progress(progress, f"✅ Page {i} of {total} processed (AI OCR)")
            time.sleep(1)
        update_progress(100, "🎉 AI OCR completed")
        return final_text
    else:
        update_progress(10, "🔍 Processing image with AI OCR")
        return call_api_ocr(api, model, file_path, prompt_key)

def translate_file_by_pages(file_path, api, model, target_language, prompt_key, update_progress, is_cancelled):
    """
    Translates the file page by page, returning markdown with pagination.
    """
    final_translation = ""
    if file_path.lower().endswith(".pdf"):
        try:
            pages = convert_from_path(file_path)
        except Exception as e:
            return f"❌ Error processing PDF: {str(e)}"
        total = len(pages)
        for i, page in enumerate(pages, start=1):
            if is_cancelled():
                update_progress(0, "⏹️ Process cancelled")
                return "Process cancelled."
            temp_filename = os.path.join(OUTPUT_FOLDER, f"temp_page_{uuid.uuid4().hex}.png")
            page.save(temp_filename, "PNG")
            update_progress(int((i-1)/total*100), f"🌐 Translating page {i} of {total}")
            page_text = pytesseract.image_to_string(page, lang='eng')
            translated_page = call_api_translation(api, model, page_text, target_language, prompt_key)
            final_translation += f"# Page {i}\n{translated_page}\n\n"
            os.remove(temp_filename)
            progress = int((i / total) * 100)
            update_progress(progress, f"✅ Page {i} of {total} translated")
            time.sleep(1)
        update_progress(100, "🎉 Translation completed")
        return final_translation
    elif file_path.lower().endswith(".txt"):
        update_progress(10, "🌐 Translating full TXT file")
        with open(file_path, "r", encoding="utf-8") as f:
            text = f.read()
        translated = call_api_translation(api, model, text, target_language, prompt_key)
        update_progress(100, "🎉 Translation completed")
        return f"# Page 1\n{translated}"
    else:
        return "Unsupported file type for translation."

def process_file(file_path, api, model, mode, prompt_key, update_progress, is_cancelled, compression=None):
    if is_cancelled():
        update_progress(0, "⏹️ Process cancelled")
        return "Process cancelled."
    update_progress(10, "📤 File uploaded. Preparing processing...")
    base_name = os.path.splitext(os.path.basename(file_path))[0]

    processed_text = ""
    pdf_output = None
    if mode == "OCR":
        update_progress(15, "🔍 Running OCR...")
        processed_text = run_tesseract(file_path)
        if is_cancelled():
            update_progress(15, "⏹️ Process cancelled")
            return "Process cancelled."
        update_progress(50, "✅ Tesseract OCR completed.")
        if file_path.lower().endswith(".pdf"):
            update_progress(60, "📝 Embedding OCR into PDF...")
            pdf_output = os.path.join(OUTPUT_FOLDER, base_name + "_ocr.pdf")
            if embed_ocr_in_pdf(file_path, pdf_output):
                update_progress(90, "📄 OCR embedded. Compressing images...")
            else:
                shutil.copy(file_path, pdf_output)
                update_progress(90, "⚠️ Could not embed OCR; compressing anyway...")
            if compression and compression.get("enabled"):
                compressed = os.path.join(OUTPUT_FOLDER, base_name + "_compressed.pdf")
                compress_pdf_images(pdf_output, compressed,
                                    target_dpi=compression.get("target_dpi", 150),
                                    fmt=compression.get("format", "jpeg"),
                                    quality=compression.get("quality", 85),
                                    keep_original=compression.get("keep_original", False),
                                    preserve_metadata=compression.get("preserve_metadata", False))
                if not compression.get("keep_original", False):
                    try:
                        os.remove(pdf_output)
                    except Exception:
                        pass
                pdf_output = compressed
            update_progress(95, "📦 PDF ready")
    elif mode == "OCR + AI":
        update_progress(20, "🔍 Running Gemini OCR...")
        tesseract_text = run_tesseract(file_path)
        update_progress(35, "🤖 Correcting text with AI...")
        processed_text = call_api_correction(api, model, tesseract_text, prompt_key="ocr_correction")
        update_progress(50, "✅ Tesseract + AI completed.")
        if file_path.lower().endswith(".pdf"):
            update_progress(60, "📝 Embedding AI layer into PDF...")
            pdf_output = os.path.join(OUTPUT_FOLDER, base_name + "_ocr.pdf")
            if embed_ai_text_in_pdf(file_path, pdf_output):
                sidecar_txt = os.path.splitext(pdf_output)[0] + ".txt"
                if os.path.exists(sidecar_txt):
                    try:
                        os.remove(sidecar_txt)
                    except Exception:
                        pass
                update_progress(90, "📄 AI layer embedded. Compressing images...")
            else:
                shutil.copy(file_path, pdf_output)
                update_progress(90, "⚠️ Could not embed AI; compressing anyway...")
            if compression and compression.get("enabled"):
                compressed = os.path.join(OUTPUT_FOLDER, base_name + "_compressed.pdf")
                compress_pdf_images(pdf_output, compressed,
                                    target_dpi=compression.get("target_dpi", 150),
                                    fmt=compression.get("format", "jpeg"),
                                    quality=compression.get("quality", 85),
                                    keep_original=compression.get("keep_original", False),
                                    preserve_metadata=compression.get("preserve_metadata", False))
                if not compression.get("keep_original", False):
                    try:
                        os.remove(pdf_output)
                    except Exception:
                        pass
                pdf_output = compressed
            update_progress(95, "📦 PDF ready")
    elif mode == "AI":
        update_progress(20, "📂 File ready for full Gemini processing...")
        processed_text = call_api_ocr(api, model, file_path, prompt_key)
    else:
        processed_text = "Unrecognized processing mode."
        update_progress(25, "❌ Error: Unrecognized mode.")

    if is_cancelled():
        update_progress(75, "⏹️ Process cancelled")
        return "Process cancelled."

    update_progress(98, "📝 Saving results and finishing up...")

    if mode == "AI" and processed_text and processed_text.strip() and not processed_text.strip().startswith("❌") and processed_text.strip() != "Process cancelled.":
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

def convert_markdown_to_flowables(markdown_text, styles, header_styles, normal_style, max_chars_per_page=1800):
    """
    Convierte un bloque de Markdown en una lista de flowables para ReportLab.
    Inserta un salto de página si el texto sobrepasa max_chars_per_page.
    """
    import markdown
    from bs4 import BeautifulSoup
    html = markdown.markdown(markdown_text)
    soup = BeautifulSoup(html, "html.parser")
    flowables = []
    char_count = 0
    for element in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li']):
        if element.name in header_styles:
            style = header_styles[element.name]
        else:
            style = normal_style
        text_content = element.get_text().strip()
        if text_content:
            char_count += len(text_content)
            flowables.append(Paragraph(text_content, style))
            flowables.append(Spacer(1, 12))
            if char_count > max_chars_per_page:
                flowables.append(PageBreak())
                char_count = 0
    return flowables

def convert_txt_to_pdf(txt_file_path):
    """
    Convierte un archivo TXT a PDF usando Markdown:
      - Cada bloque de texto asociado a una imagen/página se convierte a Markdown.
      - Si el texto sobrepasa el tamaño de una página, se inserta un salto de página.
      - No se incluyen encabezados como "page 1", "page 2", etc.
    """
    import markdown
    from bs4 import BeautifulSoup
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

    # Separar por bloques de página si existen (por ejemplo, si el OCR los deja)
    # Si no, tratar todo el contenido como un solo bloque
    page_pattern = re.compile(r'\[Page\s+\d{4}\]')
    parts = re.split(r'(\[Page\s+\d{4}\])', content)
    # Si no hay partes, usar el contenido completo
    if len(parts) <= 1:
        blocks = [content]
    else:
        # Quitar los marcadores de página y dejar solo el texto
        blocks = []
        for part in parts:
            if not page_pattern.fullmatch(part):
                blocks.append(part.strip())

    flowables = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        # Convertir el bloque a flowables usando Markdown
        flowables.extend(convert_markdown_to_flowables(block, styles, header_styles, normal_style))
        # Se insertará un salto de página si el bloque es muy grande (la función lo gestiona)
        flowables.append(PageBreak())
    if flowables and isinstance(flowables[-1], PageBreak):
        flowables = flowables[:-1]  # No dejar salto de página al final
    doc.build(flowables)
    return output_pdf

# backend/utils.py
import os
import time
import pytesseract
from PIL import Image
from pdf2image import convert_from_path, pdfinfo_from_path
import shutil
import asyncio
import uuid
import subprocess
import base64
import re
import fitz  # PyMuPDF
import img2pdf
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

def run_tesseract(file_path, prompt_key=""):
    """
    Si el archivo es un PDF, se realiza OCR página a página añadiendo al principio de cada una
    la cabecera con el formato [Page 0001], [Page 0002], etc.
    Para otros formatos se realiza OCR normal.
    """
    extracted_text = ""
    if file_path.lower().endswith(".pdf"):
        try:
            info = pdfinfo_from_path(file_path)
            total = int(info.get("Pages", 0))
            for i in range(1, total + 1):
                page = convert_from_path(file_path, first_page=i, last_page=i)[0]
                page_text = pytesseract.image_to_string(page, lang='eng')
                if "ebook" not in prompt_key.lower():
                    extracted_text += f"[Page {i:04d}]\n{page_text}\n\n"
                else:
                    extracted_text += f"{page_text}\n\n"
        except Exception as e:
            extracted_text = f"❌ Error processing PDF: {str(e)}"
    else:
        image = Image.open(file_path)
        extracted_text = pytesseract.image_to_string(image, lang='eng')
    return extracted_text

def call_api_correction(api, model, text, prompt_key="ocr_correction"):
    # Add unique identifier to prevent caching issues
    unique_id = str(uuid.uuid4())[:8]
    timestamp = int(time.time())
    
    prompt = get_prompt(prompt_key) + text + f"\n\n[Correction ID: {unique_id}_{timestamp}]"
    
    try:
        from google import genai
    except ImportError:
        raise ImportError("Please install 'google-genai' to use Gemini.")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    # Create a new client instance for each request to prevent caching issues
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
    
    # Create a new client instance for each request to prevent caching issues
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    
    # Upload file with unique naming to prevent cache issues
    file_ref = client.files.upload(file=file_path)
    
    # Add a small delay to ensure file is fully uploaded
    time.sleep(0.5)
    
    # Get prompt and add unique identifier to prevent caching
    prompt = get_prompt(prompt_key)
    unique_id = str(uuid.uuid4())[:8]
    prompt_with_id = f"{prompt}\n\n[Processing ID: {unique_id}]"
    
    # Generate content with anti-cache measures
    response = client.models.generate_content(
        model=model, 
        contents=[file_ref, prompt_with_id]
    )
    
    # Clean up the uploaded file reference to prevent memory issues
    try:
        client.files.delete(file_ref.name)
    except:
        pass  # File cleanup is optional, API will handle it eventually
    
    return response.text

def call_api_translation(api, model, text, target_language, prompt_key="translation"):
    prompt_template = get_prompt(prompt_key)
    
    # Add unique identifier to prevent caching issues
    unique_id = str(uuid.uuid4())[:8]
    timestamp = int(time.time())
    
    prompt = prompt_template.format(target_language=target_language) + text + f"\n\n[Translation ID: {unique_id}_{timestamp}]"
    
    try:
        from google import genai
    except ImportError:
        raise ImportError("Please install 'google-genai' to use Gemini.")
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    # Create a new client instance for each request to prevent caching issues
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
    import re
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
        
        # Clean up sidecar file if it exists and contains HTML
        if sidecar.exists():
            try:
                with open(sidecar, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Check if the content contains HTML tags
                if '<' in content and '>' in content:
                    # Clean HTML from sidecar content
                    clean_content = re.sub(r'<[^>]*>', '', content)
                    clean_content = re.sub(r"class='[^']*'", '', clean_content)
                    clean_content = re.sub(r'class="[^"]*"', '', clean_content)
                    clean_content = re.sub(r'&[a-zA-Z]+;', '', clean_content)
                    clean_content = re.sub(r'\n\s*\n', '\n', clean_content)
                    clean_content = re.sub(r' +', ' ', clean_content)
                    clean_content = clean_content.strip()
                    
                    # Write back the cleaned content
                    with open(sidecar, 'w', encoding='utf-8') as f:
                        f.write(clean_content)
            except Exception as e:
                print(f"Warning: Could not clean sidecar file: {e}")
        
        return True
    except subprocess.CalledProcessError as e:
        print("OCRmyPDF failed:", e)
        return False

def ocr_file_by_pages(file_path, api, model, prompt_key, update_progress, is_cancelled):
    final_text = ""
    if file_path.lower().endswith(".pdf"):
        try:
            info = pdfinfo_from_path(file_path)
            total = int(info.get("Pages", 0))
        except Exception as e:
            return f"❌ Error processing PDF: {str(e)}"
        
        for i in range(1, total + 1):
            if is_cancelled():
                update_progress(0, "⏹️ Process cancelled", current_page=i, total_pages=total)
                return "Process cancelled."
            
            # Convert page to image
            page = convert_from_path(file_path, first_page=i, last_page=i)[0]
            
            # Create unique temp filename to prevent caching issues
            temp_filename = os.path.join(OUTPUT_FOLDER, f"temp_page_{i}_{uuid.uuid4().hex}_{int(time.time())}.png")
            page.save(temp_filename, "PNG")
            
            progress_start = round((i - 1) / total * 100, 2)
            update_progress(progress_start, f"🔍 Processing page {i} of {total} (AI OCR)", current_page=i, total_pages=total)
            
            # Process page with retry logic for cache issues
            max_retries = 3
            retry_count = 0
            page_text = ""
            
            while retry_count < max_retries:
                try:
                    page_text = call_api_ocr(api, model, temp_filename, prompt_key)
                    break  # Success, exit retry loop
                except Exception as e:
                    retry_count += 1
                    if retry_count < max_retries:
                        update_progress(progress_start, f"⚠️ Retry {retry_count}/{max_retries} for page {i} (cache issue)", current_page=i, total_pages=total)
                        time.sleep(2)  # Wait before retry
                    else:
                        page_text = f"❌ Error processing page {i}: {str(e)}"
                        break
            
            if "ebook" not in prompt_key.lower():
                final_text += f"[Page {i:04d}]\n{page_text}\n\n"
            else:
                final_text += f"{page_text}\n\n"
            
            # Clean up temp file immediately after processing
            try:
                os.remove(temp_filename)
            except:
                pass  # File cleanup is optional
            
            progress = round(i / total * 100, 2)
            update_progress(progress, f"✅ Page {i} of {total} processed (AI OCR)", current_page=i, total_pages=total)
            
            # Add delay between pages to prevent API rate limiting and cache issues
            time.sleep(1.5)
            
        update_progress(100, "🎉 AI OCR completed", current_page=total, total_pages=total)
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
            info = pdfinfo_from_path(file_path)
            total = int(info.get("Pages", 0))
        except Exception as e:
            return f"❌ Error processing PDF: {str(e)}"
        
        for i in range(1, total + 1):
            if is_cancelled():
                update_progress(0, "⏹️ Process cancelled", current_page=i, total_pages=total)
                return "Process cancelled."
            
            page = convert_from_path(file_path, first_page=i, last_page=i)[0]
            
            # Create unique temp filename to prevent caching issues
            temp_filename = os.path.join(OUTPUT_FOLDER, f"temp_translate_{i}_{uuid.uuid4().hex}_{int(time.time())}.png")
            page.save(temp_filename, "PNG")
            
            progress_start = round((i - 1) / total * 100, 2)
            update_progress(progress_start, f"🌐 Translating page {i} of {total}", current_page=i, total_pages=total)
            
            # Extract text from page
            page_text = pytesseract.image_to_string(page, lang='eng')
            
            # Translate with retry logic for cache issues
            max_retries = 3
            retry_count = 0
            translated_page = ""
            
            while retry_count < max_retries:
                try:
                    translated_page = call_api_translation(api, model, page_text, target_language, prompt_key)
                    break  # Success, exit retry loop
                except Exception as e:
                    retry_count += 1
                    if retry_count < max_retries:
                        update_progress(progress_start, f"⚠️ Retry {retry_count}/{max_retries} for page {i} translation", current_page=i, total_pages=total)
                        time.sleep(2)  # Wait before retry
                    else:
                        translated_page = f"❌ Error translating page {i}: {str(e)}"
                        break
            
            final_translation += f"# Page {i}\n{translated_page}\n\n"
            
            # Clean up temp file immediately after processing
            try:
                os.remove(temp_filename)
            except:
                pass  # File cleanup is optional
            
            progress = round(i / total * 100, 2)
            update_progress(progress, f"✅ Page {i} of {total} translated", current_page=i, total_pages=total)
            
            # Add delay between pages to prevent API rate limiting and cache issues
            time.sleep(1.5)
            
        update_progress(100, "🎉 Translation completed", current_page=total, total_pages=total)
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

def process_file(file_path, api, model, mode, prompt_key, update_progress, is_cancelled, compression_settings=None, output_format="txt"):
    if is_cancelled():
        update_progress(0, "⏹️ Process cancelled")
        return "Process cancelled."
    update_progress(10, "📤 File uploaded. Preparing processing...")
    base_name = os.path.splitext(os.path.basename(file_path))[0]

    processed_text = ""
    final_pdf_path = None
    
    if mode == "OCR":
        update_progress(15, "🔍 Running OCR...")
        processed_text = run_tesseract(file_path, prompt_key)
        if is_cancelled():
            update_progress(15, "⏹️ Process cancelled")
            return "Process cancelled."
        update_progress(50, "✅ Tesseract OCR completed.")
        if file_path.lower().endswith(".pdf"):
            update_progress(60, "📝 Embedding OCR into PDF...")
            pdf_output = os.path.join(OUTPUT_FOLDER, base_name + "_ocr.pdf")
            if embed_ocr_in_pdf(file_path, pdf_output):
                update_progress(80, "📄 OCR successfully embedded in PDF.")
                final_pdf_path = pdf_output
            else:
                shutil.copy(file_path, pdf_output)
                update_progress(80, "⚠️ Could not embed OCR; original PDF copied.")
                final_pdf_path = pdf_output
    elif mode == "OCR + AI":
        update_progress(20, "🔍 Running Gemini OCR...")
        tesseract_text = run_tesseract(file_path, prompt_key)
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
                update_progress(80, "📄 AI layer successfully embedded in PDF.")
                final_pdf_path = pdf_output
            else:
                shutil.copy(file_path, pdf_output)
                update_progress(80, "⚠️ Could not embed AI; original PDF copied.")
                final_pdf_path = pdf_output
    elif mode == "AI":
        update_progress(20, "📂 File ready for full Gemini processing...")
        processed_text = ocr_file_by_pages(file_path, api, model, prompt_key, update_progress, is_cancelled)
    else:
        processed_text = "Unrecognized processing mode."
        update_progress(25, "❌ Error: Unrecognized mode.")

    if is_cancelled():
        update_progress(75, "⏹️ Process cancelled")
        return "Process cancelled."

    # Apply compression if enabled and we have a PDF to compress
    if compression_settings and compression_settings.get('enabled', False):
        if final_pdf_path and os.path.exists(final_pdf_path):
            update_progress(85, "🗜️ Compressing PDF...")
            try:
                # Create a temporary compressed file
                base_name = os.path.splitext(os.path.basename(final_pdf_path))[0]
                temp_compressed = os.path.join(OUTPUT_FOLDER, base_name + "_temp_compressed.pdf")
                
                # Apply Ghostscript compression to the final OCR PDF
                compressed_pdf = compress_pdf_with_ghostscript(final_pdf_path, temp_compressed, compression_settings)
                
                if compressed_pdf and os.path.exists(compressed_pdf):
                    # Check if compression actually reduced file size
                    original_size = os.path.getsize(final_pdf_path)
                    compressed_size = os.path.getsize(compressed_pdf)
                    
                    if compressed_size < original_size:
                        # Replace the original with compressed version
                        final_compressed = os.path.join(OUTPUT_FOLDER, base_name + "_compressed.pdf")
                        shutil.move(compressed_pdf, final_compressed)
                        savings = ((original_size - compressed_size) / original_size) * 100
                        update_progress(95, f"✅ Compression completed - {savings:.1f}% size reduction!")
                    else:
                        # Compression didn't help, remove temp file
                        if os.path.exists(compressed_pdf):
                            os.remove(compressed_pdf)
                        update_progress(95, "⚠️ Compression did not reduce file size, keeping original")
                else:
                    update_progress(95, "⚠️ Compression process failed")
                    
            except Exception as e:
                update_progress(95, f"⚠️ Compression failed: {str(e)}")
        elif not file_path.lower().endswith(".pdf"):
            # For single images, compress and save
            update_progress(85, "🗜️ Compressing image...")
            try:
                compressed_image_path = process_with_compression(file_path, compression_settings)
                update_progress(95, "✅ Image compression completed.")
            except Exception as e:
                update_progress(95, f"⚠️ Image compression failed: {str(e)}")

    update_progress(98, "📝 Saving results and finishing up...")

    if mode == "AI" and processed_text and processed_text.strip() and not processed_text.strip().startswith("❌") and processed_text.strip() != "Process cancelled.":
        # Determine extension based on requested output format
        ext = ".md" if str(output_format).lower() == "md" else ".txt"
        txt_file = os.path.join(OUTPUT_FOLDER, base_name + ext)
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

def convert_md_to_epub(md_file_path):
    """Convert a Markdown file to EPUB format.

    The generated EPUB follows the minimum structure required by the
    specification and preserves basic formatting such as headings,
    paragraphs and lists.
    """
    import markdown
    from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
    import uuid

    with open(md_file_path, "r", encoding="utf-8") as f:
        md_text = f.read()

    base_name = os.path.splitext(os.path.basename(md_file_path))[0]
    epub_path = os.path.join(OUTPUT_FOLDER, base_name + ".epub")

    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    html_body = markdown.markdown(md_text, output_format="xhtml1")

    book_id = str(uuid.uuid4())

    # XHTML content
    index_xhtml = f"""<?xml version='1.0' encoding='utf-8'?>
<html xmlns='http://www.w3.org/1999/xhtml'>
  <head>
    <title>{base_name}</title>
  </head>
  <body>
  {html_body}
  </body>
</html>
"""

    # Minimal package file
    content_opf = f"""<?xml version='1.0' encoding='utf-8'?>
<package xmlns='http://www.idpf.org/2007/opf' unique-identifier='bookid' version='3.0'>
  <metadata xmlns:dc='http://purl.org/dc/elements/1.1/'>
    <dc:identifier id='bookid'>{book_id}</dc:identifier>
    <dc:title>{base_name}</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id='content' href='index.xhtml' media-type='application/xhtml+xml'/>
    <item id='toc' properties='nav' href='toc.xhtml' media-type='application/xhtml+xml'/>
  </manifest>
  <spine>
    <itemref idref='content'/>
  </spine>
</package>
"""

    toc_xhtml = """<?xml version='1.0' encoding='utf-8'?>
<html xmlns='http://www.w3.org/1999/xhtml' xmlns:epub='http://www.idpf.org/2007/ops'>
  <head>
    <title>Table of Contents</title>
  </head>
  <body>
    <nav epub:type='toc'>
      <ol>
        <li><a href='index.xhtml'>Start</a></li>
      </ol>
    </nav>
  </body>
</html>
"""

    container_xml = """<?xml version='1.0'?>
<container version='1.0' xmlns='urn:oasis:names:tc:opendocument:xmlns:container'>
  <rootfiles>
    <rootfile full-path='OEBPS/content.opf' media-type='application/oebps-package+xml'/>
  </rootfiles>
</container>
"""

    with ZipFile(epub_path, "w") as epub:
        epub.writestr("mimetype", "application/epub+zip", compress_type=ZIP_STORED)
        epub.writestr("META-INF/container.xml", container_xml, compress_type=ZIP_DEFLATED)
        epub.writestr("OEBPS/index.xhtml", index_xhtml, compress_type=ZIP_DEFLATED)
        epub.writestr("OEBPS/toc.xhtml", toc_xhtml, compress_type=ZIP_DEFLATED)
        epub.writestr("OEBPS/content.opf", content_opf, compress_type=ZIP_DEFLATED)

    return epub_path

def compress_image(image, target_dpi=150, quality=85, format_type="JPEG"):
    """
    Compresses a PIL Image based on the specified parameters.
    
    Args:
        image: PIL Image object
        target_dpi: Target DPI for the compressed image
        quality: JPEG quality (1-100, only for JPEG)
        format_type: "JPEG" or "PNG"
    
    Returns:
        Compressed PIL Image object
    """
    # Calculate new size based on target DPI
    if hasattr(image, 'info') and 'dpi' in image.info:
        original_dpi = image.info['dpi'][0] if isinstance(image.info['dpi'], tuple) else image.info['dpi']
    else:
        original_dpi = 300  # Default assumption for scanned documents
    
    if original_dpi > target_dpi:
        scale_factor = target_dpi / original_dpi
        new_width = int(image.width * scale_factor)
        new_height = int(image.height * scale_factor)
        image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Convert to RGB if saving as JPEG
    if format_type == "JPEG" and image.mode in ("RGBA", "P"):
        # Create a white background
        rgb_image = Image.new("RGB", image.size, (255, 255, 255))
        if image.mode == "P":
            image = image.convert("RGBA")
        rgb_image.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
        image = rgb_image
    
    return image

def compress_pdf_with_ghostscript(input_pdf_path, output_pdf_path, compression_settings):
    """
    Compresses a PDF using Ghostscript - more effective than PyMuPDF for compression.
    """
    target_dpi = compression_settings.get('target_dpi', 150)
    quality = compression_settings.get('quality', 85)
    
    # More aggressive compression settings
    try:
        cmd = [
            'gs',
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            '-dPDFSETTINGS=/ebook',  # More aggressive than before
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            '-dAutoRotatePages=/None',
            '-dColorImageDownsampleType=/Bicubic',
            '-dColorImageResolution=150',
            '-dGrayImageDownsampleType=/Bicubic', 
            '-dGrayImageResolution=150',
            '-dMonoImageDownsampleType=/Bicubic',
            '-dMonoImageResolution=300',
            '-dColorImageFilter=/DCTEncode',
            '-dGrayImageFilter=/DCTEncode',
            '-dOptimize=true',
            '-dEmbedAllFonts=true',
            '-dSubsetFonts=true',
            '-dCompressFonts=true',
            '-dNOPLATFONTS=true',
            f'-sOutputFile={output_pdf_path}',
            input_pdf_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        # Check if output file was created and is smaller
        if os.path.exists(output_pdf_path):
            return output_pdf_path
        else:
            return None
            
    except subprocess.CalledProcessError as e:
        print(f"Ghostscript compression failed: {e}")
        print(f"Error output: {e.stderr}")
        return None

def compress_pdf_images(input_pdf_path, output_pdf_path, compression_settings):
    """
    Compresses images in a PDF file while preserving text and structure.
    Now uses Ghostscript for better compression results.
    """
    return compress_pdf_with_ghostscript(input_pdf_path, output_pdf_path, compression_settings)

def process_with_compression(file_path, compression_settings=None):
    """
    Process a file with optional image compression.
    
    Args:
        file_path: Path to the input file
        compression_settings: Dictionary with compression parameters or None to skip compression
    
    Returns:
        Path to the processed file (compressed if compression_settings provided)
    """
    if not compression_settings or not compression_settings.get('enabled', False):
        return file_path
    
    base_name = os.path.splitext(os.path.basename(file_path))[0]
    
    if file_path.lower().endswith('.pdf'):
        # Compress PDF images
        compressed_path = os.path.join(OUTPUT_FOLDER, base_name + "_compressed.pdf")
        return compress_pdf_images(file_path, compressed_path, compression_settings)
    else:
        # Compress single image
        try:
            image = Image.open(file_path)
            compressed_image = compress_image(
                image, 
                compression_settings.get('target_dpi', 150),
                compression_settings.get('quality', 85),
                compression_settings.get('format', 'JPEG')
            )
            
            # Determine output format and extension
            format_type = compression_settings.get('format', 'JPEG')
            ext = '.jpg' if format_type == 'JPEG' else '.png'
            compressed_path = os.path.join(OUTPUT_FOLDER, base_name + "_compressed" + ext)
            
            if format_type == "JPEG":
                compressed_image.save(compressed_path, format="JPEG", quality=compression_settings.get('quality', 85), optimize=True)
            else:
                compressed_image.save(compressed_path, format="PNG", optimize=True)
            
            return compressed_path
        except Exception as e:
            print(f"Error compressing image: {e}")
            return file_path

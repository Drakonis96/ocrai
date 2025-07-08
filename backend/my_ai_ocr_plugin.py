# backend/my_ai_ocr_plugin.py
from pathlib import Path
import subprocess, os, bs4
from ocrmypdf.pluginspec import OcrEngine, OrientationConfidence
from ocrmypdf import hookimpl
from ocrmypdf.hocrtransform import HocrTransform   # <-- para generate_pdf
from models import get_prompt

# ---------- utilidades auxiliares ----------
def _tesseract_hocr(infile: str, outfile: str):
    outroot = Path(outfile).with_suffix('')
    subprocess.run(['tesseract', infile, str(outroot), 'hocr'], check=True)
    Path(str(outroot) + '.hocr').rename(outfile)

def _correct_hocr_with_ai(hocr_html: str, prompt_key="ocr_correction",
                          api="Gemini", model="gemini-2.0-flash") -> str:
    """
    1) Extrae todas las palabras (<span class='ocrx_word'>) en orden de lectura.
    2) Envía a la IA y pide la misma cantidad de palabras, separadas por líneas.
    3) Sustituye cada palabra en el árbol BeautifulSoup.
    4) Devuelve el HOCR corregido.
    """
    import re
    import uuid
    import time
    
    soup = bs4.BeautifulSoup(hocr_html, "html.parser")
    words = [span.get_text() for span in soup.select("span.ocrx_word")]
    chunk = "\n".join(words)
    
    # Add unique identifier to prevent caching issues
    unique_id = str(uuid.uuid4())[:8]
    timestamp = int(time.time())
    
    prompt = (
        get_prompt(prompt_key) +
        "\n---\n"
        "PALABRAS_ORIGINALES:\n" + chunk +
        "\n---\n"
        "DEVUELVE_LA_MISMA_CANTIDAD_DE_PALABRAS_CORREGIDAS,"
        "EN_EL_MISMO_ORDEN,UNA_POR_LÍNEA_Y_NADA_MÁS."
        "NO_INCLUYAS_ETIQUETAS_HTML,_SOLO_TEXTO_PLANO."
        f"\n[Processing ID: {unique_id}_{timestamp}]"
    )
    
    from google import genai
    
    # Create new client instance for each request to prevent caching
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    
    # Add retry logic for cache issues
    max_retries = 3
    retry_count = 0
    
    while retry_count < max_retries:
        try:
            rsp = client.models.generate_content(model=model, contents=[prompt])
            break  # Success, exit retry loop
        except Exception as e:
            retry_count += 1
            if retry_count < max_retries:
                time.sleep(2)  # Wait before retry
            else:
                # If all retries fail, return original text
                return hocr_html
    
    # Clean the AI response to ensure no HTML tags are included
    corrected_text = rsp.text
    # Remove any HTML tags that might be in the AI response
    corrected_text = re.sub(r'<[^>]+>', '', corrected_text)
    corrected = [w.strip() for w in corrected_text.splitlines() if w.strip()]
    
    # Fallback: mantén largo exacto
    if len(corrected) != len(words):
        import logging
        logging.warning("Gemini devolvió distinto nº de palabras (%d vs %d)", len(corrected), len(words))
        corrected = (corrected + words)[0:len(words)]
    
    # Clean each corrected word to ensure no HTML content
    for span, new_word in zip(soup.select("span.ocrx_word"), corrected):
        # Remove any potential HTML tags from the corrected word
        clean_word = re.sub(r'<[^>]+>', '', new_word).strip()
        # Ensure we only have plain text content
        clean_word = re.sub(r'[<>&]', '', clean_word)
        span.string = clean_word
    return str(soup)

# ---------- Plugin ----------

@hookimpl
def get_ocr_engine():
    return MyAIOCREngine()

class MyAIOCREngine(OcrEngine):
    # ---- metadatos obligatorios ----
    @staticmethod
    def version() -> str:
        return "Gemini-OCR 0.1"

    def __str__(self) -> str:
        return f"MyAIOCREngine {self.version()}"

    @staticmethod
    def creator_tag(options) -> str:
        # Aparece en los metadatos PDF → sé conciso y sin saltos de línea
        return f"OCRmyPDF + Gemini ({MyAIOCREngine.version()})"

    @staticmethod
    def languages(options) -> set[str]:
        # Declara los códigos idiomáticos que soporta tu IA
        return {"eng", "spa"}

    # ---- funciones de orientación / deskew ----
    @staticmethod
    def get_orientation(input_file, options) -> OrientationConfidence:
        # Si no detectas giro, di que está a 0° con confianza 0
        return OrientationConfidence(angle=0, confidence=0.0)

    # ---- OCR propiamente dicho ----
    def generate_hocr(self, input_file, output_hocr, output_text, options):
        _tesseract_hocr(input_file, output_hocr)
        with open(output_hocr, "r", encoding="utf-8") as f:
            hocr_html = f.read()
        corrected = _correct_hocr_with_ai(hocr_html)
        with open(output_hocr, "w", encoding="utf-8") as f:
            f.write(corrected)
        # texto llano limpio (sin etiquetas HTML)
        soup = bs4.BeautifulSoup(corrected, "html.parser")
        plain_text = soup.get_text(separator="\n")
        import re
        # Elimina cualquier etiqueta HTML residual de manera más agresiva
        plain_text = re.sub(r'<[^>]*>', '', plain_text)
        # Elimina patrones específicos de span tags que podrían quedar
        plain_text = re.sub(r'<span[^>]*>', '', plain_text)
        plain_text = re.sub(r'</span>', '', plain_text)
        # Elimina atributos de clase que podrían quedar
        plain_text = re.sub(r"class='[^']*'", '', plain_text)
        plain_text = re.sub(r'class="[^"]*"', '', plain_text)
        # Elimina caracteres HTML escapados
        plain_text = re.sub(r'&[a-zA-Z]+;', '', plain_text)
        # Limpia espacios múltiples y líneas vacías
        plain_text = re.sub(r'\n\s*\n', '\n', plain_text)
        plain_text = re.sub(r' +', ' ', plain_text)
        plain_text = plain_text.strip()
        with open(output_text, "w", encoding="utf-8") as f:
            f.write(plain_text)

    @staticmethod
    def generate_pdf(input_file, output_pdf, output_text, options):
        """
        Convierte el HOCR ya corregido en un PDF ‘text-only’.
        OCRmyPDF luego lo fusionará con la página original.
        """
        hocr = output_pdf.with_suffix(".hocr")
        if not hocr.exists():
            raise FileNotFoundError(hocr)
        HocrTransform(hocr, input_file).to_pdf(output_pdf)

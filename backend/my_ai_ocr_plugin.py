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
    soup = bs4.BeautifulSoup(hocr_html, "html.parser")
    words = [span.get_text() for span in soup.select("span.ocrx_word")]
    chunk = "\n".join(words)
    prompt = (
        get_prompt(prompt_key) +
        "\n---\n"
        "PALABRAS_ORIGINALES:\n" + chunk +
        "\n---\n"
        "DEVUELVE_LA_MISMA_CANTIDAD_DE_PALABRAS_CORREGIDAS,"
        "EN_EL_MISMO_ORDEN,UNA_POR_LÍNEA_Y_NADA_MÁS."
    )
    from google import genai
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    rsp = client.models.generate_content(model=model, contents=[prompt])
    import re
    corrected = []
    for w in rsp.text.splitlines():
        w = w.strip()
        if not w:
            continue
        # Remove any HTML tags the model might have included
        w = re.sub(r'<[^>]+>', '', w)
        corrected.append(w)
    # Fallback: mantén largo exacto
    if len(corrected) != len(words):
        import logging
        logging.warning("Gemini devolvió distinto nº de palabras (%d vs %d)", len(corrected), len(words))
        corrected = (corrected + words)[0:len(words)]
    for span, new_word in zip(soup.select("span.ocrx_word"), corrected):
        span.string = new_word
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
        import re, html
        # Elimina cualquier etiqueta HTML residual y entidades HTML
        plain_text = re.sub(r'<[^>]+>', '', plain_text)
        plain_text = html.unescape(plain_text)
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

# backend/models.py
default_prompts = {
    # Prompt para corrección de HOCR (plugin OCRmyPDF)
    "ocr_correction": (
        "Automatically detect the language of the document. You will receive a list of words extracted from an OCR document. "
        "Correct any spelling errors, OCR mistakes, or formatting issues in these words. "
        "Return ONLY the corrected words, one per line, in the same order as provided. "
        "Do NOT include any HTML tags, span elements, class attributes, or any other markup. "
        "Return ONLY plain text words, nothing else."
    ),
    # Prompt para OCR puro (IA) en markdown (ENGLISH)
    "ocr": (
        "Perform OCR on the provided image or PDF. Your response must start with the OCR result. Return the recognized text in markdown format, using headings (#), lists, bold, etc. Each page must start with a markdown heading '# Page X'. Do not add comments or any extra formatting outside of markdown."
    ),
    # Prompt para traducción en markdown (ENGLISH)
    "translation": (
        "Translate the following text to {target_language}. Your response must start with the translation. Return the translation in markdown format, using headings (#), lists, bold, etc. "
        "Each page must start with a markdown heading '# Page X'. Do not add comments or any extra formatting outside of markdown."
    ),
    # Prompt para extraer texto en modo eBook (ENGLISH)
    "ebook_mode": (
        "Perform OCR on the supplied image or PDF and output only the recognized text, formatted in valid Markdown. "
        "Start your response with the OCR result. Use standard Markdown syntax for headings, bold, italics, and lists. "
        "Preserve the original paragraph structure by merging hard-wrapped lines. Insert a single blank line between paragraphs and standalone titles; otherwise, write continuously. "
        "Remove all page headers, footers, running heads, footnotes, page numbers, and end-of-line hyphens. "
        "Output plain UTF-8 text only, with no comments, metadata, explanations, or leading/trailing spaces on any line."
    )
}

custom_prompts = {}

def get_prompt(key):
    return custom_prompts.get(key, default_prompts.get(key, ""))

def update_prompt(key, new_prompt):
    custom_prompts[key] = new_prompt

def delete_prompt(key):
    if key in custom_prompts:
        del custom_prompts[key]
        return True
    elif key in default_prompts:
        custom_prompts[key] = ""
        return True
    return False

# Añadimos soporte para Gemini en available_models
available_models = {
    "Gemini": ["gemini-2.0-flash"]
}

def get_models(api_name):
    return available_models.get(api_name, [])

def add_model(api_name, model_name):
    if api_name in available_models:
        if model_name not in available_models[api_name]:
            available_models[api_name].append(model_name)
    else:
        available_models[api_name] = [model_name]

def delete_model(api, model):
    if api in available_models and model in available_models[api]:
        available_models[api].remove(model)
        return True
    return False

available_languages = ["Spanish", "English", "French", "Italian", "German", "Portuguese"]

def get_languages():
    return available_languages

def add_language(language):
    if language not in available_languages:
        available_languages.append(language)

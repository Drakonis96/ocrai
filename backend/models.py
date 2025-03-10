# backend/models.py
default_prompts = {
    "ocr_correction": "Correct the following text. Begin your answer directly with the corrected text. Format the result as HTML, indicating where each page begins, each paragraph begins, and marking titles with the appropriate HTML tags (e.g., <h1>, <h2>, etc.).",
    "ocr": "Perform OCR on the following document. Begin your answer directly with the OCR. Format the result as HTML, indicating where each page begins, each paragraph begins, and marking titles with the appropriate HTML tags (e.g., <h1>, <h2>, etc.).",
    "translation": "Translate the following text to Spanish. Do not add any commentary; only output the translated text. Begin your answer directly with the translation. Format the result as HTML, indicating where each page begins, each paragraph begins, and marking titles with the appropriate HTML tags (e.g., <h1>, <h2>, etc.)."
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

# Solo se usará Gemini.
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

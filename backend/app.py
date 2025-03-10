# backend/app.py
import os
import uuid
import threading
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from models import get_models, add_model, get_languages, update_prompt, get_prompt, add_language, delete_prompt, custom_prompts, default_prompts
from utils import process_file, translate_file_by_pages, convert_txt_to_pdf
import time

app = Flask(__name__, static_folder="static", static_url_path="")
CORS(app)

UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "outputs"

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Global dictionary for background jobs
active_jobs = {}  # job_id: {"progress": int, "status": str, "cancelled": bool, "result": any}

def update_progress(job_id, progress, status):
    active_jobs[job_id]["progress"] = progress
    active_jobs[job_id]["status"] = status

def is_cancelled(job_id):
    return active_jobs[job_id]["cancelled"]

def run_processing(job_id, file_path, api, model, mode, prompt_key):
    try:
        result = process_file(
            file_path, api, model, mode, prompt_key,
            update_progress=lambda prog, stat: update_progress(job_id, prog, stat),
            is_cancelled=lambda: is_cancelled(job_id)
        )
        active_jobs[job_id]["result"] = result
        update_progress(job_id, 100, "🎉 Process completed")
    except Exception as e:
        update_progress(job_id, active_jobs[job_id]["progress"], f"❌ Error: {str(e)}")

def run_translation(job_id, file_path, api, model, target_language, prompt_key):
    try:
        result = translate_file_by_pages(
            file_path, api, model, target_language, prompt_key,
            update_progress=lambda prog, stat: update_progress(job_id, prog, stat),
            is_cancelled=lambda: is_cancelled(job_id)
        )
        base_name = os.path.splitext(os.path.basename(file_path))[0]
        translation_file = os.path.join(OUTPUT_FOLDER, base_name + "_translation.txt")
        with open(translation_file, "w", encoding="utf-8") as f:
            f.write(result)
        active_jobs[job_id]["result"] = translation_file
        update_progress(job_id, 100, "🎉 Process completed")
    except Exception as e:
        update_progress(job_id, active_jobs[job_id]["progress"], f"❌ Error: {str(e)}")

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file found"}), 400

    file = request.files['file']
    api = request.form.get('api')
    model = request.form.get('model')
    mode = request.form.get('mode')  # "OCR", "OCR + AI" or "AI"
    prompt_key = request.form.get('prompt_key')

    if file.filename == '':
        return jsonify({"error": "Empty filename"}), 400

    filename = secure_filename(file.filename)
    if os.path.exists(os.path.join(UPLOAD_FOLDER, filename)):
        base, ext = os.path.splitext(filename)
        filename = f"{base}_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)

    job_id = str(uuid.uuid4())
    active_jobs[job_id] = {"progress": 0, "status": "📤 File uploaded", "cancelled": False, "result": None}

    thread = threading.Thread(target=run_processing, args=(job_id, file_path, api, model, mode, prompt_key))
    thread.start()

    return jsonify({"message": "File uploaded, processing started", "job_id": job_id})

@app.route('/api/progress/<job_id>', methods=['GET'])
def get_progress(job_id):
    if job_id in active_jobs:
        return jsonify({
            "progress": active_jobs[job_id]["progress"],
            "status": active_jobs[job_id]["status"],
            "result": active_jobs[job_id]["result"]
        })
    else:
        return jsonify({"error": "Job not found"}), 404

@app.route('/api/stop/<job_id>', methods=['POST'])
def stop_job(job_id):
    if job_id in active_jobs:
        active_jobs[job_id]["cancelled"] = True
        update_progress(job_id, active_jobs[job_id]["progress"], "⏹️ Cancelled")
        return jsonify({"message": "Job cancellation requested"})
    else:
        return jsonify({"error": "Job not found"}), 404

@app.route('/api/models', methods=['GET'])
def models():
    api = request.args.get('api')
    if api:
        models_list = get_models(api)
        return jsonify({"models": models_list})
    else:
        return jsonify({"error": "Must specify API"}), 400

@app.route('/api/languages', methods=['GET'])
def languages():
    langs = get_languages()
    return jsonify({"languages": langs})

@app.route('/api/add-model', methods=['POST'])
def add_new_model():
    data = request.get_json()
    api = data.get("api")
    model = data.get("model")
    if not api or not model:
        return jsonify({"error": "Missing api or model"}), 400
    add_model(api, model)
    return jsonify({"message": f"Model {model} added for {api}"}), 200

# Nuevo endpoint para eliminar un modelo
@app.route('/api/delete-model', methods=['DELETE'])
def delete_model_endpoint():
    data = request.get_json()
    api_name = data.get("api")
    model_name = data.get("model")
    if not api_name or not model_name:
        return jsonify({"error": "Missing api or model"}), 400
    from models import delete_model
    if delete_model(api_name, model_name):
        return jsonify({"message": f"Model {model_name} deleted from {api_name}."}), 200
    else:
        return jsonify({"error": "Model not found."}), 404

@app.route('/api/prompts', methods=['GET'])
def get_prompts_endpoint():
    prompts = {}
    prompts.update(default_prompts)
    from models import custom_prompts
    prompts.update(custom_prompts)
    return jsonify({"prompts": prompts})

@app.route('/api/prompts', methods=['POST'])
def update_prompts_endpoint():
    data = request.get_json()
    key = data.get("key")
    new_prompt = data.get("prompt")
    if not key or not new_prompt:
        return jsonify({"error": "Missing key or prompt"}), 400
    update_prompt(key, new_prompt)
    return jsonify({"message": f"Prompt for '{key}' updated."})

@app.route('/api/prompts/<key>', methods=['DELETE'])
def delete_prompt_endpoint(key):
    if delete_prompt(key):
        return jsonify({"message": f"Prompt '{key}' deleted."})
    else:
        return jsonify({"error": "Prompt not found or cannot be deleted."}), 404

@app.route('/api/files', methods=['GET'])
def list_files():
    files = os.listdir(OUTPUT_FOLDER)
    return jsonify({"files": files})

@app.route('/api/files/<filename>', methods=['GET'])
def download_file(filename):
    return send_from_directory(OUTPUT_FOLDER, filename, as_attachment=True)

@app.route('/api/files/<filename>', methods=['DELETE'])
def delete_file(filename):
    file_path = os.path.join(OUTPUT_FOLDER, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return jsonify({"message": "File deleted"}), 200
    else:
        return jsonify({"error": "File not found"}), 404

# Endpoint modificado: borrar todos los archivos tanto de la carpeta outputs como de uploads.
@app.route('/api/files/all', methods=['DELETE'])
def delete_all_files():
    try:
        # Borrar archivos de OUTPUT_FOLDER
        output_files = os.listdir(OUTPUT_FOLDER)
        for file in output_files:
            file_path = os.path.join(OUTPUT_FOLDER, file)
            os.remove(file_path)
        # Borrar archivos de UPLOAD_FOLDER
        upload_files = os.listdir(UPLOAD_FOLDER)
        for file in upload_files:
            file_path = os.path.join(UPLOAD_FOLDER, file)
            os.remove(file_path)
        return jsonify({"message": "All files in outputs and uploads deleted"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/config', methods=['GET'])
def download_config():
    from models import custom_prompts, available_models
    config = {
        "custom_prompts": custom_prompts,
        "available_models": available_models
    }
    return jsonify(config)

@app.route('/api/config', methods=['POST'])
def upload_config():
    if 'config' not in request.files:
        return jsonify({"error": "No config file provided"}), 400
    file = request.files['config']
    try:
        config_data = json.load(file)
        from models import custom_prompts, available_models
        custom_prompts.clear()
        custom_prompts.update(config_data.get("custom_prompts", {}))
        available_models.clear()
        available_models.update(config_data.get("available_models", {}))
        return jsonify({"message": "Configuration updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400

@app.route('/api/txttopdf', methods=['POST'])
def txt_to_pdf_endpoint():
    data = request.get_json()
    filename = data.get("filename")
    if not filename:
        return jsonify({"error": "Missing filename parameter"}), 400
    txt_path = os.path.join(OUTPUT_FOLDER, filename)
    if not os.path.exists(txt_path):
        return jsonify({"error": "File not found"}), 404
    try:
        pdf_path = convert_txt_to_pdf(txt_path)
        return jsonify({"message": "TXT to PDF conversion completed", "pdf_file": os.path.basename(pdf_path)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
         return send_from_directory(app.static_folder, path)
    else:
         return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5015)

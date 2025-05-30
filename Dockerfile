# Stage 1: Build the frontend
FROM node:16-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Build the backend
FROM python:3.9-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    poppler-utils \
    tesseract-ocr \
    ghostscript \
    qpdf \
    unpaper \
    libxml2 \
    libxslt1.1 \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend code
COPY backend/ /app/backend/

# Copy built frontend assets into the backend's static folder
COPY --from=frontend-build /app/frontend/build/ /app/backend/static/

# Set working directory to backend and install Python dependencies
WORKDIR /app/backend
ENV PYTHONPATH=/app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5015
CMD ["python", "app.py"]

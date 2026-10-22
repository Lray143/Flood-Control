# Use official slim Python runtime
FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8000
ENV HOST=0.0.0.0

WORKDIR /app

# Install Python dependencies first for caching (pre-built wheels from PyPI)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code and assets
COPY src/ ./src/
COPY static/ ./static/
COPY data/ ./data/
COPY main.py .

EXPOSE 8000

# Health check using Python's standard library (no curl package needed)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/')" || exit 1

CMD ["python", "main.py"]

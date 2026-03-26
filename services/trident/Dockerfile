FROM python:3.11-slim-bookworm

# Build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy shared base first (layer cache optimization)
COPY shared /app/shared

# Install dependencies
COPY trident/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r ./requirements.txt

# Copy service
COPY trident /app

EXPOSE ${PORT:-8002}

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8002} --workers 2 --log-level info"]

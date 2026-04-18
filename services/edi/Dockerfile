FROM python:3.11-slim-bookworm

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code
COPY . .

COPY docker-entrypoint-database-url.sh /usr/local/bin/docker-entrypoint-database-url.sh
RUN chmod +x /usr/local/bin/docker-entrypoint-database-url.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8006/health || exit 1

EXPOSE 8006

ENTRYPOINT ["/usr/local/bin/docker-entrypoint-database-url.sh"]
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8006} --workers 2 --loop uvloop"]

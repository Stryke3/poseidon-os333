FROM python:3.11-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY lite/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY lite /app

EXPOSE 8010

ENV PORT=8010
ENV LITE_DATA_DIR=/app/data/lite_files

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8010} --workers 1 --log-level info"]

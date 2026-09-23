FROM python:3.13-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/main.py backend/media_center.py backend/create_owner.py backend/migrate.py ./
COPY backend/test_*.py ./
COPY backend/migrations ./migrations
COPY tools ./tools
COPY data.js ./
EXPOSE 8000
CMD ["fastapi","run","main.py","--port","8000"]

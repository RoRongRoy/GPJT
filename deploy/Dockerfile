FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
RUN useradd --uid 1000 --create-home game \
    && mkdir -p /app/data /app/backups \
    && chown -R game:game /app
COPY --chown=game:game server/ ./server/
COPY --chown=game:game public/ ./public/
COPY --chown=game:game tools/backup.py ./tools/backup.py
USER game
EXPOSE 8080
STOPSIGNAL SIGINT
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/', timeout=2).close()"
CMD ["python", "-m", "server.main", "--host", "0.0.0.0", "--port", "8080", "--data", "/app/data/world.sqlite3"]

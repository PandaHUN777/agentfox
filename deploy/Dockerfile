# Nometria control plane — gateway + API.
#
# Only permissive-licence extras are installed (Appendix A.4): no Llama Guard, no
# ShieldGemma, no BSL dependency. A customer must not inherit a licence obligation by
# running `docker compose up`.
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libpq5 \
 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src

# `postgres` for the compose database. The heavier OSS extras (Presidio, Granite
# Guardian, Garak, PyRIT) are deliberately NOT baked in: they pull multi-GB model
# stacks and would break the air-gap install story (NFR-4/NFR-9). Add them with
# `pip install nometria[pii,classifiers,redteam]` in an image that wants them.
RUN pip install --upgrade pip && pip install ".[postgres,otel]"

COPY compliance ./compliance
COPY policies ./policies

RUN useradd --create-home --uid 10001 nometria \
 && mkdir -p /var/nometria/evidence \
 && chown -R nometria:nometria /var/nometria /app
USER nometria

EXPOSE 8080

# Seed on first boot so the stack is demonstrable immediately, then serve. Seeding is
# idempotent, so a restart against an existing database is a no-op.
CMD ["sh", "-c", "nometria seed || true; exec uvicorn nometria.gateway.app:app --host 0.0.0.0 --port 8080"]

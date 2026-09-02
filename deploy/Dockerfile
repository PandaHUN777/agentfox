# syntax=docker/dockerfile:1.7
# Nometria control plane — gateway + API.
#
# All four permissive-licence classifier/embedding models (Granite Guardian, PIGuard,
# the protectai ensemble backstop, and the embedding-similarity detector — all
# Apache-2.0/MIT) are baked in and pre-fetched at build time below, plus the
# licence-gated Llama Guard 3-8B tier (Appendix A.4: non-OSI licence, acceptable-use
# policy, >700M-MAU clause — legal review required before commercial deployment,
# which is why it stays behind NOMETRIA_ACCEPT_RESTRICTED_MODEL_LICENSES=1 at runtime
# and behind an explicit build secret here, never a plain ENV, so the token can't leak
# into an image layer or `docker history`).
#
# This makes the image materially bigger (~1-2GB of model weights) and the build
# requires network egress + a Hugging Face token that has accepted Meta's Llama
# licence at huggingface.co — see deploy/README (or ask) for exactly how to build it.
# The running container itself still makes no outbound calls for any of this: weights
# are read from the image, never fetched at request time (NFR-4/NFR-9).
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/var/nometria/hf-cache

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libpq5 \
 && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src

# `postgres`/`otel` for the compose stack, `classifiers` (transformers + torch) for
# every model-based detector below.
RUN pip install --upgrade pip && pip install ".[postgres,otel,classifiers]"

RUN mkdir -p /var/nometria/hf-cache

# Permissive tier — Apache-2.0/MIT, no licence gate, no secret needed.
RUN python -c "\
from transformers import AutoModelForSequenceClassification, AutoTokenizer, AutoModel; \
AutoTokenizer.from_pretrained('ibm-granite/granite-guardian-3.0-2b'); \
AutoModelForSequenceClassification.from_pretrained('ibm-granite/granite-guardian-3.0-2b'); \
AutoTokenizer.from_pretrained('leolee99/PIGuard', trust_remote_code=True); \
AutoModelForSequenceClassification.from_pretrained('leolee99/PIGuard', trust_remote_code=True); \
AutoTokenizer.from_pretrained('protectai/deberta-v3-base-prompt-injection-v2'); \
AutoModelForSequenceClassification.from_pretrained('protectai/deberta-v3-base-prompt-injection-v2'); \
AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2'); \
AutoModel.from_pretrained('sentence-transformers/all-MiniLM-L6-v2'); \
print('permissive-tier weights cached')"

# Restricted tier — meta-llama/Llama-Guard-3-8B is a *gated* HF repo: this only
# succeeds once the account behind the token has clicked "accept" on Meta's licence
# for this model at https://huggingface.co/meta-llama/Llama-Guard-3-8B. The secret is
# mounted only for this one step (least privilege) and is never written to a layer —
# BuildKit secret mounts don't persist in the final image or `docker history`.
# Build with: DOCKER_BUILDKIT=1 docker build --secret id=hf_token,env=HF_TOKEN ...
# (docker compose: see deploy/docker-compose.yml's `secrets:` block).
RUN --mount=type=secret,id=hf_token \
    HF_TOKEN="$(cat /run/secrets/hf_token)" python -c "\
import os; \
from huggingface_hub import login; \
login(token=os.environ['HF_TOKEN']); \
from transformers import AutoModelForSequenceClassification, AutoTokenizer; \
AutoTokenizer.from_pretrained('meta-llama/Llama-Guard-3-8B'); \
AutoModelForSequenceClassification.from_pretrained('meta-llama/Llama-Guard-3-8B'); \
print('restricted-tier weights cached')"

COPY compliance ./compliance
COPY policies ./policies

RUN useradd --create-home --uid 10001 nometria \
 && mkdir -p /var/nometria/evidence \
 && chown -R nometria:nometria /var/nometria /app
USER nometria

EXPOSE 8080

# Seed on first boot so the stack is demonstrable immediately, then serve. Seeding is
# idempotent, so a restart against an existing database is a no-op. Schema *upgrades*
# on an existing database go through `nometria db upgrade` (Alembic), not this line —
# `create_all` cannot evolve an existing schema, and this command doesn't try to.
CMD ["sh", "-c", "nometria seed || true; exec uvicorn nometria.gateway.app:app --host 0.0.0.0 --port 8080"]

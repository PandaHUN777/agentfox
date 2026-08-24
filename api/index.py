"""Vercel entrypoint.

Exposes the same FastAPI app used for self-hosting — Vercel's Python runtime serves an
ASGI app directly, so there is nothing deployment-specific here. Configuration (which
database, which evidence directory, which auth mode) is entirely environment variables,
by the same design that lets one container run in dev, docker-compose, or a VPC without
a rebuild (see dashboard/next.config.mjs for the equivalent reasoning on the frontend).

`nometria` is installed as a regular dependency from requirements.txt (which points
at the repo root, `..`) rather than reached via a sys.path trick: Root Directory for
this Vercel project is "api", so only files that land in site-packages ship with the
function — a loose sibling directory like ../src never does.
"""

from nometria.gateway.app import app

__all__ = ["app"]

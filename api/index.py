"""Vercel entrypoint.

Exposes the same FastAPI app used for self-hosting — Vercel's Python runtime serves an
ASGI app directly, so there is nothing deployment-specific here. Configuration (which
database, which evidence directory, which auth mode) is entirely environment variables,
by the same design that lets one container run in dev, docker-compose, or a VPC without
a rebuild (see dashboard/next.config.mjs for the equivalent reasoning on the frontend).

`src/` is added to the path directly rather than pip-installing the local package: this
function's dependencies live in requirements.txt right beside this file (see its header
for why it isn't the repo-root pyproject.toml), and resolving an editable install of a
parent directory from inside this one is more moving parts than the problem needs.
"""

import os
import sys
from pathlib import Path

_here = Path(__file__).resolve().parent
sys.path.insert(0, str(_here / "src"))

print(f"DEBUG cwd={os.getcwd()!r} here={_here!r}", file=sys.stderr)
print(f"DEBUG listdir(here)={os.listdir(_here)!r}", file=sys.stderr)
print(f"DEBUG listdir(/var/task)={os.listdir('/var/task')!r}", file=sys.stderr)
if (_here / "src").exists():
    print(f"DEBUG listdir(here/src)={os.listdir(_here / 'src')!r}", file=sys.stderr)
else:
    print(f"DEBUG src NOT FOUND at {_here / 'src'!r}", file=sys.stderr)

from nometria.gateway.app import app  # noqa: E402

__all__ = ["app"]

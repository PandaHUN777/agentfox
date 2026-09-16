#!/usr/bin/env bash
# Run the nometria CLI however it is available here, so skills never have to guess.
#   1. an installed `nometria` on PATH
#   2. a source checkout of this repo with uv  -> `uv run nometria`
#   3. a source checkout with a local .venv    -> .venv/bin/python -m nometria.cli.main
# Otherwise print the install line and exit 127.
set -euo pipefail
if command -v nometria >/dev/null 2>&1; then
  exec nometria "$@"
fi
root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -n "$root" && -f "$root/pyproject.toml" ]] && grep -q '^name = "nometria"' "$root/pyproject.toml"; then
  if command -v uv >/dev/null 2>&1; then
    exec uv run --project "$root" nometria "$@"
  fi
  if [[ -x "$root/.venv/bin/python" ]]; then
    PYTHONPATH="$root/src${PYTHONPATH:+:$PYTHONPATH}" exec "$root/.venv/bin/python" -m nometria.cli.main "$@"
  fi
fi
echo "nometria is not installed. Install it with:" >&2
echo '  pip install "git+https://github.com/architsharm/guardrails.git"' >&2
exit 127

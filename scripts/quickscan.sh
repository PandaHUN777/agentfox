#!/usr/bin/env bash
# Nometria Quickscan — one command, no account, nothing leaves this machine.
#
#   curl -fsSL https://raw.githubusercontent.com/architsharm/guardrails/main/scripts/quickscan.sh | bash
#
# Installs Nometria into a throwaway virtualenv (removed on exit either way) and runs
# `agentfox quickscan` against the current directory. It's the same package
# `pip install nometria` would give you — this script exists only to skip "clone,
# create a venv, activate it, pip install" for a first look. No step here talks to
# anything but PyPI/GitHub (to fetch the package itself) and your local filesystem.

set -euo pipefail

REPO_URL="https://github.com/architsharm/guardrails.git"
TARGET_DIR="${1:-.}"

info() { printf '%s\n' "$*" >&2; }

PYTHON_BIN="${NOMETRIA_PYTHON:-}"
if [ -z "$PYTHON_BIN" ]; then
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      PYTHON_BIN="$candidate"
      break
    fi
  done
fi
if [ -z "$PYTHON_BIN" ]; then
  info "Nometria Quickscan needs Python 3.10+ and none was found on PATH."
  info "Install Python, then re-run this script."
  exit 1
fi

WORKDIR="$(mktemp -d -t nometria-quickscan-XXXXXX)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

info "Nometria Quickscan — setting up in a throwaway environment (nothing leaves this machine)..."

"$PYTHON_BIN" -m venv "$WORKDIR/venv"
# shellcheck disable=SC1091
source "$WORKDIR/venv/bin/activate"

if ! pip install --quiet --disable-pip-version-check "git+${REPO_URL}" >"$WORKDIR/install.log" 2>&1; then
  info "Install failed. Last few lines:"
  tail -n 20 "$WORKDIR/install.log" >&2
  info ""
  info "You can also install it yourself: pip install \"git+${REPO_URL}\""
  exit 1
fi

exec agentfox quickscan "$TARGET_DIR"

#!/usr/bin/env bash
# File six good-first-issues on GitHub, with labels, once.
#
# Why this is a script rather than issues that already exist: the `gh` CLI on the
# machine that wrote it was authenticated as an account with pull-but-not-push on
# this repository — both accounts in its keyring were. It could read the label
# list and never create one. Run this as an account that can write:
#
#   gh auth status                       # confirm you are the right account
#   bash scripts/file_first_issues.sh
#
# Safe to re-run: it skips any issue whose exact title already exists, open or
# closed, so a partial run can be finished without producing duplicates.
set -euo pipefail
REPO="${REPO:-architsharm/agentfox}"

command -v gh >/dev/null || { echo "gh is not installed: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh is not authenticated. Run: gh auth login"; exit 1; }
if [ "$(gh api "repos/$REPO" --jq .permissions.push 2>/dev/null)" != "true" ]; then
  echo "The active gh account cannot write to $REPO."
  echo "Run 'gh auth switch' or 'gh auth login' as an account with push access, then re-run."
  exit 1
fi

mklabel() { gh label create "$1" --repo "$REPO" --color "$2" --description "$3" >/dev/null 2>&1 || true; }
mklabel "deploy"    "1d76db" "Self-hosting and deployment"
mklabel "cli"       "5319e7" "The agentfox command line"
mklabel "detectors" "0e8a16" "Guardrail detectors"

# Titles already on the tracker, so re-running this is harmless.
EXISTING="$(gh issue list --repo "$REPO" --state all --limit 200 --json title --jq '.[].title')"

file() { # $1 title, $2 labels, $3 body
  if printf '%s\n' "$EXISTING" | grep -Fxq "$1"; then
    echo "skip (exists): $1"
    return
  fi
  echo "filing: $1"
  gh issue create --repo "$REPO" --title "$1" --label "$2" --body "$3"
}

file 'Write the Fly.io deployment guide' 'good first issue,documentation,deploy,help wanted' '`deploy/fly.dashboard.toml` carries its `fly launch` and `fly deploy` commands in its own header
comment, but there is no prose guide and `deploy/README-dashboard.md` does not mention Fly at all.
The README currently points at the toml because that is the honest thing to point at.

**Do:** add a Fly section to `deploy/README-dashboard.md`, or a `deploy/FLY.md` linked from it,
covering launch, which secrets to set and where each comes from (`GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `NOMETRIA_SERVICE_AUTH_SECRET`), deploy with the build-context caveat
already noted in the toml, and the post-deploy OAuth callback step every path needs.

**Copy from:** [`render.yaml`](https://github.com/architsharm/agentfox/blob/main/render.yaml) — the same deployment for another platform, with the
same environment variables.

**Check:** `fly config validate --config deploy/fly.dashboard.toml` parses without a paid account.
If you do deploy it, note the free-tier behaviour in the PR; we do not have that information.'

file 'Add `--json` output to `agentfox doctor`' 'good first issue,cli,help wanted' '`doctor` grades how well an estate is declared, which is exactly the thing people want to assert on
in CI — and it currently only prints a table. Ten single commands lack `--json`; this is the one
most worth having.

**Copy from:** `src/agentfox/cli/auth_cli.py:80` (`tokens`) and `business_cli.py:114`
(`rules_check`). Both take `as_json: bool = typer.Option(False, "--json")` and branch before
rendering.

**Check:** add a test beside the existing CLI tests asserting `--json` emits parseable JSON with the
same grade the table shows. `pytest tests/ -q -k doctor`.'

file 'Add `--json` output to `agentfox check`' 'good first issue,cli,help wanted' 'Same shape as #2, different command, so the two can be done in parallel by different people.
`check` is what a first-time user runs against their repository, and JSON output is what lets it
become a CI step.

**Copy from:** the same two commands as #2.

**Check:** `pytest tests/ -q -k check`, plus a test that the JSON lists the same call sites the
human output does.'

file 'Write a bare-metal / systemd deployment guide' 'good first issue,documentation,deploy,help wanted' 'The README documents three self-host paths: one-click, Docker Compose, and plain Python. The plain
Python path stops at `uvicorn`, which is not how anyone runs a service that has to survive a
reboot.

**Do:** add a short guide covering a systemd unit for the gateway, where the evidence directory and
`NOMETRIA_AUDIT_SIGNING_KEY` should live and why they belong outside the application database
(Appendix E.2.2), and how to run migrations on upgrade.

**Check:** the unit file should actually start on a clean VM. Say in the PR which distribution you
tested on.'

file 'Add a lexical detector' 'good first issue,detectors,help wanted' 'The five default detectors are zero-dependency and lexical. Adding a sixth is a well-bounded way to
learn the guardrail path, and the registration is one line.

**Copy from:** `src/agentfox/guardrails/detectors/secrets.py` — a `BaseDetector` subclass with a
`key` (`"secrets.native"`) and a check method. Register it in
`src/agentfox/guardrails/__init__.py` beside the existing `register_detector(...)` calls.

**Pick something real.** A detector that fires on nothing anyone sends is worse than no detector.
Open an issue describing what you want to catch before writing it, so we can agree it is worth a
default slot — anything added to the shipped defaults changes everyone'\''s false-positive rate.

**Check:** `pytest tests/ -q -k detector`, and add cases for both a true positive and a benign
string that must not fire.'

file 'Test that the vendored wheel matches the source' 'good first issue,help wanted' 'The Vercel API gateway ships as a prebuilt wheel checked into `api/vendor/`, installed by exact
filename from `api/requirements.txt`. In September 2026 that wheel went a month without being
rebuilt: `api/vendor/.gitignore` was a single `*`, so no rebuild ever reached the repository and the
deployed gateway silently served month-old code while CI stayed green and `/health` returned 200.

The `.gitignore` is fixed and CI has a `vendored-wheel-freshness` job, but that job compares changed
paths — it cannot tell you the wheel'\''s *contents* are stale, only that it was not touched in the
same commit.

**Do:** add a test that opens `api/vendor/agentfox-*.whl` with `zipfile` and asserts the module list
inside matches what `src/agentfox` currently contains. It should fail loudly if a module exists in
source but not in the wheel.

**Check:** delete a module from the wheel in a scratch copy and confirm your test fails. The point
is that it catches the real failure, not that it passes today.'

echo
echo "Done. See them at:"
echo "  https://github.com/$REPO/labels/good%20first%20issue"

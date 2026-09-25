# Good first tasks

Work that is genuinely self-contained: each one names the file to change, the pattern to copy from,
and how to check you got it right. None of them needs you to understand the whole control plane.

Every task here came out of a real gap someone hit, not from a list of nice-to-haves. If you pick
one up, say so on the issue so two people do not do it twice.

New to the repo? [`CONTRIBUTING.md`](../CONTRIBUTING.md) has setup and the PR flow. The short
version: `uv sync --extra dev`, then `pytest tests/ -q`.

---

## 1. Write the Fly.io deployment guide

**Labels** `good first issue` `documentation` `deploy`

`deploy/fly.dashboard.toml` carries its `fly launch` and `fly deploy` commands in its own header
comment, but there is no prose guide and `deploy/README-dashboard.md` does not mention Fly at all.
The README currently points at the toml because that is the honest thing to point at.

**Do:** add a Fly section to `deploy/README-dashboard.md`, or a `deploy/FLY.md` linked from it,
covering launch, which secrets to set and where each comes from (`GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `NOMETRIA_SERVICE_AUTH_SECRET`), deploy with the build-context caveat
already noted in the toml, and the post-deploy OAuth callback step every path needs.

**Copy from:** [`render.yaml`](../render.yaml) — the same deployment for another platform, with the
same environment variables.

**Check:** `fly config validate --config deploy/fly.dashboard.toml` parses without a paid account.
If you do deploy it, note the free-tier behaviour in the PR; we do not have that information.

---

## 2. Add `--json` to `agentfox doctor`

**Labels** `good first issue` `cli`

`doctor` grades how well an estate is declared, which is exactly the thing people want to assert on
in CI — and it currently only prints a table. Ten single commands lack `--json`; this is the one
most worth having.

**Copy from:** `src/agentfox/cli/auth_cli.py:80` (`tokens`) and `business_cli.py:114`
(`rules_check`). Both take `as_json: bool = typer.Option(False, "--json")` and branch before
rendering.

**Check:** add a test beside the existing CLI tests asserting `--json` emits parseable JSON with the
same grade the table shows. `pytest tests/ -q -k doctor`.

---

## 3. Add `--json` to `agentfox check`

**Labels** `good first issue` `cli`

Same shape as #2, different command, so the two can be done in parallel by different people.
`check` is what a first-time user runs against their repository, and JSON output is what lets it
become a CI step.

**Copy from:** the same two commands as #2.

**Check:** `pytest tests/ -q -k check`, plus a test that the JSON lists the same call sites the
human output does.

---

## 4. A bare-metal / systemd deployment guide

**Labels** `good first issue` `documentation` `deploy`

The README documents three self-host paths: one-click, Docker Compose, and plain Python. The plain
Python path stops at `uvicorn`, which is not how anyone runs a service that has to survive a
reboot.

**Do:** add a short guide covering a systemd unit for the gateway, where the evidence directory and
`NOMETRIA_AUDIT_SIGNING_KEY` should live and why they belong outside the application database
(Appendix E.2.2), and how to run migrations on upgrade.

**Check:** the unit file should actually start on a clean VM. Say in the PR which distribution you
tested on.

---

## 5. Add a lexical detector

**Labels** `good first issue` `detectors`

The five default detectors are zero-dependency and lexical. Adding a sixth is a well-bounded way to
learn the guardrail path, and the registration is one line.

**Copy from:** `src/agentfox/guardrails/detectors/secrets.py` — a `BaseDetector` subclass with a
`key` (`"secrets.native"`) and a check method. Register it in
`src/agentfox/guardrails/__init__.py` beside the existing `register_detector(...)` calls.

**Pick something real.** A detector that fires on nothing anyone sends is worse than no detector.
Open an issue describing what you want to catch before writing it, so we can agree it is worth a
default slot — anything added to the shipped defaults changes everyone's false-positive rate.

**Check:** `pytest tests/ -q -k detector`, and add cases for both a true positive and a benign
string that must not fire.

---

## 6. A test that the vendored wheel matches the source

**Labels** `good first issue` `help wanted`

The Vercel API gateway ships as a prebuilt wheel checked into `api/vendor/`, installed by exact
filename from `api/requirements.txt`. In September 2026 that wheel went a month without being
rebuilt: `api/vendor/.gitignore` was a single `*`, so no rebuild ever reached the repository and the
deployed gateway silently served month-old code while CI stayed green and `/health` returned 200.

The `.gitignore` is fixed and CI has a `vendored-wheel-freshness` job, but that job compares changed
paths — it cannot tell you the wheel's *contents* are stale, only that it was not touched in the
same commit.

**Do:** add a test that opens `api/vendor/agentfox-*.whl` with `zipfile` and asserts the module list
inside matches what `src/agentfox` currently contains. It should fail loudly if a module exists in
source but not in the wheel.

**Check:** delete a module from the wheel in a scratch copy and confirm your test fails. The point
is that it catches the real failure, not that it passes today.

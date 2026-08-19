"""The three commands a new user runs, and nothing else.

The rest of the CLI has forty commands across nine sub-apps, which is right for an
operator running a governance programme and wrong for the first ten minutes. Someone
evaluating this should be able to type three words and understand their exposure:

    nometria init      # set everything up
    nometria check     # scan the repo and highlight what is ungoverned
    nometria doctor    # is the runtime configured the way I think it is?

Every one of them is safe to run: `init` is idempotent, `check` reads source without
importing it, and `doctor` only reports. None of them can break a running system, so
nobody has to read the docs before trying one.
"""

from __future__ import annotations

import json
from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

SEVERITY_COLOUR = {
    "critical": "red",
    "high": "red",
    "medium": "yellow",
    "low": "cyan",
    "info": "dim",
}

_CONFIG_TEMPLATE = """# Nometria configuration.
# Everything here has a safe default; this file exists so the defaults are visible
# rather than implicit. Environment variables (NOMETRIA_*) override it.

[nometria]
environment = "{environment}"

# Observe-first. Nothing is blocked until someone changes this deliberately.
default_policy_mode = "observe"

# Zero egress: no model call leaves this machine unless you turn it on.
allow_egress = false

# The whole pre-flight pipeline's latency ceiling, in milliseconds.
enforcement_budget_ms = 100
"""


def _print_next_steps(steps: list[tuple[str, str]]) -> None:
    """A command that ends without a next action makes the reader do the synthesis."""
    table = Table(show_header=False, box=None, padding=(0, 2))
    for command, why in steps:
        table.add_row(f"[bold cyan]{command}[/]", f"[dim]{why}[/]")
    console.print()
    console.print(Panel(table, title="[bold]Next[/]", title_align="left", border_style="dim"))


def init(
    path: Path = typer.Option(Path("."), "--path", "-p", help="Project directory."),
    environment: str = typer.Option("development", "--env", "-e"),
    demo: bool = typer.Option(False, "--demo", help="Also load the demo fixtures."),
) -> None:
    """Set everything up. Idempotent, offline, and safe to run twice.

    Creates the database, applies migrations, loads the control catalog and the
    baseline policy pack in observe mode, and writes a config file so the defaults are
    visible rather than implicit.
    """
    from ..compliance import load_catalog, sync_catalog
    from ..config import get_settings
    from ..db import init_db, session_scope
    from ..policy import load_from_dir, save_policy

    settings = get_settings()
    console.print("[bold]Setting up Nometria[/]")

    init_db()
    console.print(f"  [green]✓[/] database ready  [dim]{settings.database_url}[/]")

    with session_scope() as session:
        summary = sync_catalog(session)
        catalog = load_catalog()
        console.print(
            f"  [green]✓[/] {summary['controls_created'] + summary['controls_updated']} controls "
            f"across {len(catalog.get('frameworks', []))} frameworks  "
            f"[dim]v{catalog.get('version')} ({catalog.get('review_status')})[/]"
        )

        if settings.policies_dir.exists():
            documents = load_from_dir(settings.policies_dir)
            for document in documents:
                save_policy(session, document, author="init", notes="loaded by nometria init")
            console.print(
                f"  [green]✓[/] {len(documents)} policy pack(s) loaded  "
                f"[dim]observe mode — nothing is blocked yet[/]"
            )

    config_path = Path(path) / "nometria.toml"
    if config_path.exists():
        console.print(f"  [dim]·[/] {config_path.name} already exists, left alone")
    else:
        config_path.write_text(_CONFIG_TEMPLATE.format(environment=environment))
        console.print(f"  [green]✓[/] wrote {config_path.name}")

    if demo:
        from ..seed import seed

        with session_scope() as session:
            seed(session)
        console.print("  [green]✓[/] demo fixtures loaded")

    _print_next_steps(
        [
            ("nometria check", "scan this repo and see what is ungoverned"),
            ("import nometria; nometria.auto()", "one line in your entry point"),
            ("nometria serve", "open the control plane"),
        ]
    )


def check(
    path: Path = typer.Argument(Path("."), help="Directory to scan."),
    as_json: bool = typer.Option(False, "--json"),
    limit: int = typer.Option(15, "--limit", "-n", help="Findings to show."),
    fail_on_ungoverned: bool = typer.Option(
        False, "--fail", help="Exit non-zero if any model call is ungoverned (for CI)."
    ),
) -> None:
    """Scan a repository and highlight everything worth governing.

    Static only: reads the source, never imports or runs it. Importing the target
    would execute arbitrary code from a repo the operator may not trust, and would
    fail on anything with an import-time side effect — which is most real
    applications.
    """
    from ..discovery import scan

    report = scan(path)
    if as_json:
        console.print_json(json.dumps(report.to_json(), default=str))
        raise typer.Exit(1 if fail_on_ungoverned and report.ungoverned else 0)

    console.print(f"[bold]Scanned[/] {report.files_scanned} files in [dim]{report.root}[/]")
    if report.frameworks:
        console.print(f"  [dim]built on:[/] {', '.join(report.frameworks)}")

    calls = len(report.model_calls)
    ungoverned = len(report.ungoverned)
    if calls:
        tone = "red" if ungoverned else "green"
        console.print(
            f"\n  [{tone}]{ungoverned}[/] of [bold]{calls}[/] model call sites are "
            f"ungoverned  [dim]({report.coverage:.0%} covered)[/]"
        )
    counts = report.by_kind()
    other = {k: v for k, v in counts.items() if k != "model_call"}
    if other:
        console.print(
            "  [dim]also found:[/] "
            + ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in other.items())
        )

    ranked = report.ranked(limit)
    if ranked:
        table = Table(box=None, padding=(0, 2), header_style="dim")
        table.add_column("")
        table.add_column("where")
        table.add_column("what")
        for site in ranked:
            colour = SEVERITY_COLOUR.get(site.severity, "dim")
            mark = "[green]✓[/]" if site.governed else f"[{colour}]●[/]"
            table.add_row(mark, f"[dim]{site.file}:{site.line}[/]", site.detail[:78])
        console.print()
        console.print(table)
        if len(report.sites) > len(ranked):
            console.print(f"  [dim]… and {len(report.sites) - len(ranked)} more (--limit)[/]")

    if report.errors:
        console.print(f"\n  [yellow]{len(report.errors)} file(s) could not be parsed[/]")
        for error in report.errors[:3]:
            console.print(f"    [dim]{error}[/]")

    console.print()
    console.print(
        Panel(report.next_step(), border_style="cyan", title="[bold]Next[/]", title_align="left")
    )
    if fail_on_ungoverned and report.ungoverned:
        raise typer.Exit(1)


def doctor(as_json: bool = typer.Option(False, "--json")) -> None:
    """Is the runtime configured the way you think it is?

    Reports only — it changes nothing. Every line is a fact about this deployment, and
    each one names the consequence rather than the setting, because "fail_mode=open"
    means nothing to someone who has not read the PRD.
    """
    from ..config import get_settings
    from ..db import session_scope
    from ..guardrails import available_detectors
    from ..models import Agent, Decision, Finding, KnowledgeBoundary, Trace
    from ..providers import available_providers

    settings = get_settings()
    checks: list[tuple[str, str, str]] = []

    def add(state: str, what: str, detail: str) -> None:
        checks.append((state, what, detail))

    try:
        from ..db import init_db

        init_db()
        with session_scope() as session:
            agents = session.query(Agent).count()
            traces = session.query(Trace).count()
            decisions = session.query(Decision).count()
            findings = session.query(Finding).filter_by(status="open").count()
            boundaries = session.query(KnowledgeBoundary).count()
            enforcing = (
                session.query(Decision).filter_by(mode="enforce").count() if decisions else 0
            )
        add("ok", "database", f"reachable — {agents} agent(s), {traces} trace(s)")
    except Exception as exc:
        add("bad", "database", f"unreachable: {exc}")
        agents = traces = decisions = findings = boundaries = enforcing = 0

    if decisions == 0:
        add(
            "warn",
            "traffic",
            "no decisions recorded — nothing has been governed yet. "
            "Add `nometria.auto()` to your entry point.",
        )
    elif enforcing == 0:
        add(
            "warn",
            "enforcement",
            f"{decisions} decision(s), all in observe mode — recorded, nothing blocked. "
            "That is the safe default, not a finished configuration.",
        )
    else:
        add("ok", "enforcement", f"{enforcing} of {decisions} decisions enforced")

    # Authentication first: it is the check most likely to be wrong and most costly
    # when it is, and a deployment that fails it does not need to read the rest.
    from ..gateway.auth import header_identity_allowed

    if header_identity_allowed():
        add(
            "warn"
            if settings.environment.lower() in ("development", "dev", "test", "local")
            else "bad",
            "authentication",
            f"the X-Nometria-User header is accepted (environment={settings.environment}, "
            f"auth_mode={settings.auth_mode}) — anyone who can reach this port is any "
            "user they name. Fine locally, unacceptable anywhere else.",
        )
    else:
        add("ok", "authentication", "API tokens required; the identity header is refused")

    detectors = available_detectors()
    add(
        "ok" if detectors else "bad",
        "detectors",
        f"{len(detectors)} available: {', '.join(sorted(detectors))}",
    )

    providers = available_providers()
    if providers == {"echo"}:
        add(
            "ok",
            "providers",
            "offline only (echo). No model call can leave this machine — set "
            "NOMETRIA_ALLOW_EGRESS=1 and a key to change that.",
        )
    else:
        add("ok", "providers", f"{', '.join(sorted(providers))}")

    add(
        "warn" if settings.fail_mode == "open" else "ok",
        "detector failure",
        "fail-open: a detector that times out lets the request through and records the gap"
        if settings.fail_mode == "open"
        else "fail-closed: a degraded detector blocks the request",
    )

    if boundaries == 0:
        add(
            "warn",
            "answerability",
            "no knowledge boundary declared — nothing stops an agent answering a "
            "question it has no data for (P7).",
        )
    else:
        add("ok", "answerability", f"{boundaries} boundary/boundaries declared")

    if findings:
        add("warn", "findings", f"{findings} open — run `nometria findings`")
    else:
        add("ok", "findings", "none open")

    if as_json:
        console.print_json(
            json.dumps([{"state": s, "check": c, "detail": d} for s, c, d in checks])
        )
        return

    console.print("[bold]Runtime check[/]")
    marks = {"ok": "[green]✓[/]", "warn": "[yellow]![/]", "bad": "[red]✗[/]"}
    table = Table(box=None, padding=(0, 2), show_header=False)
    for state, what, detail in checks:
        table.add_row(marks[state], f"[bold]{what}[/]", detail)
    console.print(table)

    if any(state == "bad" for state, _w, _d in checks):
        raise typer.Exit(1)


def findings_cmd(
    severity: str | None = typer.Option(None, "--severity", "-s"),
    limit: int = typer.Option(20, "--limit", "-n"),
    as_json: bool = typer.Option(False, "--json"),
) -> None:
    """What the platform found. The list `nometria.auto()` tells you to read."""
    from sqlalchemy import select

    from ..db import session_scope
    from ..models import Finding

    with session_scope() as session:
        stmt = (
            select(Finding)
            .where(Finding.status == "open")
            .order_by(Finding.created_at.desc())
            .limit(limit)
        )
        if severity:
            stmt = stmt.where(Finding.severity == severity)
        rows = [
            {
                "id": f.id,
                "type": f.type,
                "severity": f.severity,
                "title": f.title,
                "subject": f"{f.subject_type}:{f.subject_id}",
                "at": f.created_at.isoformat(),
            }
            for f in session.scalars(stmt)
        ]

    if as_json:
        console.print_json(json.dumps(rows, default=str))
        return
    if not rows:
        console.print("[green]No open findings.[/]")
        return

    table = Table(box=None, padding=(0, 2), header_style="dim")
    table.add_column("severity")
    table.add_column("type")
    table.add_column("what")
    for row in rows:
        colour = SEVERITY_COLOUR.get(row["severity"], "dim")
        table.add_row(
            f"[{colour}]{row['severity']}[/]", f"[dim]{row['type']}[/]", row["title"][:80]
        )
    console.print(table)
    console.print(f"\n  [dim]{len(rows)} open finding(s). Full detail in the control plane.[/]")


def quickstart() -> None:
    """Print the shortest path from nothing to governed."""
    console.print(
        Panel(
            "\n".join(
                [
                    "[bold]1.[/] [cyan]nometria init[/]",
                    "   [dim]database, controls, baseline policy in observe mode[/]",
                    "",
                    "[bold]2.[/] Add one line to your entry point:",
                    "   [cyan]import nometria; nometria.auto()[/]",
                    "   [dim]every model call is now traced, evaluated and audited[/]",
                    "",
                    "[bold]3.[/] [cyan]nometria check[/]",
                    "   [dim]see what is still ungoverned[/]",
                    "",
                    "[bold]4.[/] [cyan]nometria findings[/]",
                    "   [dim]see what it found[/]",
                    "",
                    "[bold]5.[/] [cyan]nometria policy enforce baseline[/]",
                    "   [dim]when the findings look right — this is the only step that blocks[/]",
                ]
            ),
            title="[bold]Nometria in five steps[/]",
            title_align="left",
            border_style="cyan",
        )
    )


def register(app: typer.Typer) -> None:
    """Attach the onboarding commands as top-level verbs."""
    app.command(name="init")(init)
    app.command(name="check")(check)
    app.command(name="doctor")(doctor)
    app.command(name="findings")(findings_cmd)
    app.command(name="quickstart")(quickstart)

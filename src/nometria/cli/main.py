"""Nometria CLI.

The commands a platform engineer runs (``eval gate``, ``policy simulate``) and the
commands a compliance lead runs (``compliance status``, ``evidence export``) are the
same binary against the same API. That is the land-and-expand path in PRD §4.3
expressed as a tool: the engineer installs it for CI, and the CISO finds their view
already there.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path
from typing import Any

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from .. import __version__

app = typer.Typer(
    name="nometria",
    help="Agent-native, vendor-neutral governance for AI agents in production.",
    no_args_is_help=True,
    add_completion=False,
)
console = Console()

agents_app = typer.Typer(help="Agent registry and discovery (Pillar 1).", no_args_is_help=True)
policy_app = typer.Typer(
    help="Policy authoring, simulation and promotion (Pillar 6).", no_args_is_help=True
)
eval_app = typer.Typer(help="Evaluation, CI gating and drift (Pillar 4).", no_args_is_help=True)
audit_app = typer.Typer(help="Audit chain verification (Pillar 5).", no_args_is_help=True)
evidence_app = typer.Typer(help="Auditor evidence packages (Pillar 5).", no_args_is_help=True)
compliance_app = typer.Typer(help="Controls, frameworks and risk (Pillar 6).", no_args_is_help=True)
redteam_app = typer.Typer(help="Adversarial testing (Pillar 4).", no_args_is_help=True)
scan_app = typer.Typer(help="Hygiene scanning (Pillar 1).", no_args_is_help=True)
db_app = typer.Typer(help="Database schema migrations (PL-2).", no_args_is_help=True)

app.add_typer(agents_app, name="agents")
app.add_typer(policy_app, name="policy")
app.add_typer(eval_app, name="eval")
app.add_typer(audit_app, name="audit")
app.add_typer(evidence_app, name="evidence")
app.add_typer(compliance_app, name="compliance")
app.add_typer(redteam_app, name="redteam")
app.add_typer(scan_app, name="scan")
app.add_typer(db_app, name="db")


def _session():
    from ..db import init_db, session_scope

    init_db()
    return session_scope()


def _emit(payload: Any, as_json: bool) -> None:
    if as_json:
        console.print_json(json.dumps(payload, default=str))


# ---------------------------------------------------------------------------
# Top-level
# ---------------------------------------------------------------------------


@app.command()
def version() -> None:
    """Show every version that participates in a decision (X-4)."""
    from ..compliance.catalog import load_catalog
    from ..config import get_settings

    settings = get_settings()
    catalog = load_catalog()
    console.print(
        Panel.fit(
            f"[bold]Nometria[/] {__version__}\n"
            f"control catalog   {catalog.get('version')} "
            f"([yellow]{catalog.get('review_status')}[/])\n"
            f"policy engine     {settings.policy_engine}\n"
            f"default provider  {settings.default_provider}\n"
            f"default mode      {settings.default_policy_mode}\n"
            f"fail mode         {settings.fail_mode}\n"
            f"latency budget    {settings.enforcement_budget_ms}ms\n"
            f"egress allowed    {settings.allow_egress}",
            border_style="cyan",
        )
    )


@app.command()
def seed() -> None:
    """Create a demonstrable environment: agents, policies, controls, eval suite."""
    from ..seed import seed as run_seed

    with _session() as session:
        summary = run_seed(session)
    console.print("[green]seeded[/]")
    console.print(
        f"  controls    {summary['catalog']['controls_created']} created, "
        f"{summary['catalog']['mappings']} mappings "
        f"([yellow]{summary['catalog']['review_status']}[/])"
    )
    console.print(f"  obligations {summary['obligations']}")
    console.print(f"  policies    {', '.join(summary.get('policies', []))}")
    console.print(f"  agents      {', '.join(summary['agents'])}")
    console.print(f"  eval suite  {summary['eval_suite']}")
    for slug, key in (summary.get("credentials") or {}).items():
        console.print(f"  [dim]key {slug}: {key}[/]")


@app.command()
def demo() -> None:
    """Run the end-to-end walkthrough (offline)."""
    from ..db import init_db, session_scope
    from ..models import Agent
    from ..seed import register_scripts
    from ..seed import seed as run_seed

    init_db()
    with session_scope() as session:
        if session.query(Agent).count() == 0:
            console.print("[dim]no agents found — seeding first[/]")
            run_seed(session)
    # The offline provider's scripted replies live in process memory, so a demo run
    # against an already-seeded database has to re-register them.
    register_scripts()

    from .demo import run

    run()


@app.command()
def serve(
    host: str = "127.0.0.1",
    port: int = 8080,
    reload: bool = False,
) -> None:
    """Start the gateway and control-plane API."""
    import uvicorn

    console.print(f"[cyan]Nometria[/] {__version__} → http://{host}:{port}")
    console.print(f"  [dim]inline:  POST http://{host}:{port}/v1/chat/completions[/]")
    console.print(f"  [dim]api:     http://{host}:{port}/api/agents[/]")
    console.print(f"  [dim]docs:    http://{host}:{port}/docs[/]")
    uvicorn.run("nometria.gateway.app:app", host=host, port=port, reload=reload)


# ---------------------------------------------------------------------------
# db (PL-2)
# ---------------------------------------------------------------------------


@db_app.command("upgrade")
def db_upgrade(revision: str = "head") -> None:
    """Apply migrations. This is how a deployed instance is upgraded."""
    from ..db import current_revision, upgrade_db

    before = current_revision()
    upgrade_db(revision)
    after = current_revision()
    console.print(f"[green]migrated[/] {before or 'empty'} → [bold]{after}[/]")


@db_app.command("downgrade")
def db_downgrade(revision: str = typer.Argument(..., help="Target revision, or 'base'.")) -> None:
    """Roll back migrations. Every migration ships with a tested downgrade."""
    from ..db import current_revision, downgrade_db

    before = current_revision()
    downgrade_db(revision)
    console.print(f"[yellow]rolled back[/] {before} → [bold]{current_revision() or 'base'}[/]")


@db_app.command("current")
def db_current() -> None:
    """Show the applied schema revision."""
    from ..db import current_revision

    revision = current_revision()
    console.print(f"schema revision: [bold]{revision or 'none — run `nometria db upgrade`'}[/]")


# ---------------------------------------------------------------------------
# agents
# ---------------------------------------------------------------------------


@agents_app.command("list")
def agents_list(as_json: bool = typer.Option(False, "--json")) -> None:
    """List every agent, registered or shadow."""
    from sqlalchemy import select

    from ..models import Agent
    from ..registry.service import inventory

    with _session() as session:
        agents = list(session.scalars(select(Agent).order_by(Agent.slug)))
        summary = inventory(session)
        rows = [
            {
                "slug": a.slug,
                "environment": a.environment,
                "risk_tier": a.risk_tier,
                "registered": a.registered,
                "owner": a.owner_email,
                "framework": a.framework,
            }
            for a in agents
        ]
    if as_json:
        _emit({"agents": rows, "inventory": summary}, True)
        return
    table = Table(box=None, pad_edge=False)
    for column in ("agent", "env", "risk", "registered", "owner", "framework"):
        table.add_column(column, style="bold" if column == "agent" else None)
    for row in rows:
        table.add_row(
            row["slug"],
            row["environment"],
            row["risk_tier"],
            "[green]yes[/]" if row["registered"] else "[red]SHADOW[/]",
            row["owner"] or "[red]unowned[/]",
            row["framework"] or "—",
        )
    console.print(table)
    console.print(
        f"  [dim]{summary['agents']} agents · {summary['shadow']} shadow · "
        f"{summary['unowned']} unowned · {summary['lineage_edges']} lineage edges[/]"
    )


@agents_app.command("discover")
def agents_discover() -> None:
    """Sweep for shadow agents, unowned agents, registry drift and identity posture."""
    from ..identity import assess_posture
    from ..registry.service import (
        attest_registry,
        derive_lineage,
        detect_shadow_agents,
        unowned_agents,
    )

    with _session() as session:
        edges = derive_lineage(session)
        shadows = detect_shadow_agents(session)
        unowned = unowned_agents(session)
        drift = attest_registry(session)
        posture = assess_posture(session)
    console.print(f"  lineage edges derived   {edges}")
    console.print(f"  shadow agents           [red]{len(shadows)}[/]")
    console.print(f"  unowned agents          [yellow]{len(unowned)}[/]")
    console.print(f"  registry drift findings [yellow]{len(drift)}[/]")
    console.print(f"  identity posture issues [yellow]{len(posture)}[/]")
    for shadow in shadows:
        console.print(
            f"    [red]shadow[/] {shadow['slug']} — {shadow['calls']} calls "
            f"in {shadow['environment']}"
        )


@agents_app.command("lineage")
def agents_lineage(slug: str, depth: int = 2) -> None:
    """Show what an agent reaches — the blast radius."""
    from ..registry.service import derive_lineage, lineage

    with _session() as session:
        derive_lineage(session, slug)
        graph = lineage(session, slug, depth)
    console.print(f"[bold]{slug}[/] — blast radius {graph['blast_radius']}")
    for link in graph["links"]:
        console.print(
            f"  {link['source']} [dim]--{link['relation']}-->[/] {link['target']} "
            f"[dim](observed {link['observed_count']}×)[/]"
        )


@agents_app.command("quarantine")
def agents_quarantine(slug: str, reason: str = typer.Option("", "--reason", "-r")) -> None:
    """Stop an agent while you investigate. Reversible and audited."""
    _agent_state(slug, "quarantined", reason)


@agents_app.command("kill")
def agents_kill(slug: str, reason: str = typer.Option("", "--reason", "-r")) -> None:
    """Stop an agent now."""
    _agent_state(slug, "killed", reason)


@agents_app.command("resume")
def agents_resume(slug: str, reason: str = typer.Option("", "--reason", "-r")) -> None:
    """Restart a stopped agent."""
    _agent_state(slug, "active", reason)


@agents_app.command("controls")
def agents_controls() -> None:
    """Show every agent that is not in the active state."""
    from ..registry.control import all_controls

    with _session() as session:
        rows = all_controls(session)
    if not rows:
        console.print("[green]all agents active[/]")
        return
    table = Table(box=None, pad_edge=False)
    for column in ("agent", "state", "reason", "by", "when"):
        table.add_column(column, style="bold" if column == "agent" else None)
    for row in rows:
        colour = {"killed": "red", "quarantined": "yellow"}.get(row["state"], "green")
        table.add_row(
            row["agent"],
            f"[{colour}]{row['state']}[/]",
            row["reason"] or "—",
            row["actor"] or "—",
            (row["changed_at"] or "")[:19],
        )
    console.print(table)


def _agent_state(slug: str, state: str, reason: str) -> None:
    from ..registry.control import UnknownAgent, set_state

    with _session() as session:
        try:
            control = set_state(session, slug, state, reason=reason, actor="cli")
        except UnknownAgent as exc:
            console.print(f"[red]{exc}[/]")
            raise typer.Exit(1) from exc
        previous, now = control.previous_state, control.state
    colour = {"killed": "red", "quarantined": "yellow"}.get(now, "green")
    console.print(
        f"[bold]{slug}[/] {previous or 'active'} → [{colour}]{now}[/]"
        + (f"  [dim]{reason}[/]" if reason else "")
    )


# ---------------------------------------------------------------------------
# policy
# ---------------------------------------------------------------------------


@policy_app.command("list")
def policy_list() -> None:
    """List policies and their enforcement mode."""
    from sqlalchemy import select

    from ..models import Policy, PolicyBinding, PolicyVersion

    with _session() as session:
        table = Table(box=None, pad_edge=False)
        for column in ("policy", "version", "mode", "rules"):
            table.add_column(column, style="bold" if column == "policy" else None)
        for policy in session.scalars(select(Policy).order_by(Policy.key)):
            latest = session.scalars(
                select(PolicyVersion)
                .where(PolicyVersion.policy_id == policy.id)
                .order_by(PolicyVersion.version.desc())
            ).first()
            if latest is None:
                continue
            binding = session.scalars(
                select(PolicyBinding).where(
                    PolicyBinding.policy_version_id == latest.id,
                    PolicyBinding.effective_to.is_(None),
                )
            ).first()
            mode = binding.mode if binding else "unbound"
            table.add_row(
                policy.key,
                f"v{latest.version}",
                f"[green]{mode}[/]" if mode == "enforce" else f"[yellow]{mode}[/]",
                str(len((latest.compiled_json or {}).get("rules", []))),
            )
        console.print(table)


@policy_app.command("lint")
def policy_lint() -> None:
    """Lint the policy hierarchy (P12-4). Exits 1 on critical or high findings.

    This is the half of hierarchical policy that produces the 87% misconfiguration
    reduction — composition without a linter just moves the confusion somewhere
    harder to see.
    """
    from ..policy import lint_all

    with _session() as session:
        report = lint_all(session)

    if not report["findings"]:
        console.print("[green]no policy issues[/]")
        return

    table = Table(box=None, pad_edge=False)
    for column in ("severity", "code", "rule", "level", "message"):
        table.add_column(column, style="bold" if column == "code" else None)
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    for finding in sorted(report["findings"], key=lambda f: order.get(f["severity"], 9)):
        colour = {"critical": "red", "high": "red", "medium": "yellow"}.get(
            finding["severity"], "dim"
        )
        table.add_row(
            f"[{colour}]{finding['severity']}[/]",
            finding["code"],
            finding["rule_id"],
            finding["level"] or "—",
            finding["message"][:74],
        )
    console.print(table)
    console.print(f"  [dim]{report['counts']}[/]")

    if not report["passed"]:
        console.print("\n[bold red]LINT FAIL[/] — critical/high findings block the build")
        raise typer.Exit(1)
    console.print("\n[green]LINT PASS[/] [dim](advisory findings only)[/]")


@policy_app.command("effective")
def policy_effective(
    agent: str | None = None,
    team: str | None = None,
    user: str | None = None,
    environment: str = "production",
) -> None:
    """Show the policy actually in force for a subject, and where each rule came from.

    Opacity is what makes layered policy dangerous, so the resolver explains itself.
    """
    from ..policy import effective_for

    with _session() as session:
        effective = effective_for(
            session, agent_slug=agent, environment=environment, team=team, user=user
        )
        explanation = effective.explain()

    console.print(
        f"[bold]effective policy[/] — mode [bold]{explanation['mode']}[/], "
        f"default {explanation['default_effect']}"
    )
    console.print(f"  [dim]layers: {', '.join(explanation['layers']) or 'none'}[/]\n")

    table = Table(box=None, pad_edge=False)
    for column in ("rule", "effect", "from", "overrides"):
        table.add_column(column, style="bold" if column == "rule" else None)
    for rule in explanation["rules"]:
        table.add_row(
            rule["rule_id"],
            rule["effect"],
            rule["source"],
            ", ".join(rule["overrides"]) or "—",
        )
    console.print(table)

    if explanation["rejected"]:
        console.print("\n[bold yellow]rejected layer rules[/]")
        for rejected in explanation["rejected"]:
            console.print(
                f"  [yellow]{rejected['rule_id']}[/] at {rejected['level']}:"
                f"{rejected['scope']} — {rejected['reason'][:88]}"
            )


@policy_app.command("simulate")
def policy_simulate(
    file: Path = typer.Option(..., "--file", "-f", help="Candidate policy YAML."),
    agent: str | None = None,
    since_days: int = 30,
    limit: int = 1000,
) -> None:
    """Replay recorded traffic against a candidate policy (P2-7).

    Exits non-zero when the change would newly block production traffic, so it can
    gate a policy PR the same way `eval gate` gates a code PR.
    """
    from ..policy import PolicyDocument, record_simulation, simulate

    candidate = PolicyDocument.from_yaml(file.read_text())
    with _session() as session:
        diff = simulate(
            session,
            candidate,
            agent_slug=agent,
            since=dt.datetime.now(dt.UTC) - dt.timedelta(days=since_days),
            limit=limit,
        )
        record_simulation(session, candidate, diff, run_by="cli")

    console.print(f"[bold]{candidate.key}[/] simulated against {diff.replayed} decisions")
    console.print(f"  unchanged        {diff.unchanged}")
    console.print(f"  newly blocked    [red]{len(diff.newly_blocked)}[/]")
    console.print(f"  newly escalated  [yellow]{len(diff.newly_escalated)}[/]")
    console.print(f"  newly allowed    [green]{len(diff.newly_allowed)}[/]")
    for record in diff.newly_blocked[:10]:
        console.print(
            f"    [red]would block[/] {record['agent']} {record['surface']} "
            f"{record['tool'] or ''} — {(record['reasons'] or [''])[0][:80]}"
        )
    if diff.risky:
        console.print(
            "\n[bold red]This change would block production traffic. "
            "Review before promoting to enforce.[/]"
        )
        raise typer.Exit(1)
    console.print("\n[green]No production traffic would newly block.[/]")


@policy_app.command("enforce")
def policy_enforce(key: str) -> None:
    """Promote a policy from observe to enforce."""
    _set_mode(key, "enforce")


@policy_app.command("observe")
def policy_observe(key: str) -> None:
    """Demote a policy from enforce to observe."""
    _set_mode(key, "observe")


def _set_mode(key: str, mode: str) -> None:
    from ..audit import chain
    from ..policy import set_mode

    with _session() as session:
        binding = set_mode(session, key, mode)
        if binding is None:
            console.print(f"[red]unknown policy '{key}'[/]")
            raise typer.Exit(1)
        chain.append(
            session,
            f"policy.mode_{mode}",
            actor_type="user",
            actor_id="cli",
            subject_type="policy",
            subject_id=key,
            payload={"mode": mode},
        )
    console.print(f"[green]{key}[/] → [bold]{mode}[/]")


@policy_app.command("validate")
def policy_validate(file: Path) -> None:
    """Lint and compile a policy without saving it."""
    from ..policy import PolicyDocument, compile_to_rego

    try:
        doc = PolicyDocument.from_yaml(file.read_text())
    except Exception as exc:
        console.print(f"[red]invalid:[/] {exc}")
        raise typer.Exit(1) from exc
    console.print(
        f"[green]valid[/] — {doc.key} v{doc.version}, {len(doc.rules)} rules, mode={doc.mode}"
    )
    console.print(f"  controls: {sorted({c for r in doc.rules for c in r.controls})}")
    console.print(f"  [dim]compiles to {len(compile_to_rego(doc).splitlines())} lines of Rego[/]")


# ---------------------------------------------------------------------------
# eval
# ---------------------------------------------------------------------------


@eval_app.command("run")
def eval_run(
    suite: str,
    provider: str = "echo",
    model: str = "echo-1",
    agent: str | None = None,
    scorers: str | None = typer.Option(None, help="Comma-separated scorer keys."),
) -> None:
    """Run an evaluation suite."""
    from sqlalchemy import select

    from ..evaluation.runner import NativeEvalRunner, fit_envelope
    from ..models import EvalSuite

    keys = [s.strip() for s in scorers.split(",")] if scorers else None
    with _session() as session:
        record = session.scalar(select(EvalSuite).where(EvalSuite.key == suite))
        if record is None:
            console.print(f"[red]unknown suite '{suite}'[/]")
            raise typer.Exit(1)
        target: dict[str, Any] = {"provider": provider, "model": model}
        if agent:
            target["agent"] = agent
        run = NativeEvalRunner().run(
            session,
            record,
            target,
            keys,
            envelope=fit_envelope(session, agent) if agent else None,
        )
        summary = run.summary_json
    _print_eval_summary(suite, summary)


def _print_eval_summary(suite: str, summary: dict[str, Any]) -> None:
    console.print(
        f"[bold]{suite}[/] — {summary.get('cases')} cases, {summary.get('errors')} errors"
    )
    table = Table(box=None, pad_edge=False)
    for column in ("scorer", "mean", "min", "max", "pass rate"):
        table.add_column(
            column,
            justify="right" if column != "scorer" else None,
            style="bold" if column == "scorer" else None,
        )
    for key, stats in (summary.get("scorers") or {}).items():
        rate = stats.get("pass_rate")
        table.add_row(
            key,
            f"{stats['mean']:.3f}",
            f"{stats['min']:.3f}",
            f"{stats['max']:.3f}",
            f"{rate:.0%}" if rate is not None else "—",
        )
    console.print(table)


@eval_app.command("gate")
def eval_gate(
    suite: str,
    provider: str = "echo",
    model: str = "echo-1",
    baseline: str | None = typer.Option(None, help="Baseline run id."),
    min_pass_rate: float | None = None,
    junit: Path | None = typer.Option(None, help="Write JUnit XML here."),
    sarif: Path | None = typer.Option(None, help="Write SARIF here."),
) -> None:
    """Run the suite and fail the build on regression (P4-1). Exits 1 on failure."""
    from sqlalchemy import select

    from ..evaluation import gate, to_junit, to_sarif
    from ..evaluation.runner import NativeEvalRunner
    from ..models import EvalSuite

    with _session() as session:
        record = session.scalar(select(EvalSuite).where(EvalSuite.key == suite))
        if record is None:
            console.print(f"[red]unknown suite '{suite}'[/]")
            raise typer.Exit(1)
        run = NativeEvalRunner().run(session, record, {"provider": provider, "model": model})
        result = gate(session, run, baseline, min_pass_rate=min_pass_rate)
        junit_xml = to_junit(result, suite)
        sarif_json = to_sarif(result)
        summary = run.summary_json

    _print_eval_summary(suite, summary)
    if junit:
        junit.write_text(junit_xml)
        console.print(f"  [dim]JUnit → {junit}[/]")
    if sarif:
        sarif.write_text(sarif_json)
        console.print(f"  [dim]SARIF → {sarif}[/]")

    if result.passed:
        console.print("\n[bold green]GATE PASS[/]")
        return
    console.print("\n[bold red]GATE FAIL[/]")
    for regression in result.regressions:
        console.print(f"  [red]regression[/] {regression.message}")
    for failure in result.absolute_failures:
        console.print(f"  [red]threshold[/]  {failure['message']}")
    raise typer.Exit(result.exit_code)


@eval_app.command("baseline")
def eval_baseline(run_id: str, label: str = "main") -> None:
    """Mark a run as the regression baseline."""
    from ..evaluation import set_baseline
    from ..models import EvalRun

    with _session() as session:
        run = session.get(EvalRun, run_id)
        if run is None:
            console.print(f"[red]unknown run '{run_id}'[/]")
            raise typer.Exit(1)
        baseline = set_baseline(session, run, label)
    console.print(f"[green]baseline[/] {baseline.id} → run {run_id} ({label})")


@eval_app.command("drift")
def eval_drift(agent: str, scorer: str = "groundedness") -> None:
    """Compare recent production scores against the baseline window."""
    from ..evaluation import compute_drift

    with _session() as session:
        report = compute_drift(session, agent, scorer)
    if report is None:
        console.print("[yellow]insufficient online samples[/] — run `nometria eval online` first")
        return
    data = report.to_json()
    console.print(
        f"[bold]{agent}[/] · {scorer}  "
        f"PSI [bold]{data['psi']}[/] ({data['band']})  KS {data['ks']}  "
        f"mean {data['mean_baseline']} → {data['mean_current']}"
    )
    if data["drifted"]:
        console.print("[bold red]DRIFT DETECTED[/]")


@eval_app.command("online")
def eval_online(agent: str, since_days: int = 7, rate: float | None = None) -> None:
    """Sample production traffic and score it with the offline scorers (P4-2)."""
    from ..evaluation import sample_production

    with _session() as session:
        run = sample_production(
            session,
            agent,
            since=dt.datetime.now(dt.UTC) - dt.timedelta(days=since_days),
            rate=rate,
        )
        summary = run.summary_json if run else None
    if summary is None:
        console.print("[yellow]no production traffic matched the window[/]")
        return
    console.print(
        f"sampled [bold]{summary.get('sampled')}[/] of "
        f"{summary.get('population')} traces "
        f"(rate {summary.get('sample_rate')})"
    )
    _print_eval_summary(f"online:{agent}", summary)


# ---------------------------------------------------------------------------
# audit / evidence
# ---------------------------------------------------------------------------


@audit_app.command("verify")
def audit_verify(start: int | None = None, end: int | None = None) -> None:
    """Verify the tamper-evident audit chain (P5-2). Exits 1 if broken."""
    from ..audit import chain

    with _session() as session:
        stats = chain.chain_stats(session)
        result = chain.verify_range(session, start, end)

    console.print(
        f"chain: [bold]{stats['entries']}[/] entries, head seq "
        f"{stats['head_seq']}, {stats['checkpoints']} checkpoints"
    )
    if result.valid:
        console.print(
            f"[bold green]CHAIN INTACT[/] — {result.entries_checked} entries "
            f"verified (seq {result.first_seq}..{result.last_seq})"
        )
        return
    console.print(f"[bold red]CHAIN TAMPERED[/] — {len(result.breaks)} break(s)")
    for issue in result.breaks[:10]:
        console.print(f"  [red]seq {issue.seq}[/] {issue.kind}: {issue.detail}")
    for failure in result.checkpoint_failures[:5]:
        console.print(f"  [red]checkpoint seq {failure['seq']}[/] {failure['reason']}")
    raise typer.Exit(1)


@audit_app.command("checkpoint")
def audit_checkpoint() -> None:
    """Write a signed checkpoint over the current chain head."""
    from ..audit import chain

    with _session() as session:
        record = chain.checkpoint_now(session)
        if record is None:
            console.print("[yellow]chain is empty[/]")
            return
        console.print(f"[green]checkpoint[/] seq {record.seq} digest {record.digest[:16]}…")


@evidence_app.command("export")
def evidence_export(
    agent: list[str] = typer.Option(None, "--agent", help="Repeatable; default all."),
    since_days: int = 30,
    control: list[str] = typer.Option(None, "--control", help="Repeatable; default all."),
    requested_by: str = "cli",
) -> None:
    """Build an auditor-ready evidence package (P5-3)."""
    from ..audit import evidence

    with _session() as session:
        package = evidence.build(
            session,
            agents=list(agent) if agent else ["*"],
            controls=list(control) if control else ["*"],
            period_from=dt.datetime.now(dt.UTC) - dt.timedelta(days=since_days),
            requested_by=requested_by,
        )
        path = package.path
        counts = package.manifest_json["counts"]
        valid = package.chain_verification_json.get("valid")

    console.print(f"[green]evidence package[/] {path}")
    for key, value in counts.items():
        console.print(f"  {key.replace('_', ' '):<24} {value}")
    console.print(
        f"  chain verification       "
        f"[{'green' if valid else 'red'}]{'valid' if valid else 'INVALID'}[/]"
    )
    console.print("\n[dim]Verify independently: unzip, then `python3 verify_chain.py`[/]")


# ---------------------------------------------------------------------------
# compliance
# ---------------------------------------------------------------------------


@compliance_app.command("sync")
def compliance_sync() -> None:
    """Load the control catalog and obligation calendar from YAML."""
    from ..compliance.catalog import sync_catalog, sync_obligations

    with _session() as session:
        catalog = sync_catalog(session)
        obligations = sync_obligations(session)
    console.print(
        f"[green]catalog[/] v{catalog['version']} — "
        f"{catalog['controls_created']} created, "
        f"{catalog['controls_updated']} updated, "
        f"{catalog['mappings']} mappings "
        f"([yellow]{catalog['review_status']}[/])"
    )
    console.print(f"[green]obligations[/] {obligations}")


@compliance_app.command("compute")
def compliance_compute(window_days: int = 30) -> None:
    """Recompute control status from telemetry (P6-4)."""
    from ..compliance import compute_all, posture

    with _session() as session:
        statuses = compute_all(session, window_days)
        overall = posture(session)
    console.print(f"computed [bold]{len(statuses)}[/] controls over {window_days} days")
    counts = overall["counts"]
    console.print(
        f"  [green]{counts['effective']} effective[/] · "
        f"[yellow]{counts['degraded']} degraded[/] · "
        f"[red]{counts['failing']} failing[/] · "
        f"[dim]{counts['not_implemented']} not implemented[/]"
    )


@compliance_app.command("status")
def compliance_status(framework: str | None = None, verbose: bool = False) -> None:
    """Show control posture, optionally for one framework."""
    from sqlalchemy import select

    from ..compliance import framework_coverage, latest_statuses, posture
    from ..models import Control

    with _session() as session:
        overall = posture(session, framework)
        statuses = latest_statuses(session)
        coverage = framework_coverage(session, framework) if framework else None
        controls = {c.key: c for c in session.scalars(select(Control))}

    title = framework or "all frameworks"
    counts = overall["counts"]
    console.print(f"[bold]{title}[/] — {overall['controls']} controls")
    console.print(
        f"  [green]{counts['effective']} effective[/] · "
        f"[yellow]{counts['degraded']} degraded[/] · "
        f"[red]{counts['failing']} failing[/] · "
        f"[dim]{counts['not_implemented']} not implemented[/]"
    )
    if overall["effectiveness"] is not None:
        console.print(f"  effectiveness {overall['effectiveness']:.0%}")

    if verbose:
        table = Table(box=None, pad_edge=False)
        for column in ("control", "status", "rationale"):
            table.add_column(column, style="bold" if column == "control" else None)
        for key in sorted(statuses):
            if framework and key not in {c["key"] for c in (coverage or {}).get("controls", [])}:
                pass
            status = statuses[key]
            colour = {"effective": "green", "degraded": "yellow", "failing": "red"}.get(
                status.status, "dim"
            )
            table.add_row(key, f"[{colour}]{status.status}[/]", status.rationale[:88])
        console.print(table)
        console.print(f"  [dim]{len(controls)} controls in catalog[/]")

    if coverage:
        console.print(
            f"\n  mappings: {coverage['mappings_reviewed']} reviewed, "
            f"[yellow]{coverage['mappings_draft']} draft[/]"
        )
        if coverage["declared_gaps"]:
            console.print("  [bold]declared gaps — not covered by this product:[/]")
            for gap in coverage["declared_gaps"]:
                console.print(f"    [dim]· {gap}[/]")
        console.print(f"\n  [yellow]{coverage['caveat']}[/]")


@compliance_app.command("frameworks")
def compliance_frameworks() -> None:
    """List frameworks, coverage and review status."""
    from ..compliance import all_frameworks

    with _session() as session:
        rows = all_frameworks(session)
    table = Table(box=None, pad_edge=False)
    for column in ("framework", "controls mapped", "mappings", "reviewed", "status"):
        table.add_column(column, style="bold" if column == "framework" else None)
    for row in rows:
        table.add_row(
            row["title"],
            f"{row['controls_mapped']}/{row['controls_total']}",
            str(row["mappings_total"]),
            str(row["mappings_reviewed"]),
            "[green]reviewed[/]" if row["review_status"] == "reviewed" else "[yellow]draft[/]",
        )
    console.print(table)
    console.print(
        "\n[yellow]All mappings are engineering drafts. They are not legal advice and "
        "are excluded from evidence packages until reviewed.[/]"
    )


@compliance_app.command("risk")
def compliance_risk() -> None:
    """Show the agent risk register (P6-3)."""
    from ..compliance import register

    with _session() as session:
        rows = register(session)
    table = Table(box=None, pad_edge=False)
    for column in ("agent", "risk tier", "EU class", "residual", "assessed", "review"):
        table.add_column(column, style="bold" if column == "agent" else None)
    for row in rows:
        table.add_row(
            row["agent"],
            row["risk_tier"],
            row["eu_ai_act_class"] or "—",
            row["residual_risk"] or "—",
            "[green]yes[/]" if row["assessed"] else "[red]no[/]",
            "[red]overdue[/]" if row["review_overdue"] else (row["next_review_at"] or "—")[:10],
        )
    console.print(table)


@compliance_app.command("obligations")
def compliance_obligations() -> None:
    """Regulatory obligation calendar against the agent inventory (P6-5)."""
    from ..compliance import obligation_calendar

    with _session() as session:
        rows = obligation_calendar(session)
    table = Table(box=None, pad_edge=False)
    for column in ("date", "framework", "obligation", "status", "agents", "build by"):
        table.add_column(column, style="bold" if column == "obligation" else None)
    for row in rows:
        colour = {"live": "green"}.get(row["status"], "yellow")
        table.add_row(
            (row["effective_date"] or "")[:10],
            row["framework"],
            row["title"][:44],
            f"[{colour}]{row['status']}[/]",
            str(row["agents_in_scope_count"]),
            (row["target_readiness"] or "—")[:10],
        )
    console.print(table)


@compliance_app.command("board")
def compliance_board() -> None:
    """Executive risk view (P6-6)."""
    from ..compliance import board_view

    with _session() as session:
        view = board_view(session)
    inventory = view["inventory"]
    console.print(Panel.fit("[bold]AI risk posture[/]", border_style="cyan"))
    console.print(
        f"  agents under management  {inventory['agents']} "
        f"([red]{inventory['shadow']} shadow[/], "
        f"[yellow]{inventory['unowned']} unowned[/])"
    )
    console.print(
        f"  high-risk agents         {len(view['high_risk_agents'])} {view['high_risk_agents']}"
    )
    console.print(
        f"  unassessed agents        {len(view['unassessed_agents'])} {view['unassessed_agents']}"
    )
    findings = view["open_findings"]
    console.print(f"  open findings            {findings['total']} {findings['by_severity']}")
    overall = view["overall_posture"]
    console.print(
        f"  control effectiveness    "
        f"{(overall['effectiveness'] or 0):.0%} of "
        f"{overall['controls']} controls"
    )
    console.print(f"  live obligations         {len(view['live_obligations'])}")
    console.print(f"  upcoming (24mo)          {len(view['upcoming_obligations'])}")
    console.print(f"\n[yellow]{view['caveat']}[/]")


# ---------------------------------------------------------------------------
# redteam / scan
# ---------------------------------------------------------------------------


@redteam_app.command("run")
def redteam_run(agent: str, probes: str | None = None) -> None:
    """Run adversarial probes against the deployed configuration (P4-4)."""
    from sqlalchemy import select

    from ..evaluation import run_campaign
    from ..models import RedTeamFinding

    keys = [p.strip() for p in probes.split(",")] if probes else None
    with _session() as session:
        campaign = run_campaign(session, agent, probes=keys)
        stats = campaign.summary_json
        findings = list(
            session.scalars(select(RedTeamFinding).where(RedTeamFinding.campaign_id == campaign.id))
        )
        rows = [
            {
                "probe": f.probe,
                "severity": f.severity,
                "succeeded": f.succeeded,
                "owasp": f.owasp_id,
                "verdict": (f.evidence_json or {}).get("verdict"),
            }
            for f in findings
        ]

    console.print(
        f"[bold]{agent}[/] — {stats['probes_run']} probes, "
        f"[green]{stats['attacks_blocked']} blocked[/], "
        f"[red]{stats['attacks_succeeded']} got through[/], "
        f"posture [bold]{stats['posture_score']:.0%}[/]"
    )
    table = Table(box=None, pad_edge=False)
    for column in ("probe", "severity", "OWASP", "verdict", "result"):
        table.add_column(column, style="bold" if column == "probe" else None)
    for row in rows:
        table.add_row(
            row["probe"],
            row["severity"],
            row["owasp"] or "—",
            row["verdict"] or "—",
            "[red]NOT BLOCKED[/]" if row["succeeded"] else "[green]blocked[/]",
        )
    console.print(table)


@redteam_app.command("probes")
def redteam_probes() -> None:
    """List the built-in probe suite and available wrapped runners."""
    from ..evaluation.redteam import BUILTIN_PROBES, available_runners

    table = Table(box=None, pad_edge=False)
    for column in ("probe", "category", "surface", "severity", "OWASP", "ATLAS"):
        table.add_column(column, style="bold" if column == "probe" else None)
    for probe in BUILTIN_PROBES:
        table.add_row(
            probe.key,
            probe.category,
            probe.surface,
            probe.severity,
            probe.owasp_id or "—",
            probe.atlas_id or "—",
        )
    console.print(table)
    runners = available_runners()
    console.print(
        "\n  wrapped runners: "
        + "  ".join(
            f"[{'green' if ok else 'dim'}]{name}{'' if ok else ' (not installed)'}[/]"
            for name, ok in runners.items()
        )
    )


@scan_app.command("mcp")
def scan_mcp(server: str, file: Path | None = typer.Option(None, help="Tool list JSON.")) -> None:
    """Snapshot an MCP server's tools and check hygiene (P1-5)."""
    from sqlalchemy import select

    from ..models import McpServer
    from ..registry.service import scan_mcp_server
    from ..seed import MCP_TOOLS

    tools = json.loads(file.read_text()) if file else MCP_TOOLS
    with _session() as session:
        record = session.scalar(select(McpServer).where(McpServer.name == server))
        if record is None:
            console.print(f"[red]unknown MCP server '{server}'[/]")
            raise typer.Exit(1)
        result = scan_mcp_server(session, record, tools)

    console.print(f"[bold]{server}[/] — {result['tools']} tools, digest {result['digest'][:16]}…")
    if not result["issues"]:
        console.print("  [green]no hygiene issues[/]")
    for issue in result["issues"]:
        colour = {"critical": "red", "high": "red", "medium": "yellow"}.get(
            issue["severity"], "dim"
        )
        console.print(
            f"  [{colour}]{issue['severity']}[/] {issue['type']}"
            + (f" — {issue.get('tool')}" if issue.get("tool") else "")
        )
        if issue.get("excerpt"):
            console.print(f"      [dim]{issue['excerpt'][:120]}[/]")
    external = result["external_scan"]
    if not external["ran"]:
        console.print(f"  [dim]mcp-scan: {external['reason']}[/]")


@app.command()
def analyse_action(
    statement: str = typer.Argument(..., help="SQL, shell command or URL to analyse"),
    kind: str = typer.Option("sql", help="sql | shell | http"),
    method: str = typer.Option("GET", help="HTTP method, when kind=http"),
    dialect: str = typer.Option("postgres", help="SQL dialect"),
    environment: str = typer.Option("production", help="environment the action binds to"),
) -> None:
    """P9 — what would this artefact actually do?

    Deterministic, offline and immediate: no database, no model, no network. The point
    is that an engineer can check a generated statement before it is ever executed.
    """
    from ..guardrails.actions import analyse_http, analyse_shell, analyse_sql, summarise

    if kind == "shell":
        analysis = analyse_shell(statement)
    elif kind == "http":
        analysis = analyse_http(method, statement)
    else:
        analysis = analyse_sql(statement, dialect=dialect)

    summary = summarise([analysis], environment)
    colour = {"critical": "red", "high": "red", "medium": "yellow"}.get(analysis.severity, "green")
    console.print(
        f"[bold]{analysis.operation}[/] · blast radius [{colour}]{analysis.blast_radius}[/] · "
        f"{'reversible' if analysis.reversible else 'IRREVERSIBLE'} · "
        f"{len(analysis.targets)} target(s): {', '.join(analysis.targets) or '—'}"
    )
    if not summary.get("risks"):
        console.print("  [green]no risks identified[/]")
    for risk in summary.get("risks", []):
        risk_colour = {"critical": "red", "high": "red", "medium": "yellow"}.get(
            risk["severity"], "dim"
        )
        console.print(f"  [{risk_colour}]{risk['severity']}[/] {risk['code']} — {risk['detail']}")
    if summary.get("critical"):
        raise typer.Exit(1)


def main() -> None:  # pragma: no cover - console entry point
    try:
        app()
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":  # pragma: no cover
    main()

"""`nometria quickscan` — the zero-account, zero-setup entry point. The whole point
is that it needs nothing: no database, no init, no GitHub, no network. These tests
deliberately do NOT use the `isolated_db` fixture other CLI tests rely on, because a
quickscan that secretly needed a database would be the exact bug this command exists
to not have.
"""

from __future__ import annotations

import json
from pathlib import Path

from typer.testing import CliRunner

from nometria.cli.main import app

runner = CliRunner()


def flat(output: str) -> str:
    return " ".join(output.split())


def test_quickscan_runs_with_no_database_and_no_network(tmp_path: Path):
    (tmp_path / "app.py").write_text(
        "from openai import OpenAI\nclient = OpenAI()\ndef f():\n    client.chat.completions.create(model='gpt-4o', messages=[])\n"
    )
    result = runner.invoke(app, ["quickscan", str(tmp_path), "--skip-sessions"])
    assert result.exit_code == 0, result.output
    text = flat(result.output)
    assert "Nometria Quickscan" in text
    assert "No account" in text


def test_quickscan_reports_live_detection_proof(tmp_path: Path):
    result = runner.invoke(app, ["quickscan", str(tmp_path), "--skip-sessions"])
    assert result.exit_code == 0
    text = flat(result.output)
    assert "Live proof" in text
    assert "adversarial probes caught" in text


def test_quickscan_json_output_is_structured(tmp_path: Path):
    result = runner.invoke(app, ["quickscan", str(tmp_path), "--skip-sessions", "--json"])
    assert result.exit_code == 0
    payload = json.loads(result.output)
    assert "repo" in payload
    assert "sessions" in payload
    assert payload["sessions"] == []
    assert payload["live_demo"]["total"] > 0
    assert payload["live_demo"]["caught"] >= 1


def test_quickscan_skip_sessions_flag_omits_the_section(tmp_path: Path):
    result = runner.invoke(app, ["quickscan", str(tmp_path), "--skip-sessions"])
    assert "Actually running" not in flat(result.output)


def test_quickscan_includes_sessions_section_by_default(tmp_path: Path):
    result = runner.invoke(app, ["quickscan", str(tmp_path)])
    assert result.exit_code == 0
    assert "Actually running" in flat(result.output)

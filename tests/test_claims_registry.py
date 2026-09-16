"""A published number must not drift from the result it came from.

Two headline figures were corrected by hand in one week before this existed. The registry
check runs in CI; these tests prove it actually catches the two ways drift happens: the
benchmark changes under a document, or someone edits a document without re-running anything.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("claims", REPO / "scripts" / "claims.py")
claims = importlib.util.module_from_spec(_spec)
sys.modules["claims"] = claims  # dataclasses resolve their module through sys.modules
_spec.loader.exec_module(claims)


def test_every_published_claim_matches_its_source_today():
    table, drifts = claims.check()
    assert table, "the registry must bind at least one claim"
    assert not drifts, "\n".join(f"{d.claim} in {d.file}: {d.expected!r}" for d in drifts)


@pytest.fixture
def sandbox(tmp_path):
    """A private copy of the manifest, one source and one document it quotes."""
    manifest = {
        "claims": [
            {
                "id": "demo.contained",
                "source": "results.json",
                "path": ["headline", "contained"],
                "render": "fraction",
                "quoted_in": [{"file": "README.md", "text": "{n}/{d} attacks contained"}],
            },
            {
                "id": "demo.rate",
                "source": "results.json",
                "path": ["rate"],
                "render": "percent",
                "decimals": 1,
                "quoted_in": [{"file": "README.md", "text": "recall of {pct}%"}],
            },
        ]
    }
    import yaml

    (tmp_path / "claims.yaml").write_text(yaml.safe_dump(manifest))
    (tmp_path / "results.json").write_text(json.dumps({"headline": {"contained": "8/8"}, "rate": 0.856}))
    (tmp_path / "README.md").write_text("We saw **8/8 attacks\ncontained** and a recall of 85.6% overall.")
    return tmp_path


def run(root: Path):
    return claims.check(manifest=root / "claims.yaml", repo=root)


def test_matching_ignores_emphasis_and_line_wraps(sandbox):
    _, drifts = run(sandbox)
    assert drifts == []


def test_a_benchmark_that_changes_under_a_document_is_caught(sandbox):
    (sandbox / "results.json").write_text(json.dumps({"headline": {"contained": "7/8"}, "rate": 0.856}))
    _, drifts = run(sandbox)
    assert [d.claim for d in drifts] == ["demo.contained"]
    assert "7/8 attacks contained" in drifts[0].expected


def test_a_document_edited_without_rerunning_anything_is_caught(sandbox):
    (sandbox / "README.md").write_text("We saw 8/8 attacks contained and a recall of 98.0% overall.")
    _, drifts = run(sandbox)
    assert [d.claim for d in drifts] == ["demo.rate"]


def test_an_unreadable_source_value_is_reported_not_skipped(sandbox):
    (sandbox / "results.json").write_text(json.dumps({"headline": {}, "rate": 0.856}))
    _, drifts = run(sandbox)
    assert any("unreadable" in d.reason for d in drifts)


def test_the_real_manifest_parses_and_every_source_exists():
    import yaml

    manifest = yaml.safe_load((REPO / "benchmarks" / "claims.yaml").read_text())
    for claim in manifest["claims"]:
        assert (REPO / claim["source"]).exists(), claim["source"]
        for quote in claim["quoted_in"]:
            assert (REPO / quote["file"]).exists(), quote["file"]

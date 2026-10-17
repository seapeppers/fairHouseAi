"""Grounding and mapping of agent results, against the real demo PDFs (no network).

Run from backend/:  .venv/bin/python -m pytest tests -q
"""

import copy
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import agent_results

REPO = Path(__file__).resolve().parents[2]
HOUSEHOLD = REPO / "data" / "households" / "A_qualifies"
EXAMPLE = json.loads((REPO / "docs" / "agent-result-example.json").read_text())
# Box file ids used in the example -> the same file on disk.
FILES = {
    "2533013572529": "bank_statement_2026-07.pdf",
    "2533013090079": "bank_statement_2026-08.pdf",
    "2533010015983": "bank_statement_2026-09.pdf",
    "2533015086165": "income_declaration.pdf",
    "2533012286097": "paystubs_jul-sep_2026.pdf",
    "2533012609400": "resident_demographic_form.pdf",
}


class FakeBox:
    """Just the Box calls agent_results makes, served from data/households/A_qualifies."""

    def __init__(self):
        self.files = SimpleNamespace(get_file_by_id=lambda fid, fields: SimpleNamespace(sha_1=FILES[fid]))
        self.downloads = SimpleNamespace(
            download_file=lambda fid: SimpleNamespace(read=lambda: (HOUSEHOLD / FILES[fid]).read_bytes()))


@pytest.fixture
def run():
    agent_results._pages.clear()
    user = SimpleNamespace(box=FakeBox())
    files = [SimpleNamespace(id=i, name=n) for i, n in FILES.items()]

    def go(result):
        return agent_results.to_check_result(user, result, "428478249320", "2A", "Maria Lopez",
                                             "Juniper Court Apartments", files, "rules v1")
    return go


def step(out, step_id):
    return next(s for s in out["steps"] if s["id"] == step_id)


def test_example_grounds_every_fact(run):
    out = run(EXAMPLE)
    assert out["status"] == "QUALIFIES"
    assert all(s["result"] == "pass" for s in out["steps"])
    quotes = [e for s in out["steps"] for e in s["evidence"]]
    assert len(quotes) == len(EXAMPLE["facts"])


def test_context_picks_the_right_deposit_row(run):
    deposits = step(run(EXAMPLE), "deposits")["evidence"]
    assert deposits[0]["quote"] == "07/03/2026 EVERGREEN ROASTERS LLC PAYROLL DIRECT DEP $1,581.12"


def test_page_hint_is_searched_first(run):
    result = copy.deepcopy(EXAMPLE)
    result["facts"] = [{"step": "wages", "label": "Rate", "value": "Hourly rate: $24.00",
                        "file_id": "2533012286097", "page": 5}]
    assert step(run(result), "wages")["evidence"][0]["page"] == 5


def test_value_not_in_document_downgrades_to_review(run):
    result = copy.deepcopy(EXAMPLE)
    result["facts"].append({"step": "wages", "label": "Hourly rate", "value": "$31.00", "file_id": "2533012286097"})
    out = run(result)
    wages = step(out, "wages")
    assert wages["result"] == "warn"
    assert "Could not find “$31.00”" in wages["detail"]
    assert out["status"] == "NEEDS_REVIEW"


def test_demographic_form_is_never_cited(run):
    result = copy.deepcopy(EXAMPLE)
    result["facts"].append({"step": "limit", "label": "Household size", "value": "Household size",
                            "file_id": "2533012609400"})
    out = run(result)
    cited = {e["file_name"] for s in out["steps"] for e in s["evidence"]}
    assert "resident_demographic_form.pdf" not in cited
    assert out["excluded_documents"] == [{"file_name": "resident_demographic_form.pdf",
                                          "reason": "Never used for eligibility decisions"}]
    assert all("demographic" not in d["file_name"] for d in out["documents"])


def test_over_limit_fails_the_limit_step(run):
    result = copy.deepcopy(EXAMPLE)
    result.update(status="NOT_QUALIFIED", projected_annual_income=80000.0)
    limit = step(run(result), "limit")
    assert limit["result"] == "fail" and limit["result_label"] == "Over limit"


def test_missing_documents_and_unknown_income(run):
    result = copy.deepcopy(EXAMPLE)
    result.update(status="MISSING_INFO", projected_annual_income=None, facts=[],
                  reasons=["Only 2 of the 3 required consecutive monthly bank statements were provided."])
    out = run(result)
    assert out["status"] == "MISSING_INFO"
    assert step(out, "documents")["result"] == "fail"
    assert step(out, "limit")["result"] == "warn"

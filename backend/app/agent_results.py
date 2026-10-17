"""Turn the webhook agent's result for a household into the CheckResult the review screen shows.

The agent (webhook/ Lambda) writes one file per household to Reviews / Agent results:

    <household folder id>_check_result.json

with its status, income math and reasons, `flags` (the reasons a person must look at)
and `facts`: each value it relied on, written exactly as printed in a document.
See docs/agent-result-example.json.

Box AI does not say where a value sits in a PDF, so this module grounds every fact
itself: it searches the file's text for the value and quotes the line it is on.
A fact that cannot be found is never shown as proof; its step drops to "warn"
so the analyst checks it by hand.
"""

import io
import json
import re

from box_sdk_gen import BoxAPIError
from pypdf import PdfReader

RESULT_SUFFIX = "_check_result.json"
DEMOGRAPHIC = re.compile(r"demographic", re.I)
MISSING = re.compile(r"\bmissing\b|^only \d+ of", re.I)
REVIEW = re.compile(r"recurring|explanation form|over \$500|mismatch|does not match|unclear", re.I)
DEPOSIT_FLAG = re.compile(r"deposit|payroll|recurring", re.I)
STEP_TITLES = {
    "documents": "Required documents",
    "wages": "Income from wages",
    "deposits": "Bank deposits",
    "limit": "Total vs. limit",
    "review": "Other findings",
}

_pages: dict[str, tuple[str, list[list[str]]]] = {}  # file id -> (sha1, lines per page)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


_results: dict[str, tuple[str, dict]] = {}  # result file id -> (modified_at, parsed result)


def _when(item) -> str:
    v = getattr(item, "modified_at", None)
    return v.isoformat() if hasattr(v, "isoformat") else str(v or "")


def index(user, folder_id: str) -> dict[str, tuple[str, str]]:
    """household id -> (result file id, modified_at) for every result in the folder."""
    try:
        items = user.box.folders.get_folder_items(
            folder_id, fields=["id", "type", "name", "modified_at"], limit=1000).entries or []
    except BoxAPIError:
        return {}
    return {i.name[: -len(RESULT_SUFFIX)]: (i.id, _when(i)) for i in items if (i.name or "").endswith(RESULT_SUFFIX)}


def load(user, folder_id: str, household_id: str, known: dict | None = None) -> dict | None:
    """The agent's latest result for this household, or None if there is none (or no access).

    Results are cached by file id and modified time, so a dashboard that refreshes
    every few seconds only downloads a result again when the agent rewrites it.
    """
    entry = (known if known is not None else index(user, folder_id)).get(household_id)
    if not entry:
        return None
    file_id, modified_at = entry
    cached = _results.get(file_id)
    if cached and cached[0] == modified_at:
        return cached[1]
    try:
        result = json.loads(user.box.downloads.download_file(file_id).read())
    except (BoxAPIError, ValueError):
        return None
    result["_reviewed_at"] = modified_at
    _results[file_id] = (modified_at, result)
    return result


def _lines(user, file_id: str) -> list[list[str]]:
    sha1 = user.box.files.get_file_by_id(file_id, fields=["sha1"]).sha_1
    cached = _pages.get(file_id)
    if cached and cached[0] == sha1:
        return cached[1]
    reader = PdfReader(io.BytesIO(user.box.downloads.download_file(file_id).read()))
    pages = [[_norm(l) for l in (p.extract_text() or "").splitlines() if _norm(l)] for p in reader.pages]
    _pages[file_id] = (sha1, pages)
    return pages


def ground(pages: list[list[str]], value: str, context: str = "", page_hint: int | None = None):
    """(page, quote) for the first line containing value, or None.

    With context (e.g. a deposit's date), the quote spans from the context line to the
    value line, so one of several identical amounts is told apart from the others.
    """
    value, context = _norm(value), _norm(context)
    if not value:
        return None
    order = list(range(len(pages)))
    if page_hint and 1 <= page_hint <= len(pages):
        order.remove(page_hint - 1)
        order.insert(0, page_hint - 1)
    for p in order:
        lines = pages[p]
        for i, line in enumerate(lines):
            if value not in line:
                continue
            if not context or context in line:
                return p + 1, line
            for j in range(i - 1, max(i - 4, -1), -1):
                if context in lines[j]:
                    return p + 1, " ".join(lines[j:i + 1])
    # A table row (date, description, amount) is split over several lines. The viewer
    # matches against the page's text joined with single spaces, so search that too.
    for p in order:
        joined = " ".join(pages[p])
        at = joined.find(value)
        if at >= 0 and (not context or context in value or context in joined[max(at - 200, 0):at]):
            return p + 1, value
    return None


def _money(v) -> str:
    return f"${v:,.2f}" if isinstance(v, (int, float)) else "unknown"


def to_check_result(user, result: dict, household_id: str, unit: str, name: str,
                    building: str, files: list, rules_version: str) -> dict:
    by_id = {f.id: f.name for f in files}
    reasons = [r for r in result.get("reasons") or [] if r]
    projected, limit = result.get("projected_annual_income"), result.get("income_limit")

    evidence = {k: [] for k in STEP_TITLES}
    ungrounded = {k: [] for k in STEP_TITLES}
    for fact in result.get("facts") or []:
        step = fact.get("step") if fact.get("step") in STEP_TITLES else "review"
        file_name = by_id.get(str(fact.get("file_id")))
        label = fact.get("label") or "Value"
        if not file_name or DEMOGRAPHIC.search(file_name):
            # Not in this household's folder, or the demographic form: never cited as proof.
            ungrounded[step].append(f"{label} (“{fact.get('value')}”) does not point to a usable document")
            continue
        hit = ground(_lines(user, fact["file_id"]), str(fact.get("value", "")),
                     str(fact.get("context", "")), fact.get("page"))
        if hit:
            evidence[step].append({"file_id": fact["file_id"], "file_name": file_name, "page": hit[0], "quote": hit[1]})
        else:
            ungrounded[step].append(f"Could not find “{fact.get('value')}” ({label}) in {file_name}")

    missing = [r for r in reasons if MISSING.search(r)]
    # The agent lists what needs a person in "flags"; older results only have reasons.
    flags = result.get("flags")
    if flags is None:
        flags = [r for r in reasons if REVIEW.search(r) and r not in missing]
    deposit_flags = [f for f in flags if DEPOSIT_FLAG.search(f)]
    wages = result.get("annual_wage_income_from_stubs")
    non_payroll = result.get("non_payroll_deposits") or []

    steps = [
        {"id": "documents", "result": "fail" if missing else "pass",
         "detail": " ".join(missing) or "All required documents are on file."},
        {"id": "wages", "result": "pass" if wages is not None else "fail", "amount": wages,
         "detail": f"Annual wage income from pay stubs: {_money(wages)}."},
        {"id": "deposits", "result": "warn" if deposit_flags else "pass", "amount": result.get("payroll_deposits_in_bank"),
         "detail": " ".join(deposit_flags) or f"Payroll deposits match; {len(non_payroll)} other deposit(s) are not income."},
    ]
    if projected is None or limit is None:
        steps.append({"id": "limit", "result": "warn", "detail": "Income or limit unknown, so they cannot be compared."})
    else:
        over = projected > limit
        steps.append({"id": "limit", "result": "fail" if over else "pass", "amount": projected,
                      "result_label": "Over limit" if over else None,
                      "detail": f"{_money(projected)} is {'over' if over else 'under'} the {_money(limit)} limit "
                                f"for a {result.get('household_size')}-person household at {result.get('unit_ami_pct')}% AMI."})
    other = [f for f in flags if f not in deposit_flags]
    if other or evidence["review"] or ungrounded["review"]:
        steps.append({"id": "review", "result": "warn", "detail": " ".join(other) or "See the cited documents."})

    status = result.get("status")
    for s in steps:
        s["title"] = STEP_TITLES[s["id"]]
        s["evidence"] = evidence[s["id"]]
        if ungrounded[s["id"]]:
            s["detail"] += " " + "; ".join(ungrounded[s["id"]]) + ". Check by hand."
            if s["result"] == "pass":
                s["result"] = "warn"
        if s.get("result_label") is None:
            s.pop("result_label", None)
        if s.get("amount") is None:
            s.pop("amount", None)
    # An unproven step means a person must look, whatever the agent concluded.
    if status == "QUALIFIES" and any(s["result"] == "warn" for s in steps):
        status = "NEEDS_REVIEW"

    return {
        "household_id": household_id,
        "name": result.get("name") or name,
        "building": building,
        "unit": unit,
        "household_size": result.get("household_size"),
        "unit_ami_pct": result.get("unit_ami_pct"),
        "income_limit": limit,
        "projected_annual_income": projected,
        "status": status,
        "summary": reasons[0] if reasons else "",
        "steps": steps,
        "documents": [{"file_id": f.id, "file_name": f.name, "label": f.name}
                      for f in files if not DEMOGRAPHIC.search(f.name)],
        "excluded_documents": [{"file_name": f.name, "reason": "Never used for eligibility decisions"}
                               for f in files if DEMOGRAPHIC.search(f.name)],
        "rules_version": result.get("rules_version") or rules_version,
        "source": "agent",
        "generated_at": result.get("generated_at"),
    }

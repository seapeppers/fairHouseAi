"""Households, checks, files, decisions and the audit log, backed by Box.

Every Box call runs as the signed-in user (see auth.current_user), so what a
person can see still follows their Box folder permissions.

The check shows the webhook agent's result for the household when it has one
(Reviews / Agent results, see agent_results.py). CHECK_SOURCE picks the source:
"agent" (agent only), "demo" (the precomputed app/demo_results.json, the same
answer key the frontend's mock uses) or "auto" (agent, else demo). Every result
says which one it came from in "source".
Decisions are written to Box: the AI review to Reviews / AI reviews, the
signed record (locked) to Reviews / Final decisions, and the fairhouseReview
metadata on the household folder. Tenant documents are never modified.
"""

import hashlib
import io
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from box_sdk_gen import (
    BoxAPIError,
    CreateFolderMetadataByIdScope,
    CreateFolderParent,
    UpdateFileByIdLock,
    UpdateFileByIdLockAccessField,
    UploadFileAttributes,
    UploadFileAttributesParentField,
)
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from . import agent_results, config
from .auth import User, current_user, require_role

router = APIRouter()

DEMO_RESULTS = json.loads((Path(__file__).parent / "demo_results.json").read_text())
RULES_VERSION = next(iter(DEMO_RESULTS.values()))["rules_version"]
DEMOGRAPHIC = re.compile(r"demographic", re.I)
UNIT_FOLDER = re.compile(r"^Unit\s+(?P<unit>\S+)\s*-\s*(?P<name>.+)$")
DECISION_STATUS = {"approve": "Approved", "request_info": "Waiting on documents", "not_eligible": "Not eligible"}
DECISION_TEXT = {"approve": "Approved: household qualifies", "request_info": "Request more information", "not_eligible": "Not eligible"}

# Kept in memory for the demo; the durable copy of each decision is in Box.
_records: dict[str, dict] = {}  # current decision per household
_audit: list[dict] = []  # every signed record, never removed
_uploads: dict[str, list[str]] = {}
_review_folders: dict[str, str] = {}


def _kind(item) -> str:
    return getattr(item.type, "value", item.type)


def _items(user: User, folder_id: str) -> list:
    return user.box.folders.get_folder_items(folder_id, fields=["id", "type", "name"], limit=1000).entries or []


def _unit_folders(user: User) -> list[tuple[str, str, str]]:
    """(folder id, unit, name) for every household folder in the building."""
    out = []
    for item in _items(user, config.BOX_BUILDING_FOLDER_ID):
        m = UNIT_FOLDER.match(item.name or "")
        if _kind(item) == "folder" and m:
            out.append((item.id, m["unit"], m["name"].strip()))
    return out


def _household(user: User, household_id: str) -> tuple[str, str]:
    for folder_id, unit, name in _unit_folders(user):
        if folder_id == household_id:
            return unit, name
    raise HTTPException(404, "Household not found")


def _building_name(user: User) -> str:
    return user.box.folders.get_folder_by_id(config.BOX_BUILDING_FOLDER_ID, fields=["name"]).name


def _label(file_name: str) -> str:
    n = file_name.lower()
    if "paystub" in n:
        return "Pay stubs"
    if "bank_statement" in n:
        month = re.search(r"\d{4}-(\d{2})", n)
        names = {"07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct"}
        return f"Bank · {names.get(month[1], month[1])}" if month else "Bank statement"
    if "declaration" in n:
        return "Declaration"
    if DEMOGRAPHIC.search(n):
        return "Demographic form"
    return file_name


def _files(user: User, household_id: str) -> list:
    return [i for i in _items(user, household_id) if _kind(i) == "file"]


@router.get("/box/folder")
def box_folder(user: User = Depends(current_user)):
    return {
        "name": _building_name(user),
        "url": f"https://app.box.com/folder/{config.BOX_BUILDING_FOLDER_ID}",
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }


def _agent_result(user: User, household_id: str) -> dict | None:
    if config.CHECK_SOURCE == "demo":
        return None
    return agent_results.load(user, _review_folder(user, "Agent results"), household_id)


def _summary(user: User, household_id: str, unit: str) -> dict | None:
    """Status fields for the dashboard, from the same source the check uses."""
    agent = _agent_result(user, household_id) if user.role == "analyst" else None
    if agent:
        reasons = agent.get("reasons") or []
        return {"status": agent.get("status"), "summary": reasons[0] if reasons else None,
                "projected_annual_income": agent.get("projected_annual_income"),
                "income_limit": agent.get("income_limit"),
                "missing_documents": [r for r in reasons if agent_results.MISSING.search(r)]}
    return None if config.CHECK_SOURCE == "agent" else DEMO_RESULTS.get(unit)


@router.get("/households")
def households(user: User = Depends(current_user)):
    building = _building_name(user)
    out = []
    for folder_id, unit, name in _unit_folders(user):
        demo = _summary(user, folder_id, unit)
        record = _records.get(folder_id)
        files = _files(user, folder_id)
        uploads = _uploads.get(folder_id, [])
        if uploads:
            missing = []
        elif record:
            missing = record["requested_documents"] if record["decision"] == "request_info" else []
        else:
            missing = demo.get("missing_documents", []) if demo else []
        out.append({
            "household_id": folder_id,
            "name": name,
            "building": building,
            "unit": unit,
            "status": demo["status"] if demo else None,
            "summary": demo["summary"] if demo else None,
            "projected_annual_income": demo["projected_annual_income"] if demo else None,
            "income_limit": demo["income_limit"] if demo else None,
            "missing_documents": missing,
            "files": [
                {"file_name": f.name, "label": _label(f.name), "excluded": bool(DEMOGRAPHIC.search(f.name))}
                for f in files if f.name not in uploads
            ],
            "new_documents": uploads,
            "decided": {"decision": record["decision"], "record_id": record["record_id"]} if record else None,
        })
    return out


@router.post("/households/{household_id}/check")
def check(household_id: str, user: User = Depends(require_role("analyst"))):
    unit, name = _household(user, household_id)
    files = _files(user, household_id)
    agent = _agent_result(user, household_id)
    if agent:
        _uploads.pop(household_id, None)
        result = agent_results.to_check_result(user, agent, household_id, unit, name, _building_name(user),
                                               files, RULES_VERSION)
        result["documents"] = [{**d, "label": _label(d["file_name"])} for d in result["documents"]]
        return result
    if config.CHECK_SOURCE == "agent":
        raise HTTPException(404, "The agent has not produced a result for this household yet")
    demo = DEMO_RESULTS.get(unit)
    if not demo:
        raise HTTPException(404, "No check available for this household yet")
    by_name = {f.name: f.id for f in files if not DEMOGRAPHIC.search(f.name)}

    def evidence(e: dict) -> dict:
        return {**e, "file_id": by_name.get(e["file_name"], e["file_id"])}

    _uploads.pop(household_id, None)
    return {
        **{k: v for k, v in demo.items() if k != "missing_documents"},
        "household_id": household_id,
        "name": name,
        "building": _building_name(user),
        "documents": [
            {**d, "file_id": by_name[d["file_name"]]} for d in demo.get("documents", []) if d["file_name"] in by_name
        ],
        "steps": [{**s, "evidence": [evidence(e) for e in s["evidence"]]} for s in demo["steps"]],
        "source": "demo",
    }


@router.get("/files/{file_id}")
def file(file_id: str, user: User = Depends(current_user)):
    info = user.box.files.get_file_by_id(file_id, fields=["name"])
    if DEMOGRAPHIC.search(info.name or ""):
        raise HTTPException(403, "The demographic form is never used for reviews")
    stream = user.box.downloads.download_file(file_id)
    return StreamingResponse(stream, media_type="application/pdf")


class DecisionInput(BaseModel):
    decision: str
    note: str
    requested_documents: list[str] = []


def _review_folder(user: User, name: str) -> str:
    """Find or create Reviews / <name>."""
    if name in _review_folders:
        return _review_folders[name]
    for item in _items(user, config.BOX_REVIEWS_FOLDER_ID):
        if _kind(item) == "folder" and item.name == name:
            _review_folders[name] = item.id
            return item.id
    created = user.box.folders.create_folder(name, CreateFolderParent(id=config.BOX_REVIEWS_FOLDER_ID))
    _review_folders[name] = created.id
    return created.id


def _upload(user: User, folder_id: str, name: str, data: bytes) -> str:
    files = user.box.uploads.upload_file(
        UploadFileAttributes(name=name, parent=UploadFileAttributesParentField(id=folder_id)), io.BytesIO(data)
    )
    return files.entries[0].id


def _pdf(lines: list[str]) -> bytes:
    """A plain one-column text PDF; enough for a readable signed record."""
    def esc(s: str) -> str:
        s = s.replace("’", "'").replace("“", '"').replace("”", '"').replace("—", "-").replace("·", "-")
        s = s.encode("latin-1", "replace").decode("latin-1")
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    wrapped: list[str] = []
    for line in lines:
        while len(line) > 95:
            cut = line.rfind(" ", 0, 95)
            cut = cut if cut > 0 else 95
            wrapped.append(line[:cut])
            line = "    " + line[cut:].lstrip()
        wrapped.append(line)
    pages = [wrapped[i:i + 54] for i in range(0, len(wrapped), 54)] or [[]]

    objects = ["<< /Type /Catalog /Pages 2 0 R >>", None, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for page in pages:
        text = "BT /F1 10 Tf 13 TL 50 760 Td " + " ".join(f"({esc(l)}) '" for l in page) + " ET"
        objects.append(f"<< /Length {len(text.encode('latin-1'))} >>\nstream\n{text}\nendstream")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {len(objects)} 0 R >>")
        kids.append(f"{len(objects)} 0 R")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"

    out = b"%PDF-1.4\n"
    offsets = []
    for n, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += f"{n} 0 obj\n{body}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


def _dollars(v) -> str:
    return f"${v:,}" if v is not None else "unknown"


@router.post("/households/{household_id}/decision")
def decide(household_id: str, body: DecisionInput, user: User = Depends(require_role("analyst"))):
    if body.decision not in DECISION_STATUS:
        raise HTTPException(400, "Unknown decision")
    if household_id in _records:
        raise HTTPException(409, "This household already has a signed decision. Corrections add a new record.")
    unit, name = _household(user, household_id)
    result = check(household_id, user)
    building = result["building"]
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")
    # Unique across server restarts, so Box never sees two files with the same name.
    record_id = f"FH-{now:%Y%m%d-%H%M%S}"
    evidence = [e for s in result["steps"] if s["result"] != "pass" for e in s["evidence"]]

    ai_name = f"{building} - Unit {unit} - AI review {day} {record_id}.json"
    ai_id = _upload(user, _review_folder(user, "AI reviews"), ai_name, json.dumps(result, indent=2).encode())

    lines = [
        "FairHouseAI - Signed income review decision",
        "",
        f"Record: {record_id}",
        f"Household: {name}, Unit {unit}, {building}",
        f"Decision: {DECISION_TEXT[body.decision]}",
        f"Decided by: {user.name} ({user.login})",
        f"Decided at: {now.isoformat()}",
        f"AI suggestion (reference only): {result['status']}",
        f"Projected income: {_dollars(result['projected_annual_income'])} / limit {_dollars(result['income_limit'])}",
        f"Reason: {body.note}",
    ]
    if body.requested_documents:
        lines.append("Requested documents: " + "; ".join(body.requested_documents))
    lines += ["", "Evidence cited:"] + [f"- {e['file_name']} p.{e['page']}: \"{e['quote']}\"" for e in evidence]
    lines += ["", "Excluded: " + "; ".join(d["file_name"] for d in result["excluded_documents"]) + " (never used)",
              f"Rules: {result['rules_version']}", f"AI review: Reviews / AI reviews / {ai_name}"]
    pdf = _pdf(lines)
    final_name = f"{building} - Unit {unit} - signed decision {day} {record_id}.pdf"
    final_id = _upload(user, _review_folder(user, "Final decisions"), final_name, pdf)

    # Only claim a lock that Box confirms; some Box plans don't allow file locks.
    try:
        user.box.files.update_file_by_id(final_id, lock=UpdateFileByIdLock(access=UpdateFileByIdLockAccessField.LOCK))
        locked = user.box.files.get_file_by_id(final_id, fields=["lock"]).lock is not None
    except BoxAPIError:
        locked = False

    labels = {
        "Status": DECISION_STATUS[body.decision],
        "Projected income": _dollars(result["projected_annual_income"]),
        "Income limit": _dollars(result["income_limit"]),
        "Reviewed by": user.name,
        "Reviewed at": now.strftime("%b %-d, %Y"),
    }
    labels_applied = True
    try:
        user.box.folder_metadata.create_folder_metadata_by_id(
            household_id, CreateFolderMetadataByIdScope.ENTERPRISE, "fairhouseReview",
            {"status": labels["Status"], "reviewedBy": user.name, "reviewedAt": now.strftime("%Y-%m-%dT00:00:00Z"),
             **{k: float(result[f]) for k, f in (("projectedIncome", "projected_annual_income"),
                                                 ("incomeLimit", "income_limit")) if result[f] is not None}},
        )
    except BoxAPIError:
        labels_applied = False  # Template missing on this Box plan: the record itself is what counts.

    record = {
        "record_id": record_id,
        "household_id": household_id,
        "household_name": name,
        "unit": unit,
        "decision": body.decision,
        "note": body.note,
        "requested_documents": body.requested_documents,
        "decided_by": user.name,
        "decided_at": now.isoformat(),
        "ai_status": result["status"],
        "evidence": evidence,
        "audit_url": f"https://app.box.com/file/{final_id}",
        "box_path": f"Reviews / Final decisions / {final_name}",
        "ai_review_path": f"Reviews / AI reviews / {ai_name}",
        "locked": locked,
        "record_sha256": hashlib.sha256(pdf).hexdigest(),
        "rules_version": result["rules_version"],
        "box_metadata": labels if labels_applied else None,
    }
    _records[household_id] = record
    _audit.append(record)
    return record


@router.get("/households/{household_id}/record")
def record(household_id: str, user: User = Depends(current_user)):
    return _records.get(household_id)


@router.get("/audit")
def audit(user: User = Depends(require_role("analyst"))):
    return sorted(_audit, key=lambda r: r["decided_at"], reverse=True)


@router.post("/households/{household_id}/upload")
async def upload(household_id: str, file: UploadFile, user: User = Depends(current_user)):
    _household(user, household_id)
    name = file.filename or "document.pdf"
    if name in {f.name for f in _files(user, household_id)}:
        # Never overwrite or collide with a file already in the folder: keep both.
        stem, dot, ext = name.rpartition(".")
        stamp = datetime.now(timezone.utc).strftime("%H-%M-%S")
        name = f"{stem} (uploaded {stamp}).{ext}" if dot else f"{name} (uploaded {stamp})"
    _upload(user, household_id, name, await file.read())
    _uploads.setdefault(household_id, []).append(name)
    # The household needs a fresh check; its signed record stays in the audit log and in Box.
    _records.pop(household_id, None)
    return {"ok": True}

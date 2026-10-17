"""Set up the FairHouse AI demo in Box: folders, files, sharing, metadata template.

Safe to run more than once. Existing folders and files are reused, not duplicated.

Usage:
    export BOX_DEVELOPER_TOKEN=...   # app Configuration page, valid 60 minutes
    python scripts/box_setup.py
    python scripts/box_setup.py --pm-email teammate@example.com   # share Juniper Court

Prints the folder IDs to put in .env and writes them to scripts/box_ids.json.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
API = "https://api.box.com/2.0"
UPLOAD = "https://upload.box.com/api/2.0/files/content"

ROOT_FOLDER = "Seattle Office of Housing"
BUILDING = "Juniper Court Apartments"
HOUSEHOLDS = {
    "A_qualifies": "Unit 2A - Maria Lopez",
    "B_missing_docs": "Unit 3C - Daniel Kim",
    "C_needs_review": "Unit 5F - Tyler Brooks",
}
RULE_FILES = ["rules.md", "income_limits_mfte_p7_2026.json", "sources.md"]

TEMPLATE_KEY = "fairhouseReview"
TEMPLATE_FIELDS = [
    {"type": "string", "key": "status", "displayName": "Status"},
    {"type": "float", "key": "projectedIncome", "displayName": "Projected income"},
    {"type": "float", "key": "incomeLimit", "displayName": "Income limit"},
    {"type": "string", "key": "reviewedBy", "displayName": "Reviewed by"},
    {"type": "date", "key": "reviewedAt", "displayName": "Reviewed at"},
]


class Box:
    def __init__(self, token):
        self.s = requests.Session()
        self.s.headers["Authorization"] = f"Bearer {token}"

    def call(self, method, url, ok=(200, 201), **kw):
        r = self.s.request(method, url, **kw)
        if r.status_code not in ok:
            sys.exit(f"{method} {url} -> {r.status_code}\n{r.text}")
        return r

    def children(self, folder_id):
        items, offset = [], 0
        while True:
            page = self.call("GET", f"{API}/folders/{folder_id}/items",
                             params={"limit": 1000, "offset": offset, "fields": "id,type,name"}).json()
            items += page["entries"]
            offset += len(page["entries"])
            if offset >= page["total_count"] or not page["entries"]:
                return items

    def find(self, folder_id, name, kind):
        return next((i for i in self.children(folder_id) if i["type"] == kind and i["name"] == name), None)

    def folder(self, parent_id, name):
        existing = self.find(parent_id, name, "folder")
        if existing:
            return existing["id"]
        body = {"name": name, "parent": {"id": parent_id}}
        folder_id = self.call("POST", f"{API}/folders", json=body).json()["id"]
        print(f"  created folder {name}")
        return folder_id

    def upload(self, parent_id, path):
        if self.find(parent_id, path.name, "file"):
            return
        attrs = json.dumps({"name": path.name, "parent": {"id": parent_id}})
        with path.open("rb") as f:
            self.call("POST", UPLOAD, data={"attributes": attrs}, files={"file": (path.name, f)})
        print(f"  uploaded {path.name}")


def ensure_template(box):
    r = box.s.get(f"{API}/metadata_templates/enterprise/{TEMPLATE_KEY}/schema")
    if r.status_code == 200:
        print(f"metadata template {TEMPLATE_KEY} already exists")
        return True
    body = {"scope": "enterprise", "templateKey": TEMPLATE_KEY,
            "displayName": "FairHouse Review", "fields": TEMPLATE_FIELDS}
    r = box.s.post(f"{API}/metadata_templates/schema", json=body)
    if r.status_code in (200, 201):
        print(f"created metadata template {TEMPLATE_KEY}")
        return True
    print(f"could not create metadata template ({r.status_code}): {r.text}\n"
          "  -> enable 'Manage enterprise properties' on the app, or create it in the Admin Console")
    return False


def share(box, folder_id, email, role="editor"):
    r = box.s.post(f"{API}/collaborations", params={"notify": "true"}, json={
        "item": {"type": "folder", "id": folder_id},
        "accessible_by": {"type": "user", "login": email},
        "role": role,
    })
    if r.status_code in (200, 201):
        print(f"shared {BUILDING} with {email} as {role}")
    elif r.status_code == 400 and "user_already_collaborator" in r.text:
        print(f"{email} already has access to {BUILDING}")
    else:
        sys.exit(f"sharing with {email} failed ({r.status_code}): {r.text}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pm-email", action="append", default=[],
                        help="Property Manager's Box login; repeat for several people")
    args = parser.parse_args()

    token = os.environ.get("BOX_DEVELOPER_TOKEN")
    if not token:
        sys.exit("set BOX_DEVELOPER_TOKEN")
    box = Box(token)
    me = box.call("GET", f"{API}/users/me").json()
    print(f"signed in as {me['name']} <{me['login']}>")

    ids = {"root": box.folder("0", ROOT_FOLDER)}
    ids["rules"] = box.folder(ids["root"], "Rules")
    ids["reviews"] = box.folder(ids["root"], "Reviews")
    ids["ai_reviews"] = box.folder(ids["reviews"], "AI reviews")
    ids["final_decisions"] = box.folder(ids["reviews"], "Final decisions")
    ids["building"] = box.folder(ids["root"], BUILDING)
    # Scratch folder for the webhook's end-to-end test; kept apart from real households.
    ids["webhook_test"] = box.folder(ids["root"], "_webhook-test")

    for name in RULE_FILES:
        box.upload(ids["rules"], DATA / "rules" / name)

    ids["households"] = {}
    for src, unit_name in HOUSEHOLDS.items():
        folder_id = box.folder(ids["building"], unit_name)
        ids["households"][unit_name] = folder_id
        for pdf in sorted((DATA / "households" / src).glob("*.pdf")):
            box.upload(folder_id, pdf)

    ensure_template(box)
    for email in args.pm_email:
        share(box, ids["building"], email)

    out = Path(__file__).with_name("box_ids.json")
    out.write_text(json.dumps(ids, indent=2) + "\n")
    print(f"\nwrote {out.relative_to(ROOT)}")
    print(f"BOX_ROOT_FOLDER_ID={ids['root']}")
    print(f"BOX_RULES_FOLDER_ID={ids['rules']}")
    print(f"BOX_REVIEWS_FOLDER_ID={ids['reviews']}")
    print(f"BOX_AI_REVIEWS_FOLDER_ID={ids['ai_reviews']}")
    print(f"BOX_FINAL_DECISIONS_FOLDER_ID={ids['final_decisions']}")
    print(f"BOX_WEBHOOK_TEST_FOLDER_ID={ids['webhook_test']}")
    print(f"BOX_BUILDING_FOLDER_ID={ids['building']}")


if __name__ == "__main__":
    main()

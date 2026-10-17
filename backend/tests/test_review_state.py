"""The dashboard's automatic AI review state, from Box modified times."""

import os
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

for name in ("BOX_CLIENT_ID", "BOX_CLIENT_SECRET", "BOX_ROOT_FOLDER_ID", "BOX_BUILDING_FOLDER_ID", "SESSION_SECRET"):
    os.environ.setdefault(name, "test")

from app.households import _review_state  # noqa: E402

NOW = datetime.now(timezone.utc)


def files(*ages_minutes):
    return [SimpleNamespace(modified_at=NOW - timedelta(minutes=m)) for m in ages_minutes]


def at(minutes_ago):
    return (NOW - timedelta(minutes=minutes_ago)).isoformat()


def test_ready_when_review_is_newer_than_every_file():
    assert _review_state(files(60, 30), at(5)) == {"state": "ready", "reviewed_at": at(5)}


def test_reviewing_after_a_recent_upload():
    assert _review_state(files(60, 2), at(30))["state"] == "reviewing"


def test_reviewing_before_the_first_result():
    assert _review_state(files(1), None)["state"] == "reviewing"


def test_stale_when_the_agent_never_caught_up():
    assert _review_state(files(60, 40), at(50))["state"] == "stale"


def test_none_for_old_files_and_no_result():
    assert _review_state(files(600), None) == {"state": "none"}

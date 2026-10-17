"""Settings, read once from the repo-root .env file (see .env.example)."""

import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"{name} is not set; copy .env.example to .env and fill it in")
    return value


BOX_CLIENT_ID = _require("BOX_CLIENT_ID")
BOX_CLIENT_SECRET = _require("BOX_CLIENT_SECRET")
BOX_REDIRECT_URI = os.environ.get("BOX_REDIRECT_URI", "http://localhost:8000/auth/box/callback")

# Analyst = can open the root folder. Property manager = can open the building folder only.
BOX_ROOT_FOLDER_ID = _require("BOX_ROOT_FOLDER_ID")
BOX_RULES_FOLDER_ID = os.environ.get("BOX_RULES_FOLDER_ID", "")
BOX_REVIEWS_FOLDER_ID = os.environ.get("BOX_REVIEWS_FOLDER_ID", "")
BOX_BUILDING_FOLDER_ID = _require("BOX_BUILDING_FOLDER_ID")

# "box": every user signs in with their own Box account.
# "demo": fallback; two buttons pick a role and the server uses one shared Box connection.
AUTH_MODE = os.environ.get("AUTH_MODE", "box")
SERVICE_TOKEN_FILE = str(REPO_ROOT / "backend" / ".box_service_token.json")

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
SESSION_SECRET = _require("SESSION_SECRET")

AWS_REGION = os.environ.get("AWS_REGION", "us-west-2")
BEDROCK_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-5-5")

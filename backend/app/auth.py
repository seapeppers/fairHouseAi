"""Sign in with Box, and the per-user Box client every other endpoint uses.

Each browser session gets its own BoxOAuth, so all file access runs with that
user's Box permissions. A property manager's token cannot open folders that
were not shared with them, whatever the app code does.

Sessions live in memory: restarting the server signs everyone out.

Other routers get the caller's Box client like this:

    @router.get("/households")
    def households(user: User = Depends(current_user)):
        user.box.folders.get_folder_items(...)

    @router.post("/households/{id}/decision")
    def decide(user: User = Depends(require_role("analyst"))): ...
"""

import secrets
from dataclasses import dataclass

from box_sdk_gen import (
    BoxAPIError,
    BoxClient,
    BoxOAuth,
    FileWithInMemoryCacheTokenStorage,
    GetAuthorizeUrlOptions,
    OAuthConfig,
)
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from . import config

router = APIRouter()


@dataclass
class User:
    box: BoxClient
    id: str
    name: str
    login: str
    role: str  # "analyst" | "property_manager"
    building: str | None = None


_sessions: dict[str, User] = {}
_service_auth: BoxOAuth | None = None


def _new_auth(token_file: str | None = None) -> BoxOAuth:
    kwargs = {"token_storage": FileWithInMemoryCacheTokenStorage(token_file)} if token_file else {}
    return BoxOAuth(OAuthConfig(client_id=config.BOX_CLIENT_ID,
                                client_secret=config.BOX_CLIENT_SECRET, **kwargs))


def _service() -> BoxOAuth:
    """The shared connection used in demo mode, saved to disk so it survives restarts."""
    global _service_auth
    if _service_auth is None:
        _service_auth = _new_auth(config.SERVICE_TOKEN_FILE)
    return _service_auth


def _can_open(box: BoxClient, folder_id: str) -> str | None:
    """Folder name if this user can open it, None if Box says no."""
    try:
        return box.folders.get_folder_by_id(folder_id, fields=["name"]).name
    except BoxAPIError as e:
        if e.response_info.status_code in (403, 404):
            return None
        raise


def _load_user(box: BoxClient) -> User:
    me = box.users.get_user_me()
    if _can_open(box, config.BOX_ROOT_FOLDER_ID):
        return User(box=box, id=me.id, name=me.name, login=me.login, role="analyst")
    building = _can_open(box, config.BOX_BUILDING_FOLDER_ID)
    if not building:
        raise HTTPException(403, f"No FairHouse folders are shared with Box user {me.login}")
    return User(box=box, id=me.id, name=me.name, login=me.login, role="property_manager",
                building=building)


def _start_session(request: Request, user: User) -> None:
    sid = secrets.token_urlsafe(32)
    _sessions[sid] = user
    request.session.clear()
    request.session["sid"] = sid


@router.get("/auth/box/login")
def box_login(request: Request, service: bool = False):
    """Send the browser to Box. ?service=1 also saves this login as the demo-mode connection."""
    state = secrets.token_urlsafe(24)
    request.session["oauth_state"] = state
    request.session["oauth_service"] = service
    url = _new_auth().get_authorize_url(
        options=GetAuthorizeUrlOptions(redirect_uri=config.BOX_REDIRECT_URI, state=state))
    return RedirectResponse(url)


@router.get("/auth/box/callback")
def box_callback(request: Request, code: str | None = None, state: str | None = None,
                 error: str | None = None):
    if error:
        raise HTTPException(400, f"Box sign-in failed: {error}")
    expected = request.session.pop("oauth_state", None)
    if not code or not state or not expected or not secrets.compare_digest(state, expected):
        raise HTTPException(400, "Sign-in expired or was started in another browser; try again")

    auth = _service() if request.session.pop("oauth_service", False) else _new_auth()
    auth.get_tokens_authorization_code_grant(code)
    _start_session(request, _load_user(BoxClient(auth=auth)))
    return RedirectResponse(config.FRONTEND_URL)


@router.get("/auth/demo/login")
def demo_login(request: Request, role: str):
    """Fallback sign-in: pick a role, use the shared Box connection."""
    if config.AUTH_MODE != "demo":
        raise HTTPException(404)
    if role not in ("analyst", "property_manager"):
        raise HTTPException(400, "role must be analyst or property_manager")
    if _service().token_storage.get() is None:
        raise HTTPException(409, "No shared Box connection yet: an analyst must open "
                                 "/auth/box/login?service=1 once")
    box = BoxClient(auth=_service())
    user = _load_user(box)
    user.role = role
    user.building = _can_open(box, config.BOX_BUILDING_FOLDER_ID) if role == "property_manager" else None
    _start_session(request, user)
    return RedirectResponse(config.FRONTEND_URL)


@router.post("/auth/logout")
def logout(request: Request):
    _sessions.pop(request.session.get("sid", ""), None)
    request.session.clear()
    return {"ok": True}


def current_user(request: Request) -> User:
    user = _sessions.get(request.session.get("sid", ""))
    if user is None:
        raise HTTPException(401, "Not signed in")
    return user


def require_role(role: str):
    def check(user: User = Depends(current_user)) -> User:
        if user.role != role:
            raise HTTPException(403, f"Only a {role.replace('_', ' ')} can do this")
        return user
    return check


@router.get("/me")
def me(user: User = Depends(current_user)):
    out = {"name": user.name, "login": user.login, "role": user.role, "mode": config.AUTH_MODE}
    if user.building:
        out["building"] = user.building
    return out

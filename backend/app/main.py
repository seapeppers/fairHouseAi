"""FairHouse AI backend.

Run from the backend/ folder:
    uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

from . import auth, config

app = FastAPI(title="FairHouse AI")

# The browser normally reaches us through the Vite proxy (same origin), but the
# Box callback lands on :8000 directly. Cookies ignore ports, so one session works for both.
app.add_middleware(SessionMiddleware, secret_key=config.SESSION_SECRET,
                   session_cookie="fairhouse_session", same_site="lax", https_only=False)
app.add_middleware(CORSMiddleware, allow_origins=[config.FRONTEND_URL],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

app.include_router(auth.router)


@app.get("/health")
def health():
    return {"ok": True, "auth_mode": config.AUTH_MODE}

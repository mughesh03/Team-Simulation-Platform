"""Simple session-based researcher authentication.

Uses a single researcher password stored in .env (or defaults to 'researcher').
Participant routes are exempt from authentication.
"""

import os
import secrets
from functools import wraps

from fastapi import Request, HTTPException, status
from fastapi.responses import RedirectResponse
from itsdangerous import URLSafeTimedSerializer

SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_hex(32))
RESEARCHER_PASSWORD = os.getenv("RESEARCHER_PASSWORD", "researcher")
SESSION_MAX_AGE = 60 * 60 * 24  # 24 hours

_serializer = URLSafeTimedSerializer(SECRET_KEY)

COOKIE_NAME = "researcher_session"


def create_session_token(username: str = "researcher") -> str:
    """Create a signed session token."""
    return _serializer.dumps({"user": username})


def verify_session_token(token: str) -> dict | None:
    """Verify and decode a session token. Returns None if invalid/expired."""
    try:
        return _serializer.loads(token, max_age=SESSION_MAX_AGE)
    except Exception:
        return None


def get_current_user(request: Request) -> dict | None:
    """Extract the current researcher user from the request cookie."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    return verify_session_token(token)


def require_researcher(request: Request) -> dict:
    """Dependency: require a valid researcher session."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
            headers={"Location": "/login"},
        )
    return user


def is_authenticated(request: Request) -> bool:
    """Check if the request has a valid researcher session."""
    return get_current_user(request) is not None

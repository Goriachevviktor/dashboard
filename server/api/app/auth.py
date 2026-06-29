import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Request, Response

from .config import (
    ACCESS_TOKEN_TTL_MINUTES, API_TOKEN, COOKIE_SECURE, JWT_SECRET,
    REFRESH_COOKIE_NAME, REFRESH_TOKEN_TTL_DAYS,
)
from .db import db
from .rate_limiter import limiter

router = APIRouter()


def utcnow() -> datetime:
    return datetime.now(UTC)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def generate_temporary_password(length: int = 12) -> str:
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def ensure_auth_config() -> None:
    if not JWT_SECRET:
        raise HTTPException(status_code=500, detail="Auth is not configured")


def user_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "displayName": row["display_name"],
        "role": row["role"],
        "isActive": row["is_active"],
    }


def invite_json(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "role": row["role"],
        "expiresAt": row["expires_at"].isoformat(),
        "usedAt": row["used_at"].isoformat() if row["used_at"] else None,
        "createdAt": row["created_at"].isoformat(),
    }


def create_access_token(user: dict[str, Any]) -> str:
    ensure_auth_config()
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "exp": utcnow() + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="strict",
        max_age=REFRESH_TOKEN_TTL_DAYS * 86400,
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/")


def create_refresh_session(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(48)
    expires_at = utcnow() + timedelta(days=REFRESH_TOKEN_TTL_DAYS)
    conn.execute(
        "INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at) VALUES (%s, %s, %s)",
        (user_id, hash_token(token), expires_at),
    )
    return token


def issue_auth_response(conn, response: Response, user: dict[str, Any]) -> dict[str, Any]:
    refresh_token = create_refresh_session(conn, user["id"])
    set_refresh_cookie(response, refresh_token)
    return {
        "accessToken": create_access_token(user),
        "tokenType": "Bearer",
        "expiresIn": ACCESS_TOKEN_TTL_MINUTES * 60,
        "user": user_json(user),
    }


def issue_mobile_auth_response(conn, user: dict[str, Any]) -> dict[str, Any]:
    refresh_token = create_refresh_session(conn, user["id"])
    return {
        "accessToken": create_access_token(user),
        "refreshToken": refresh_token,
        "tokenType": "Bearer",
        "expiresIn": ACCESS_TOKEN_TTL_MINUTES * 60,
        "user": user_json(user),
    }


def record_user_activity(conn, user: dict[str, Any]) -> None:
    user_id = user.get("id")
    if not user_id:
        return
    conn.execute(
        "UPDATE users SET last_seen_at = now(), activity_count = activity_count + 1 WHERE id = %s",
        (user_id,),
    )
    conn.execute(
        """
        INSERT INTO user_activity_daily (user_id, activity_date, activity_count, last_seen_at)
        VALUES (%s, CURRENT_DATE, 1, now())
        ON CONFLICT (user_id, activity_date)
        DO UPDATE SET activity_count = user_activity_daily.activity_count + 1, last_seen_at = now()
        """,
        (user_id,),
    )


def require_auth(
    authorization: str | None = Header(default=None),
    x_dashboard_token: str | None = Header(default=None, alias="X-Dashboard-Token"),
) -> dict[str, Any]:
    if API_TOKEN and x_dashboard_token and secrets.compare_digest(x_dashboard_token, API_TOKEN):
        return {"id": 0, "email": "system", "display_name": "System", "role": "admin", "is_active": True}

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.removeprefix("Bearer ").strip()
    if API_TOKEN and secrets.compare_digest(token, API_TOKEN):
        return {"id": 0, "email": "system", "display_name": "System", "role": "admin", "is_active": True}

    ensure_auth_config()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid session")

    with db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE id = %s AND is_active = true",
            (int(payload["sub"]),),
        ).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="User is inactive")
        record_user_activity(conn, user)
        return user


def require_admin(user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin role is required")
    return user


def refresh_user_from_cookie(conn, refresh_token: str | None) -> dict[str, Any]:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh session is missing")
    session = conn.execute(
        """
        SELECT auth_sessions.*, users.email, users.display_name, users.role, users.is_active
        FROM auth_sessions
        JOIN users ON users.id = auth_sessions.user_id
        WHERE refresh_token_hash = %s
          AND revoked_at IS NULL
          AND expires_at > now()
          AND users.is_active = true
        """,
        (hash_token(refresh_token),),
    ).fetchone()
    if not session:
        raise HTTPException(status_code=401, detail="Refresh session is invalid")
    return {
        "id": session["user_id"],
        "email": session["email"],
        "display_name": session["display_name"],
        "role": session["role"],
        "is_active": session["is_active"],
    }


def refresh_user_from_token(conn, refresh_token: str | None) -> dict[str, Any]:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh session is missing")
    user = refresh_user_from_cookie(conn, refresh_token)
    conn.execute(
        "UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = %s",
        (hash_token(refresh_token),),
    )
    return user


@router.post("/auth/login")
@limiter.limit("10/minute")
async def login(request: Request, response: Response) -> dict[str, Any]:
    payload = await request.json()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    with db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE lower(email) = lower(%s) AND is_active = true",
            (email,),
        ).fetchone()
        if not user or not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Неверный email или пароль")
        conn.execute("UPDATE users SET last_login_at = now(), login_count = login_count + 1 WHERE id = %s", (user["id"],))
        return issue_auth_response(conn, response, user)


@router.post("/auth/refresh")
@limiter.limit("20/minute")
def refresh_session(
    request: Request,
    response: Response,
    dashboard_refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> dict[str, Any]:
    with db() as conn:
        user = refresh_user_from_cookie(conn, dashboard_refresh_token)
        if dashboard_refresh_token:
            conn.execute(
                "UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = %s",
                (hash_token(dashboard_refresh_token),),
            )
        return issue_auth_response(conn, response, user)


@router.post("/auth/logout")
def logout(
    response: Response,
    dashboard_refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
) -> dict[str, bool]:
    if dashboard_refresh_token:
        with db() as conn:
            conn.execute(
                "UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = %s",
                (hash_token(dashboard_refresh_token),),
            )
    clear_refresh_cookie(response)
    return {"ok": True}


@router.post("/auth/mobile/login")
async def mobile_login(request: Request) -> dict[str, Any]:
    payload = await request.json()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""
    if not email or not password:
        raise HTTPException(status_code=400, detail="Email and password are required")
    with db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE lower(email) = lower(%s) AND is_active = true",
            (email,),
        ).fetchone()
        if not user or not verify_password(password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Неверный email или пароль")
        conn.execute("UPDATE users SET last_login_at = now(), login_count = login_count + 1 WHERE id = %s", (user["id"],))
        return issue_mobile_auth_response(conn, user)


@router.post("/auth/mobile/refresh")
async def mobile_refresh_session(request: Request) -> dict[str, Any]:
    payload = await request.json()
    refresh_token = payload.get("refreshToken") or ""
    with db() as conn:
        user = refresh_user_from_token(conn, refresh_token)
        return issue_mobile_auth_response(conn, user)


@router.post("/auth/mobile/logout")
async def mobile_logout(request: Request) -> dict[str, bool]:
    payload = await request.json()
    refresh_token = payload.get("refreshToken") or ""
    if refresh_token:
        with db() as conn:
            conn.execute(
                "UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = %s",
                (hash_token(refresh_token),),
            )
    return {"ok": True}


@router.get("/auth/me")
def me(user: dict[str, Any] = Depends(require_auth)) -> dict[str, Any]:
    return user_json(user)


@router.get("/auth/users", dependencies=[Depends(require_admin)])
def list_users() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT
              users.id, users.email, users.display_name, users.role, users.is_active,
              users.created_at, users.last_login_at, users.login_count,
              users.last_seen_at, users.activity_count,
              COALESCE(activity_7d.activity_count, 0) AS activity_7d_count
            FROM users
            LEFT JOIN (
              SELECT user_id, SUM(activity_count)::integer AS activity_count
              FROM user_activity_daily
              WHERE activity_date >= CURRENT_DATE - interval '6 days'
              GROUP BY user_id
            ) activity_7d ON activity_7d.user_id = users.id
            ORDER BY users.created_at DESC, users.id DESC
            """
        ).fetchall()
        return [
            {
                **user_json(row),
                "createdAt": row["created_at"].isoformat(),
                "lastLoginAt": row["last_login_at"].isoformat() if row["last_login_at"] else None,
                "loginCount": row.get("login_count") or 0,
                "lastSeenAt": row["last_seen_at"].isoformat() if row.get("last_seen_at") else None,
                "activityCount": row.get("activity_count") or 0,
                "activity7dCount": row.get("activity_7d_count") or 0,
            }
            for row in rows
        ]


@router.patch("/auth/users/{user_id}")
async def update_user(
    user_id: int,
    request: Request,
    admin: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    payload = await request.json()
    fields = []
    values = []
    if "displayName" in payload:
        display_name = (payload.get("displayName") or "").strip()
        if not display_name:
            raise HTTPException(status_code=400, detail="Display name is required")
        fields.append("display_name = %s")
        values.append(display_name)
    if "role" in payload:
        role = payload.get("role")
        if role not in {"admin", "member", "viewer"}:
            raise HTTPException(status_code=400, detail="Invalid role")
        fields.append("role = %s")
        values.append(role)
    if "isActive" in payload:
        is_active = bool(payload.get("isActive"))
        if user_id == admin["id"] and not is_active:
            raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
        fields.append("is_active = %s")
        values.append(is_active)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    values.append(user_id)
    with db() as conn:
        row = conn.execute(
            f"UPDATE users SET {', '.join(fields)}, updated_at = now() WHERE id = %s RETURNING id, email, display_name, role, is_active, created_at, last_login_at, login_count, last_seen_at, activity_count",
            values,
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            **user_json(row),
            "createdAt": row["created_at"].isoformat(),
            "lastLoginAt": row["last_login_at"].isoformat() if row["last_login_at"] else None,
            "loginCount": row.get("login_count") or 0,
            "lastSeenAt": row["last_seen_at"].isoformat() if row.get("last_seen_at") else None,
            "activityCount": row.get("activity_count") or 0,
            "activity7dCount": 0,
        }


@router.post("/auth/users/{user_id}/reset-password", dependencies=[Depends(require_admin)])
def reset_user_password(user_id: int, admin: dict[str, Any] = Depends(require_admin)) -> dict[str, Any]:
    temporary_password = generate_temporary_password()
    with db() as conn:
        row = conn.execute(
            "UPDATE users SET password_hash = %s, updated_at = now() WHERE id = %s RETURNING id, email, display_name, role, is_active, created_at, last_login_at, login_count, last_seen_at, activity_count",
            (hash_password(temporary_password), user_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute("UPDATE auth_sessions SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL", (user_id,))
        return {
            "temporaryPassword": temporary_password,
            "user": {
                **user_json(row),
                "createdAt": row["created_at"].isoformat(),
                "lastLoginAt": row["last_login_at"].isoformat() if row["last_login_at"] else None,
                "loginCount": row.get("login_count") or 0,
                "lastSeenAt": row["last_seen_at"].isoformat() if row.get("last_seen_at") else None,
                "activityCount": row.get("activity_count") or 0,
                "activity7dCount": 0,
            },
        }


@router.get("/auth/invites", dependencies=[Depends(require_admin)])
def list_invites() -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM invites ORDER BY created_at DESC, id DESC LIMIT 50"
        ).fetchall()
        return [invite_json(row) for row in rows]


@router.post("/auth/invites")
async def create_invite(
    request: Request,
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, Any]:
    payload = await request.json()
    email = (payload.get("email") or "").strip().lower()
    role = payload.get("role") or "member"
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if role not in {"admin", "member", "viewer"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    token = secrets.token_urlsafe(32)
    expires_at = utcnow() + timedelta(days=7)
    with db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE lower(email) = lower(%s)", (email,)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")
        row = conn.execute(
            "INSERT INTO invites (email, token_hash, role, created_by, expires_at) VALUES (%s, %s, %s, %s, %s) RETURNING *",
            (email, hash_token(token), role, user["id"], expires_at),
        ).fetchone()
    return {
        **invite_json(row),
        "token": token,
        "inviteUrl": f"/dashboard.html?invite={token}",
    }


@router.get("/auth/invites/{token}")
def get_invite(token: str) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM invites WHERE token_hash = %s AND used_at IS NULL AND expires_at > now()",
            (hash_token(token),),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Приглашение не найдено или истекло")
        return {"email": row["email"], "role": row["role"], "expiresAt": row["expires_at"].isoformat()}


@router.post("/auth/register")
async def register(request: Request, response: Response) -> dict[str, Any]:
    payload = await request.json()
    token = payload.get("token") or ""
    display_name = (payload.get("displayName") or "").strip()
    password = payload.get("password") or ""
    if not token or not display_name or len(password) < 10:
        raise HTTPException(status_code=400, detail="Укажите имя и пароль не короче 10 символов")
    with db() as conn:
        invite = conn.execute(
            "SELECT * FROM invites WHERE token_hash = %s AND used_at IS NULL AND expires_at > now() FOR UPDATE",
            (hash_token(token),),
        ).fetchone()
        if not invite:
            raise HTTPException(status_code=404, detail="Приглашение не найдено или истекло")
        existing = conn.execute("SELECT id FROM users WHERE lower(email) = lower(%s)", (invite["email"],)).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")
        user = conn.execute(
            "INSERT INTO users (email, password_hash, display_name, role) VALUES (%s, %s, %s, %s) RETURNING *",
            (invite["email"].lower(), hash_password(password), display_name, invite["role"]),
        ).fetchone()
        conn.execute("UPDATE invites SET used_at = now() WHERE id = %s", (invite["id"],))
        return issue_auth_response(conn, response, user)

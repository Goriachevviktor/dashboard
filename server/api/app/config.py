import os

DATABASE_URL = os.getenv("DASHBOARD_DATABASE_URL", "postgresql://dashboard:dashboard@localhost:5432/dashboard")
API_TOKEN = os.getenv("DASHBOARD_API_TOKEN", "")
JWT_SECRET = os.getenv("DASHBOARD_JWT_SECRET", "")
ACCESS_TOKEN_TTL_MINUTES = int(os.getenv("DASHBOARD_ACCESS_TOKEN_TTL_MINUTES", "15"))
REFRESH_TOKEN_TTL_DAYS = int(os.getenv("DASHBOARD_REFRESH_TOKEN_TTL_DAYS", "30"))
COOKIE_SECURE = os.getenv("DASHBOARD_COOKIE_SECURE", "true").lower() == "true"
ADMIN_EMAIL = os.getenv("DASHBOARD_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.getenv("DASHBOARD_ADMIN_PASSWORD", "")
ADMIN_NAME = os.getenv("DASHBOARD_ADMIN_NAME", "Администратор")
REFRESH_COOKIE_NAME = "dashboard_refresh_token"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("DASHBOARD_CORS_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080").split(",")
    if origin.strip()
]
VAPID_PUBLIC_KEY = os.getenv("DASHBOARD_VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY_FILE = os.getenv("DASHBOARD_VAPID_PRIVATE_KEY_FILE", "")
VAPID_CLAIMS_SUB = os.getenv("DASHBOARD_VAPID_CLAIMS_SUB", "")

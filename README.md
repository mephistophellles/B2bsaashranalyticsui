# ПОТЕНКОР — HR Analytics

- **Frontend:** `npm install` → `npm run dev` (прокси `/api` → `http://127.0.0.1:8000`).
- **Backend:** см. `backend/README.md` — `uvicorn app.main:app --port 8000`, перед этим `python -m scripts.seed`.
- **Docker:** `docker compose up --build`.

Учётки: `manager`/`manager123`, `employee`/`employee123`, `admin`/`admin123`.

Продакшен: `SECRET_KEY`, `DATABASE_URL` (лучше Postgres), `CORS_ORIGINS`, HTTPS и бэкапы — см. `backend/README.md` (чеклист и импорт опросов / `GET /api/jobs/{id}`).

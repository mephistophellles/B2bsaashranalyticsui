# Потенциал — backend (FastAPI)

## Локально

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
set PYTHONPATH=.
python -m scripts.seed    # демо-данные и пользователи
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

По умолчанию используется SQLite `potential.db` (см. `app/config.py`). Для PostgreSQL задайте `DATABASE_URL`.

Демо-учётки: `manager` / `manager123`, `admin` / `admin123`, `employee` / `employee123`.

## OpenAPI

Спецификация: `GET http://127.0.0.1:8000/openapi.json`. Экспорт в файл:

```bash
set PYTHONPATH=.
python scripts/export_openapi.py
```

## Docker

Из корня репозитория: `docker compose up --build`.

## ML (опционально)

```bash
pip install -r requirements-ml.txt
```

Обучение LightGBM вызывается после достаточного числа записей в `indices` (см. `app/services/recommendations_engine.py`).

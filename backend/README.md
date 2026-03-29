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

По умолчанию SQLite: файл `backend/potential.db` (абсолютный путь, не зависит от каталога, из которого запущен uvicorn). Для PostgreSQL задайте `DATABASE_URL`. Если в БД ещё нет пользователей, при старте API для SQLite создаются демо-учётки; полный датасет — по-прежнему `python -m scripts.seed`.

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

## Продакшен (минимум)

Скопируйте `.env.example` в `.env` и задайте:

| Переменная | Назначение |
|------------|------------|
| `SECRET_KEY` | Секрет подписи JWT (длинная случайная строка; не оставляйте значение по умолчанию) |
| `DATABASE_URL` | Строка подключения PostgreSQL или SQLite |
| `CORS_ORIGINS` | Список origin фронтенда через запятую |

При старте с дефолтным `SECRET_KEY` в лог пишется предупреждение.

## Отчёты

- `POST /api/reports` с телом `{"kind": "summary"}` — PDF.
- `{"kind": "summary_excel"}` или `"excel"` — Excel (сводка ESSI).

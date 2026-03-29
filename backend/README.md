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

Тесты API: `set PYTHONPATH=. && python -m pytest tests/ -q`

По умолчанию SQLite: файл `backend/potential.db` (абсолютный путь, не зависит от каталога, из которого запущен uvicorn). Для PostgreSQL задайте `DATABASE_URL`. Если в БД ещё нет пользователей, при старте API для SQLite создаются демо-учётки; полный датасет — по-прежнему `python -m scripts.seed`.

**Схема БД:** при старте приложения вызывается `Base.metadata.create_all` — это удобно для локального dev, но **не заменяет миграции**: у уже существующей базы `create_all` не добавит новые таблицы и колонки. В продакшене опирайтесь на **`alembic upgrade head`** (см. `alembic/README.md`); не полагайтесь на то, что одного `create_all` достаточно для обновления боевой схемы.

### Просмотр данных в БД

- **SQLite:** путь к файлу — `backend/potential.db` (или полный путь из `DATABASE_URL` вида `sqlite:///...`). Примеры:
  - [DB Browser for SQLite](https://sqlitebrowser.org/)
  - CLI: `sqlite3 backend/potential.db` → `.tables`, `SELECT * FROM users LIMIT 5;`
- **PostgreSQL:** задайте `DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/dbname` и подключайтесь через `psql`, pgAdmin, DBeaver и т.п.

Метрики процесса API (Prometheus): эндпоинт **`GET /metrics`** (см. `prometheus-fastapi-instrumentator` в коде).

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

## Импорт опросов (CSV / Excel)

- `POST /api/surveys/upload` возвращает **202** и объект задачи (`Job`). Запись строк в БД выполняется **в том же процессе**, что и API, через **FastAPI `BackgroundTasks`** (после ответа клиенту). Пока uvicorn запущен, импорт дорабатывается; при **перезапуске** процесса во время импорта задача может оборваться.
- Статус и ошибку смотрите в **`GET /api/jobs/{id}`** (и в уведомлениях пользователя, если настроены).
- Обязательные колонки: `employee_id`, `survey_date`, `score_block1` … `score_block5`. Значения блоков — **суммы баллов** по каждому из пяти блоков (пять вопросов по шкале 1–5 → максимум **25** на блок, **125** на опрос); индекс ИСУР в продукте: сумма блоков / 125 × 100.
- **Celery** (см. `app/celery_app.py`, `app/celery_tasks.py`) — опционально для вынесения импорта в отдельный worker; в типовой локальной связке **worker не обязателен**, используется `BackgroundTasks`.

## Продакшен (минимум)

Скопируйте `.env.example` в `.env` и задайте:

| Переменная | Назначение |
|------------|------------|
| `SECRET_KEY` | Секрет подписи JWT (длинная случайная строка; не оставляйте значение по умолчанию) |
| `DATABASE_URL` | Строка подключения PostgreSQL или SQLite |
| `CORS_ORIGINS` | Список origin фронтенда через запятую |
| `ALLOW_INSECURE_SECRET` | `true` только в dev: иначе при дефолтном `SECRET_KEY` и Postgres / `POTENTIAL_ENV=production` процесс завершится с ошибкой |

При старте с дефолтным `SECRET_KEY` на SQLite в лог пишется предупреждение. С **PostgreSQL** или **`POTENTIAL_ENV=production`** без смены секрета процесс **не стартует** (если не задан `ALLOW_INSECURE_SECRET=true`).

**Чеклист перед выводом в прод:** задать сильный `SECRET_KEY`; предпочтительно **PostgreSQL** вместо SQLite; ограничить **CORS** только своими доменами; включить **HTTPS** на reverse-proxy; настроить **резервное копирование** БД и файлов; не публиковать API без базовой защиты (WAF / rate limit по возможности).

## Деплой в облако (MVP)

1. **База данных:** управляемый PostgreSQL (Managed Service в облаке провайдера, Neon, RDS и т.п.). В `.env` указать `DATABASE_URL` (драйвер `postgresql+psycopg2://...` или актуальный для вашего стека).
2. **Backend:** контейнер Docker или PaaS (Render, Fly.io, Railway, Yandex Cloud Run и т.д.) с теми же переменными, что в таблице выше; порт приложения проксировать через HTTPS.
3. **Frontend:** `npm run build`, статика на CDN/хостинг; задать `VITE_API_BASE_URL` на публичный URL API (с `https://`).
4. **Схема БД:** применяйте миграции **`alembic upgrade head`** (каталог `backend/alembic/`). При первом развёртывании без истории миграций см. комментарий в `alembic/README.md`.

## Отчёты

- `POST /api/reports` с телом `{"kind": "summary"}` — PDF.
- `{"kind": "summary_excel"}` или `"excel"` — Excel (сводка ESSI).

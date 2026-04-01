# ПОТЕНКОР — backend (FastAPI)

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

**Схема БД:** по умолчанию при старте вызывается `Base.metadata.create_all` (удобно для локального dev). В продакшене задайте **`RUN_CREATE_ALL=false`**, чтобы не вызывать `create_all` при деплое, и применяйте только **`alembic upgrade head`** (см. `alembic/README.md`). `create_all` **не заменяет миграции**: у уже существующей базы он не добавит новые таблицы и колонки.

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

Образ API ([`Dockerfile`](Dockerfile)) включает каталог `alembic/` и `alembic.ini`. Перед `uvicorn` можно автоматически выполнить **`alembic upgrade head`**: задайте **`RUN_MIGRATIONS_ON_START=true`** (имеет смысл вместе с **`RUN_CREATE_ALL=false`** в проде). Для нескольких реплик Kubernetes миграции лучше запускать одноразовым Job, а в подах переменную не включать.

## ML (опционально)

```bash
pip install -r requirements-ml.txt
```

Обучение LightGBM вызывается после достаточного числа записей в `indices` (см. `app/services/recommendations_engine.py`).

## Импорт опросов (CSV / Excel)

- `POST /api/surveys/upload` возвращает **202** и объект задачи (`Job`). Запись строк в БД выполняется **в том же процессе**, что и API, через **FastAPI `BackgroundTasks`** (после ответа клиенту). Пока uvicorn запущен, импорт дорабатывается; при **перезапуске** процесса во время импорта задача может оборваться.
- Статус и ошибку смотрите в **`GET /api/jobs/{id}`** (и в уведомлениях пользователя, если настроены).
- Обязательные колонки: `employee_id`, `survey_date`, `score_block1` … `score_block5`.
- `score_block1..5` — **суммы по 5 вопросам блока**; допустимый диапазон каждого блока: **5..25**.
- Canonical ESSI: **`(score_block1 + ... + score_block5) / 125 × 100`**.
- Block percentage: **`score_blockX / 25 × 100`**.
- И ESSI, и block percentage трактуются как **процент от максимума по методике**, а не как «свободный диапазон 0..100».
- Для обратной совместимости import также принимает aliases: `date -> survey_date`, `block_o -> score_block1`, `block_s -> score_block2`, `block_m -> score_block3`, `block_j -> score_block4`, `block_w -> score_block5`.
- Опционально в форме загрузки: **`campaign_id`** — привязка строк к активной кампании; для каждой строки проверяются статус кампании, попадание `survey_date` в интервал кампании и отсутствие дубликата `(employee_id, campaign_id)` (как при прохождении опроса в UI).
- **Celery** (см. `app/celery_app.py`, `app/celery_tasks.py`) — опционально для вынесения импорта в отдельный worker; в типовой локальной связке **worker не обязателен**, используется `BackgroundTasks`.

## Продакшен (минимум)

Скопируйте `.env.example` в `.env` и задайте:

| Переменная | Назначение |
|------------|------------|
| `SECRET_KEY` | Секрет подписи JWT (длинная случайная строка; не оставляйте значение по умолчанию) |
| `DATABASE_URL` | Строка подключения PostgreSQL или SQLite |
| `CORS_ORIGINS` | Список origin фронтенда через запятую |
| `ALLOW_INSECURE_SECRET` | `true` только в dev: иначе при дефолтном `SECRET_KEY` и Postgres / `POTENTIAL_ENV=production` процесс завершится с ошибкой |
| `RUN_CREATE_ALL` | `false` в проде: не вызывать `create_all` при старте, только миграции Alembic |
| `RUN_MIGRATIONS_ON_START` | `true` в контейнере API: перед стартом выполнить `alembic upgrade head` (см. `docker-entrypoint.sh`) |

При старте с дефолтным `SECRET_KEY` на SQLite в лог пишется предупреждение. С **PostgreSQL** или **`POTENTIAL_ENV=production`** без смены секрета процесс **не стартует** (если не задан `ALLOW_INSECURE_SECRET=true`).

**Чеклист перед выводом в прод:** задать сильный `SECRET_KEY`; предпочтительно **PostgreSQL** вместо SQLite; ограничить **CORS** только своими доменами; включить **HTTPS** на reverse-proxy; настроить **резервное копирование** БД и файлов; не публиковать API без базовой защиты (WAF / rate limit по возможности).

## Деплой в облако (MVP)

1. **База данных:** управляемый PostgreSQL (Managed Service в облаке провайдера, Neon, RDS и т.п.). В `.env` указать `DATABASE_URL` (драйвер `postgresql+psycopg2://...` или актуальный для вашего стека).
2. **Backend:** контейнер Docker или PaaS (Cloud.ru, Render, Fly.io, Yandex Cloud Run и т.д.) с теми же переменными, что в таблице выше; порт приложения проксировать через HTTPS. Сборка из `backend/`: образ уже содержит Alembic; при необходимости включите `RUN_MIGRATIONS_ON_START=true`.
3. **Frontend:** `npm run build` со значением **`VITE_API_BASE_URL=https://<хост-API>/api`**, либо образ из корня репозитория: `docker build -f Dockerfile.spa --build-arg VITE_API_BASE_URL=https://<хост-API>/api -t potential-ui .` Статику можно отдавать из nginx в образе, загрузить `dist/` в объектное хранилище (S3-совместимое, в т.ч. Cloud.ru) с сайтом/ CDN.
4. **Схема БД:** миграции **`alembic upgrade head`** (в образе API или CI/CD). При первом развёртывании без истории миграций см. комментарий в `alembic/README.md`.

## Отчёты

- `POST /api/reports` с телом `{"kind": "summary"}` — PDF.
- `{"kind": "summary_excel"}` или `"excel"` — Excel (сводка ESSI).
- `GET /api/reports/demo-template` — Excel-шаблон импорта опросов (`employee_id`, `survey_date`, `score_block1..score_block5`).
- Управленческие события (для точек на графике динамики):
  - `GET /api/reports/events`
  - `POST /api/reports/events`
  - `PATCH /api/reports/events/{id}`
  - `DELETE /api/reports/events/{id}`

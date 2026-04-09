# ПОТЕНКОР — чеклист продакшен-развёртывания

Краткий порядок действий и ссылки на код. Подробности переменных: [`backend/.env.example`](../backend/.env.example).

## 1. Секреты и окружение

- Задать **`SECRET_KEY`** — длинная случайная строка; при дефолтном ключе и PostgreSQL / `POTENTIAL_ENV=production` API **не стартует** (см. `backend/app/main.py`).
- **`CORS_ORIGINS`** — только HTTPS-origin боевого фронта (через запятую).
- **`POTENTIAL_ENV=production`** — опционально, вместе с Postgres усиливает требование к секрету.
- **`ALLOW_INSECURE_SECRET`** — только для локальной отладки; в проде **не** включать.

## 2. База данных и миграции

- Прод: **PostgreSQL**, `DATABASE_URL=postgresql+psycopg2://...`.
- **`RUN_CREATE_ALL=false`** — схема только через Alembic из каталога `backend`:

  ```bash
  cd backend
  alembic upgrade head
  ```

- Если таблицы когда-то создавались через `create_all` без истории Alembic, один раз: `alembic stamp <revision>` (см. `backend/alembic/README.md`), затем дальше только `upgrade`.
- **Несколько реплик API:** миграции выполнять **одним** Job / одним инстансом до rolling update, либо `RUN_MIGRATIONS_ON_START=true` **только** на одном поде — не на всех репликах одновременно.
- Docker: см. пример override [`docker-compose.override.prod.example.yml`](docker-compose.override.prod.example.yml) и `backend/docker-entrypoint.sh`.

## 3. Пользователи и данные (без демо)

- **`python -m scripts.seed`** в продакшене **не запускать** (полный сброс и демо-данные).
- Для PostgreSQL seed **заблокирован** по умолчанию; для осознанной пустой dev-БД: `ALLOW_DEMO_SEED_ON_POSTGRES=1`.
- Первый администратор после пустой `users`:

  ```bash
  cd backend
  set PYTHONPATH=.
  python -m scripts.create_first_admin --username admin --password "..."
  ```

- Онбординг: отделы, сотрудники, опросы — UI или импорт (`backend/README.md`, `POST /api/surveys/upload`).

## 4. API и TLS

- Запуск **`uvicorn`** за reverse proxy с **HTTPS** (nginx, ingress, облачный балансировщик).
- Проверка живости: **`GET /health`** → `{"status":"ok"}`.
- Метрики Prometheus: **`GET /metrics`** (без схемы OpenAPI).

## 5. Фронтенд (SPA)

- Сборка с базой API:

  ```bash
  npm run build
  # или
  docker build -f Dockerfile.spa --build-arg VITE_API_BASE_URL=https://api.example.com/api -t potential-ui .
  ```

- Если SPA и API на **одном** домене, можно `VITE_API_BASE_URL=/api` и проксировать `/api` на бэкенд (пример закомментирован в [`nginx-spa.conf`](nginx-spa.conf)).

## 6. Redis, Celery, ML (по необходимости)

- Импорт в фоне: поднять **worker** (`docker-compose.yml`, сервис `worker`), задать **`REDIS_URL`** и при необходимости `CELERY_IMPORT_TASKS`.
- ML-рекомендации: персистентный том на **`ML_ARTIFACT_DIR`** (см. `backend/app/config.py`), пайплайн обучения/выкладки артефактов.

## 7. Безопасность и эксплуатация

- Резервное копирование БД (и тома ML при использовании).
- При ПДн: политики хранения, доступ к админке; опционально **`PRIVACY_HIDE_NAMES_FOR_MANAGERS=true`**.
- Логи и алерты по `/health` и `/metrics`.

## Итог «готово к прод»

| Критерий | Состояние |
|----------|-----------|
| Секреты | `SECRET_KEY` задан, не дефолтный |
| БД | Postgres, `RUN_CREATE_ALL=false`, миграции применены |
| Демо | seed не используется; первый admin через `create_first_admin` |
| Сеть | CORS, HTTPS, корректный `VITE_API_BASE_URL` |
| Наблюдаемость | `/health`, `/metrics` подключены к мониторингу |

# ПОТЕНКОР (PotenCore)

HR-аналитика и диагностика команд по методике **ESSI** (Employee Social Sustainability Index): опросы, индексы по блокам, дашборды, управленческие отчёты, рекомендации (правила + ML), оценка экономического эффекта.

## Стек

| Слой | Технологии |
|------|------------|
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS, React Router |
| Backend | FastAPI, SQLAlchemy, Alembic, JWT, Prometheus (`/metrics`) |
| БД | SQLite (dev), PostgreSQL (prod) |
| Опционально | Celery/Redis, LightGBM (`requirements-ml.txt`) |

## Быстрый старт

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # при необходимости отредактируйте
set PYTHONPATH=.         # Linux/macOS: export PYTHONPATH=.
python -m scripts.seed   # демо-данные и пользователи (для Postgres см. backend/README.md)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Проверка: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health), OpenAPI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### 2. Frontend

Из **корня репозитория**:

```bash
npm install
npm run dev
```

По умолчанию Vite проксирует `/api` на `http://127.0.0.1:8000`. Для отдельного хоста API задайте `VITE_API_BASE_URL` при сборке.

### 3. Docker

Из корня:

```bash
docker compose up --build
```

## Демо-учётки

После `scripts.seed` (или демо-аккаунтов на SQLite):

| Роль | Логин | Пароль |
|------|-------|--------|
| Менеджер | `manager` | `manager123` |
| Сотрудник | `employee` | `employee123` |
| Администратор | `admin` | `admin123` |

## Структура репозитория

```
├── src/                 # SPA (React + Vite)
├── backend/             # API FastAPI, Alembic, скрипты, тесты
├── deploy/              # PRODUCTION.md, примеры nginx / compose
├── docs/                # HR playbook, интервью, шаблоны
└── dist/                # Сборка фронтенда (npm run build)
```

## Документация

| Ресурс | Описание |
|--------|----------|
| [backend/README.md](backend/README.md) | Запуск API, импорт опросов, переменные окружения, OpenAPI |
| [deploy/PRODUCTION.md](deploy/PRODUCTION.md) | Чеклист продакшена |
| [docs/](docs/) | Материалы по интервью, гипотезам, HR playbook и др. |

## Продакшен (кратко)

- Задайте сильный **`SECRET_KEY`**, **`DATABASE_URL`** (PostgreSQL), **`CORS_ORIGINS`**.
- Для Postgres не используйте `scripts.seed` без осознанной необходимости (`ALLOW_DEMO_SEED_ON_POSTGRES` — см. `backend/README.md`). Первый админ на пустой таблице пользователей: из `backend` — `set PYTHONPATH=.` и `python -m scripts.create_first_admin --username ... --password ...`.
- Подробности: [deploy/PRODUCTION.md](deploy/PRODUCTION.md) и [backend/README.md](backend/README.md).

## Тесты (backend)

```bash
cd backend
set PYTHONPATH=.
python -m pytest tests/ -q
```

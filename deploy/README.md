# Деплой фронтенда

## Образ с nginx

Из корня репозитория:

```bash
docker build -f Dockerfile.spa --build-arg VITE_API_BASE_URL=https://api.example.com/api -t potential-ui .
```

Переменная **`VITE_API_BASE_URL`** должна заканчиваться на **`/api`**: клиент обращается к путям вида `/auth/login`, префикс FastAPI — `/api`.

## Статика в объектном хранилище (Cloud.ru и аналоги)

1. Локально: `npm ci && npm run build` с `VITE_API_BASE_URL` в `.env` или `VITE_API_BASE_URL=https://.../api npm run build`.
2. Загрузите содержимое каталога **`dist/`** в бакет с включённым веб-хостингом (или за CDN).
3. Настройте **CORS** на API (`CORS_ORIGINS`) на домен сайта со статикой.

Конфиг nginx для SPA (если используете свой контейнер): [`nginx-spa.conf`](nginx-spa.conf).

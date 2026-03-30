"""Простой in-memory rate limit для отдельных эндпоинтов (один процесс)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict

from fastapi import HTTPException

_lock = threading.Lock()
_login_buckets: dict[str, list[float]] = defaultdict(list)


def check_login_rate_limit(client_host: str | None, *, max_per_minute: int = 30) -> None:
    if not client_host:
        return
    now = time.time()
    with _lock:
        bucket = _login_buckets[client_host]
        bucket[:] = [t for t in bucket if now - t < 60.0]
        if len(bucket) >= max_per_minute:
            raise HTTPException(
                status_code=429,
                detail="Слишком много попыток входа. Подождите минуту.",
            )
        bucket.append(now)

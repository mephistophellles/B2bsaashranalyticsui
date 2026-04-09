"""Создать первого пользователя с ролью admin, если таблица users пуста.

Запуск из каталога backend (подхватится .env):
  PYTHONPATH=. python -m scripts.create_first_admin --username admin --password 'сложный-пароль'

Или переменные окружения: BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD
(пароль в .env не коммитьте).

Перед запуском: схема БД (alembic upgrade head или create_all в dev).
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth import hash_password
from app.database import SessionLocal
from app.models import User, UserRole


def main() -> None:
    parser = argparse.ArgumentParser(description="Первый admin при пустой таблице users")
    parser.add_argument(
        "--username",
        default=os.environ.get("BOOTSTRAP_ADMIN_USERNAME", "admin"),
        help="Логин (или BOOTSTRAP_ADMIN_USERNAME)",
    )
    parser.add_argument(
        "--password",
        default=os.environ.get("BOOTSTRAP_ADMIN_PASSWORD") or "",
        help="Пароль (или BOOTSTRAP_ADMIN_PASSWORD)",
    )
    args = parser.parse_args()
    if not args.password:
        print("Укажите --password или переменную BOOTSTRAP_ADMIN_PASSWORD.", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        if db.query(User).first() is not None:
            print("В базе уже есть пользователи — скрипт не меняет данные.", file=sys.stderr)
            sys.exit(1)
        user = User(
            username=args.username.strip(),
            password_hash=hash_password(args.password),
            role=UserRole.admin,
            employee_id=None,
        )
        db.add(user)
        db.commit()
        print(f"Создан администратор: {user.username}")
    except Exception as exc:
        db.rollback()
        print(f"Ошибка: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()

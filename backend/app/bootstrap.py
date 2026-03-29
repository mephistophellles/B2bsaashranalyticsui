"""Одноразовое заполнение демо-учёток при пустой локальной SQLite (удобство dev без ручного seed)."""

from __future__ import annotations

import logging
from datetime import date

from app.auth import hash_password
from app.config import settings
from app.database import SessionLocal
from app.models import Department, Employee, User, UserRole

log = logging.getLogger(__name__)


def ensure_local_demo_accounts() -> None:
    if not settings.database_url.lower().startswith("sqlite"):
        return
    db = SessionLocal()
    try:
        if db.query(User).first() is not None:
            return
        log.warning(
            "В БД нет пользователей — создаю демо-учётки (manager/manager123, admin/admin123, "
            "employee/employee123). Для полного датасета выполните: PYTHONPATH=. python -m scripts.seed"
        )
        dept = Department(name="Демо")
        db.add(dept)
        db.flush()
        emp = Employee(
            name="Демо сотрудник",
            email="demo@local",
            department_id=dept.id,
            position="Специалист",
            hire_date=date.today(),
        )
        db.add(emp)
        db.flush()
        db.add(
            User(
                username="manager",
                password_hash=hash_password("manager123"),
                role=UserRole.manager,
                employee_id=None,
            )
        )
        db.add(
            User(
                username="admin",
                password_hash=hash_password("admin123"),
                role=UserRole.admin,
                employee_id=None,
            )
        )
        db.add(
            User(
                username="employee",
                password_hash=hash_password("employee123"),
                role=UserRole.employee,
                employee_id=emp.id,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        log.exception("Не удалось создать демо-учётки")
    finally:
        db.close()

"""Seed demo data. Run from backend/: PYTHONPATH=. python -m scripts.seed"""

import os
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth import hash_password
from app.config import settings
from app.data.survey_methodology import seed_methodology_questions
from app.database import Base, SessionLocal, engine
from app.models import (
    AuditLog,
    ConsentRecord,
    Department,
    Employee,
    IndexRecord,
    Recommendation,
    Survey,
    SurveyCampaign,
    SurveyQuestion,
    User,
    UserRole,
)
from app.services.essi import block_scores_for_target_essi, recompute_indices
from app.services.recommendations_engine import generate_rule_based


def main():
    db_url = settings.database_url.lower()
    is_postgres = "postgresql" in db_url or "postgres" in db_url
    allow = os.environ.get("ALLOW_DEMO_SEED_ON_POSTGRES", "").strip().lower() in ("1", "true", "yes")
    if is_postgres and not allow:
        print(
            "Отказ: seed стирает таблицы и заливает демо-данные. Для PostgreSQL задайте "
            "ALLOW_DEMO_SEED_ON_POSTGRES=1 (только осознанно, например пустая dev-БД). "
            "В продакшене seed не используйте; первый админ: python -m scripts.create_first_admin",
            file=sys.stderr,
        )
        sys.exit(1)

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        db.query(AuditLog).delete()
        db.query(ConsentRecord).delete()
        db.query(User).delete()
        db.query(Survey).delete()
        db.query(SurveyCampaign).delete()
        db.query(IndexRecord).delete()
        db.query(Recommendation).delete()
        db.query(Employee).delete()
        db.query(Department).delete()
        db.query(SurveyQuestion).delete()
        db.commit()

        names = ["Разработка", "Продажи", "Маркетинг", "HR", "Финансы"]
        depts = []
        for name in names:
            d = Department(name=name)
            db.add(d)
            depts.append(d)
        db.commit()
        for d in depts:
            db.refresh(d)

        employees_spec = [
            ("Сара Иванова", "sara.i@company.com", 0, "Старший разработчик", 92),
            ("Михаил Петров", "mikhail.p@company.com", 1, "Менеджер по продажам", 78),
            ("Анна Смирнова", "anna.s@company.com", 2, "Менеджер по маркетингу", 85),
            ("Дмитрий Козлов", "dmitry.k@company.com", 0, "Младший разработчик", 65),
            ("Елена Волкова", "elena.v@company.com", 3, "HR-специалист", 88),
            ("Артем Новиков", "artem.n@company.com", 4, "Финансовый аналитик", 76),
            ("София Лебедева", "sofia.l@company.com", 0, "Разработчик", 90),
        ]
        emps = []
        for name, email, di, pos, _ in employees_spec:
            e = Employee(
                name=name,
                email=email,
                department_id=depts[di].id,
                position=pos,
                hire_date=date(2022, 1, 15),
            )
            db.add(e)
            emps.append(e)
        db.commit()
        for e in emps:
            db.refresh(e)

        base = date.today() - timedelta(days=180)
        months = [base + timedelta(days=30 * i) for i in range(6)]
        for mi, m in enumerate(months):
            for e, spec in zip(emps, employees_spec):
                *_, target_essi = spec
                trend = mi * 0.9
                month_target = max(22.0, min(96.0, float(target_essi) - 6.0 + trend))
                b = block_scores_for_target_essi(month_target)
                db.add(
                    Survey(
                        employee_id=e.id,
                        survey_date=m,
                        score_block1=b[0],
                        score_block2=b[1],
                        score_block3=b[2],
                        score_block4=b[3],
                        score_block5=b[4],
                        source="import",
                    )
                )
        db.commit()

        recompute_indices(db, date.today())
        generate_rule_based(db)

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
                employee_id=emps[0].id,
            )
        )
        db.commit()

        seed_methodology_questions(db)
        print("Seed OK: manager/manager123, admin/admin123, employee/employee123")
    finally:
        db.close()


if __name__ == "__main__":
    main()

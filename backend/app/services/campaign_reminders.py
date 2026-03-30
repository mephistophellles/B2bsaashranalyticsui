from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import Notification, Survey, SurveyCampaign, User, UserRole
from app.services.campaign_survey import campaign_visible_for_date

_REMINDER_TITLE = "Незавершённая кампания опроса"


def maybe_notify_incomplete_active_campaigns(db: Session, user: User) -> None:
    if user.role != UserRole.employee or not user.employee_id:
        return
    today = date.today()
    incomplete: list[SurveyCampaign] = []
    for c in db.query(SurveyCampaign).filter(SurveyCampaign.status == "active").all():
        if not campaign_visible_for_date(c, today):
            continue
        done = (
            db.query(Survey)
            .filter(Survey.employee_id == user.employee_id, Survey.campaign_id == c.id)
            .first()
        )
        if done is None:
            incomplete.append(c)
    if not incomplete:
        return
    since = datetime.utcnow() - timedelta(hours=24)
    recent = (
        db.query(Notification)
        .filter(
            Notification.user_id == user.id,
            Notification.title == _REMINDER_TITLE,
            Notification.created_at >= since,
        )
        .first()
    )
    if recent:
        return
    names = ", ".join(c.name for c in incomplete[:3])
    more = f" (+{len(incomplete) - 3} ещё)" if len(incomplete) > 3 else ""
    db.add(
        Notification(
            user_id=user.id,
            title=_REMINDER_TITLE,
            body=f"Пройдите опрос: {names}{more}" if names else "Есть активные кампании опроса.",
        )
    )
    db.commit()

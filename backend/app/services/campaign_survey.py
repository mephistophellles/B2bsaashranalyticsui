"""Общая валидация кампании для UI-опроса и импорта CSV/XLSX."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from app.models import Survey, SurveyCampaign

MISSING_OR_CLOSED = "Кампания не найдена или закрыта"
DATE_BEFORE = "Дата опроса раньше даты начала кампании"
DATE_AFTER = "Дата опроса позже даты окончания кампании"
ALREADY_DONE = "Опрос по этой кампании уже пройден"


class CampaignSurveyValidationError(ValueError):
    pass


def campaign_visible_for_date(c: SurveyCampaign, today: date) -> bool:
    """Кампания без границ дат видна всегда; иначе today должна попадать в [starts_at, ends_at]."""
    if c.starts_at is not None and today < c.starts_at:
        return False
    if c.ends_at is not None and today > c.ends_at:
        return False
    return True


def load_active_campaign(db: Session, campaign_id: int) -> SurveyCampaign:
    camp = db.query(SurveyCampaign).filter(SurveyCampaign.id == campaign_id).first()
    if not camp or camp.status != "active":
        raise CampaignSurveyValidationError(MISSING_OR_CLOSED)
    return camp


def assert_survey_date_in_campaign_window(camp: SurveyCampaign, sdate: date) -> None:
    if camp.starts_at is not None and sdate < camp.starts_at:
        raise CampaignSurveyValidationError(DATE_BEFORE)
    if camp.ends_at is not None and sdate > camp.ends_at:
        raise CampaignSurveyValidationError(DATE_AFTER)


def assert_no_survey_for_campaign(db: Session, employee_id: int, campaign_id: int) -> None:
    dup = (
        db.query(Survey)
        .filter(Survey.employee_id == employee_id, Survey.campaign_id == campaign_id)
        .first()
    )
    if dup:
        raise CampaignSurveyValidationError(ALREADY_DONE)


def validate_campaign_survey_row(
    db: Session,
    campaign_id: int | None,
    survey_date: date,
    employee_id: int,
    *,
    enforce_duplicate_check: bool,
) -> None:
    if campaign_id is None:
        return
    camp = load_active_campaign(db, campaign_id)
    assert_survey_date_in_campaign_window(camp, survey_date)
    if enforce_duplicate_check:
        assert_no_survey_for_campaign(db, employee_id, campaign_id)

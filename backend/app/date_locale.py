"""Локализованное отображение дат (без англ. аббревиатур месяцев)."""

from datetime import date


def format_hire_date_ru(hire_date: date | None) -> str | None:
    if hire_date is None:
        return None
    return hire_date.strftime("%d.%m.%Y")

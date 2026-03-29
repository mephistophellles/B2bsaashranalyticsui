"""Маскирование ПДн для руководителя при включённом режиме приватности."""

from app.config import settings
from app.models import User, UserRole
from app.schemas import EmployeeListItem


def privacy_active_for(user: User) -> bool:
    return user.role == UserRole.manager and settings.privacy_hide_names_for_managers


def mask_employee_list_item(row: EmployeeListItem, viewer: User) -> EmployeeListItem:
    if not privacy_active_for(viewer):
        return row
    return row.model_copy(
        update={
            "name": f"Сотрудник #{row.id}",
            "email": None,
            "phone": None,
        }
    )


def mask_display_name(employee_id: int, real_name: str, viewer: User) -> str:
    if privacy_active_for(viewer):
        return f"Сотрудник #{employee_id}"
    return real_name

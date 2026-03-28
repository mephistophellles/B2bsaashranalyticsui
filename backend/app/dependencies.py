from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth import decode_token
from app.database import get_db
from app.models import User, UserRole

security = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = decode_token(creds.credentials)
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(status_code=401, detail="Invalid token")
        uid = int(sub)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token") from None
    user = db.query(User).filter(User.id == uid).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_roles(*roles: UserRole):
    def _inner(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles and user.role != UserRole.admin:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

    return _inner


def audit(db: Session, user: User | None, action: str, entity: str | None = None, meta: dict | None = None) -> None:
    from app.models import AuditLog

    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            entity=entity,
            meta=meta,
        )
    )
    db.commit()

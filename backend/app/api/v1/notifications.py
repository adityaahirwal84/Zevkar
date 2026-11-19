from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_member, get_current_user
from app.core.database import get_db
from app.models.entities import AgencyMember, Notification, NotificationPreference, User
from app.schemas.pydantic_models import NotificationPreferencesUpdate

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationOut(BaseModel):
    id: str
    agency_id: str
    type: str
    title: str
    message: str
    is_read: bool
    incident_id: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[NotificationOut])
async def list_notifications(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Notification)
        .where(Notification.agency_id == member.agency_id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.post("/mark-read")
@router.post("/read-all")
async def mark_all_notifications_read(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        update(Notification)
        .where(Notification.agency_id == member.agency_id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"success": True, "updated": res.rowcount or 0}


@router.post("/{notification_id}/read")
async def mark_single_notification_read(
    notification_id: str,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.agency_id == member.agency_id,
        )
    )
    notif = res.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    await db.commit()
    return {"success": True, "id": notification_id}


@router.get("/preferences")
async def get_notification_preferences(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == user.id)
    )
    rows = res.scalars().all()
    if not rows:
        return [
            {"channel": "IN_APP", "min_severity": "MEDIUM", "is_enabled": True},
            {"channel": "EMAIL", "min_severity": "HIGH", "is_enabled": True},
            {"channel": "WEBHOOK", "min_severity": "CRITICAL", "is_enabled": False},
        ]
    return [
        {
            "channel": row.channel,
            "min_severity": row.min_severity,
            "is_enabled": bool(row.is_enabled),
        }
        for row in rows
    ]


@router.put("/preferences")
async def update_notification_preferences(
    payload: NotificationPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(NotificationPreference).where(NotificationPreference.user_id == user.id)
    )
    existing = {row.channel: row for row in res.scalars().all()}

    for pref in payload.preferences:
        if pref.channel in existing:
            existing[pref.channel].min_severity = pref.min_severity
            existing[pref.channel].is_enabled = pref.is_enabled
        else:
            db.add(
                NotificationPreference(
                    user_id=user.id,
                    channel=pref.channel,
                    min_severity=pref.min_severity,
                    is_enabled=pref.is_enabled,
                )
            )

    await db.commit()
    return {
        "success": True,
        "preferences": [p.model_dump() for p in payload.preferences],
    }

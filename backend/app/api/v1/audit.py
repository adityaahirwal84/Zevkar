from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.entities import AuditLog, AgencyMember
from app.api.deps import require_role
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

class AuditLogOut(BaseModel):
    id: str
    agency_id: str
    user_id: Optional[str]
    action: str
    entity_type: Optional[str]
    entity_id: Optional[str]
    details: Optional[dict]
    created_at: datetime
    class Config:
        from_attributes = True

@router.get("", response_model=List[AuditLogOut])
async def list_audit_logs(
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(AuditLog)
        .where(AuditLog.agency_id == member.agency_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()

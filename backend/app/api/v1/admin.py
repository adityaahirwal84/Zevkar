from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.entities import AgencyMember, Client, Incident, Integration, Workflow

router = APIRouter(prefix="/admin", tags=["Organization Administration"])


@router.get("/overview")
async def organization_admin_overview(
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    agency_id = member.agency_id
    total_members = (
        await db.execute(select(func.count(AgencyMember.id)).where(AgencyMember.agency_id == agency_id))
    ).scalar_one() or 0
    total_clients = (
        await db.execute(select(func.count(Client.id)).where(Client.agency_id == agency_id))
    ).scalar_one() or 0
    total_integrations = (
        await db.execute(select(func.count(Integration.id)).where(Integration.agency_id == agency_id))
    ).scalar_one() or 0
    total_workflows = (
        await db.execute(select(func.count(Workflow.id)).where(Workflow.agency_id == agency_id))
    ).scalar_one() or 0
    total_incidents = (
        await db.execute(select(func.count(Incident.id)).where(Incident.agency_id == agency_id))
    ).scalar_one() or 0

    return {
        "agencyId": agency_id,
        "totalMembers": total_members,
        "totalClients": total_clients,
        "totalIntegrations": total_integrations,
        "totalMonitoredWorkflows": total_workflows,
        "totalCapturedIncidents": total_incidents,
        "systemStatus": "OPERATIONAL",
    }

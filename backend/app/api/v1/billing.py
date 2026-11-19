from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from app.core.database import get_db
from app.models.entities import Agency, AgencyMember, Execution, Workflow, Incident
from app.api.deps import require_role
from pydantic import BaseModel

router = APIRouter(prefix="/billing", tags=["Billing & Subscriptions"])

PLANS = [
    {
        "id": "starter",
        "name": "Starter",
        "tier": "STARTER",
        "priceMonthly": 49,
        "priceAnnual": 39,
        "maxWorkflows": 10,
        "maxExecutionsPerMonth": 15000,
        "aiDiagnosesQuota": 100,
        "features": [
            "Limited automation monitoring (up to 10 workflows)",
            "Basic incident history & SHA-256 deduplication",
            "Basic AI & deterministic error diagnosis",
            "n8n & custom webhook ingestion",
        ],
    },
    {
        "id": "professional",
        "name": "Professional",
        "tier": "GROWTH",
        "priceMonthly": 149,
        "priceAnnual": 119,
        "maxWorkflows": 50,
        "maxExecutionsPerMonth": 150000,
        "aiDiagnosesQuota": 1000,
        "features": [
            "Up to 50 connected workflows",
            "Advanced Gemini AI diagnosis & recovery strategies",
            "Human recovery approvals & cooldown safety gates",
            "Advanced monitoring & stuck execution detection",
        ],
    },
    {
        "id": "business",
        "name": "Business",
        "tier": "ENTERPRISE",
        "priceMonthly": 349,
        "priceAnnual": 279,
        "maxWorkflows": 250,
        "maxExecutionsPerMonth": 1000000,
        "aiDiagnosesQuota": 5000,
        "features": [
            "Multi-user RBAC team access & client isolation",
            "Higher workflow & diagnosis usage limits",
            "Immutable audit logs & JSON archive export",
            "Priority support & custom deployment guidance",
        ],
    },
]

class UpgradeRequest(BaseModel):
    target_tier: str

@router.get("/plans")
async def get_plans():
    return PLANS

@router.get("/usage")
@router.get("/subscription")
async def get_usage(
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db)
):
    org_res = await db.execute(select(Agency).where(Agency.id == member.agency_id))
    org = org_res.scalar_one_or_none()
    current_tier = org.tier if org else "STARTER"

    wf_count = (await db.execute(select(func.count(Workflow.id)).where(Workflow.agency_id == member.agency_id))).scalar_one() or 0
    inc_count = (await db.execute(select(func.count(Incident.id)).where(Incident.agency_id == member.agency_id))).scalar_one() or 0
    exec_count = (
        await db.execute(
            select(func.count(Execution.id))
            .join(Workflow, Execution.workflow_id == Workflow.id)
            .where(Workflow.agency_id == member.agency_id)
        )
    ).scalar_one() or 0

    plan_meta = next((p for p in PLANS if p["tier"] == current_tier), PLANS[0])

    return {
        "tier": current_tier,
        "planName": plan_meta["name"],
        "priceMonthly": plan_meta["priceMonthly"],
        "workflowUsage": wf_count,
        "workflowLimit": plan_meta["maxWorkflows"],
        "aiDiagnosesUsed": inc_count,
        "aiDiagnosesLimit": plan_meta["aiDiagnosesQuota"],
        "monthlyExecutionsTracked": exec_count,
        "monthlyExecutionsLimit": plan_meta["maxExecutionsPerMonth"],
        "paymentIntegrationStatus": "CONFIGURABLE_NO_EXTERNAL_PROCESSOR",
    }

@router.post("/upgrade")
async def upgrade_plan(
    payload: UpgradeRequest,
    member: AgencyMember = Depends(require_role(["OWNER"])),
    db: AsyncSession = Depends(get_db)
):
    target = payload.target_tier.upper()
    if target not in ["STARTER", "GROWTH", "ENTERPRISE"]:
        raise HTTPException(status_code=400, detail="Invalid plan tier specified")

    org_res = await db.execute(select(Agency).where(Agency.id == member.agency_id))
    org = org_res.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org.tier = target
    await db.commit()
    await db.refresh(org)
    return {"success": True, "tier": org.tier, "message": f"Organization upgraded to {org.tier} tier."}


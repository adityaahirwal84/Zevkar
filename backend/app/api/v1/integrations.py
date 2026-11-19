from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_member, require_role
from app.core.database import get_db
from app.core.security import decrypt_secret, encrypt_secret, validate_integration_url
from app.integrations.n8n import N8NClient
from app.models.entities import AgencyMember, Integration
from app.schemas.pydantic_models import IntegrationCreate, IntegrationOut
from app.services.n8n_sync import n8n_sync_service

router = APIRouter(prefix="/integrations", tags=["Integrations"])


class TestConnectionRequest(BaseModel):
    platform: str
    instance_url: Optional[str] = None
    api_key: Optional[str] = None


@router.get("", response_model=List[IntegrationOut])
async def list_integrations(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Integration)
        .where(Integration.agency_id == member.agency_id)
        .order_by(Integration.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=IntegrationOut, status_code=status.HTTP_201_CREATED)
async def create_integration(
    payload: IntegrationCreate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    validated_url: Optional[str] = None
    if payload.instance_url:
        try:
            validated_url = validate_integration_url(payload.instance_url)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    integration = Integration(
        agency_id=member.agency_id,
        client_id=payload.client_id,
        name=payload.name,
        platform=payload.platform,
        instance_url=validated_url,
        encrypted_credentials=encrypt_secret(payload.api_key) if payload.api_key else None,
        webhook_secret_encrypted=encrypt_secret(payload.webhook_secret) if payload.webhook_secret else None,
        status="CONNECTED",
        last_sync_status="IDLE",
    )
    db.add(integration)
    await db.commit()
    await db.refresh(integration)
    return integration


@router.post("/test")
async def test_integration_connection(
    payload: TestConnectionRequest,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
):
    if payload.platform.lower() == "n8n":
        if not payload.instance_url or not payload.api_key:
            return {
                "connected": False,
                "status_code": 400,
                "message": "n8n connection requires instance_url and api_key.",
                "verified": False,
            }
        try:
            client = N8NClient(base_url=payload.instance_url, api_key=payload.api_key)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
        probe = await client.validate_credentials()
        return {
            "connected": probe.get("is_valid", False),
            "status_code": probe.get("status_code", 500),
            "message": probe.get("message", "No message"),
            "verified": True,
        }

    return {
        "connected": True,
        "status_code": 200,
        "message": f"Adapter connection interface verified for {payload.platform}.",
        "verified": False,
    }


@router.post("/{integration_id}/test")
async def test_existing_integration(
    integration_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Integration).where(
            Integration.id == integration_id,
            Integration.agency_id == member.agency_id,
        )
    )
    integ = res.scalar_one_or_none()
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")

    if integ.platform.lower() == "n8n":
        api_key = decrypt_secret(integ.encrypted_credentials) or ""
        if not integ.instance_url or not api_key:
            raise HTTPException(status_code=400, detail="Integration credentials are not configured")
        client = N8NClient(base_url=integ.instance_url, api_key=api_key)
        probe = await client.validate_credentials()
        return {
            "connected": probe.get("is_valid", False),
            "status_code": probe.get("status_code", 500),
            "message": probe.get("message", ""),
        }

    return {"connected": True, "status_code": 200, "message": f"{integ.platform} integration configured."}


@router.post("/{integration_id}/sync")
async def sync_integration_now(
    integration_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Integration).where(
            Integration.id == integration_id,
            Integration.agency_id == member.agency_id,
        )
    )
    integ = res.scalar_one_or_none()
    if not integ:
        raise HTTPException(status_code=404, detail="Integration not found")

    try:
        return await n8n_sync_service.sync_integration(db, integ, inline_diagnosis_fallback=True)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Synchronization failed: {str(exc)}")

from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_member, require_role
from app.core.database import get_db
from app.models.entities import AgencyMember, AuditLog, Client
from app.schemas.pydantic_models import ClientCreate, ClientOut, ClientUpdate

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.get("", response_model=List[ClientOut])
async def list_clients(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Client)
        .where(Client.agency_id == member.agency_id)
        .order_by(Client.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientCreate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "MEMBER", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    client = Client(
        agency_id=member.agency_id,
        name=payload.name.strip(),
        company_name=payload.company_name.strip(),
        industry=payload.industry or "Technology",
        contact_email=str(payload.contact_email).strip().lower(),
        contact_phone=payload.contact_phone,
        notes=payload.notes,
        health_score=100,
    )
    db.add(client)
    await db.flush()

    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="CLIENT_CREATED",
            entity_type="CLIENT",
            entity_id=client.id,
            details={"name": client.name, "company_name": client.company_name},
        )
    )
    await db.commit()
    await db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: str,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.agency_id == member.agency_id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.put("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: str,
    payload: ClientUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN", "MEMBER", "DEVELOPER"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.agency_id == member.agency_id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    if payload.name is not None:
        client.name = payload.name.strip()
    if payload.company_name is not None:
        client.company_name = payload.company_name.strip()
    if payload.industry is not None:
        client.industry = payload.industry
    if payload.contact_email is not None:
        client.contact_email = str(payload.contact_email).strip().lower()
    if payload.contact_phone is not None:
        client.contact_phone = payload.contact_phone
    if payload.notes is not None:
        client.notes = payload.notes

    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="CLIENT_UPDATED",
            entity_type="CLIENT",
            entity_id=client.id,
            details={"name": client.name},
        )
    )
    await db.commit()
    await db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=status.HTTP_200_OK)
async def delete_client(
    client_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Client).where(Client.id == client_id, Client.agency_id == member.agency_id)
    )
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="CLIENT_DELETED",
            entity_type="CLIENT",
            entity_id=client.id,
            details={"name": client.name},
        )
    )
    await db.delete(client)
    await db.commit()
    return {"success": True, "id": client_id}

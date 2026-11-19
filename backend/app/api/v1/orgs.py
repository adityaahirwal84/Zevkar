from datetime import datetime, timedelta, timezone
import hashlib
import re
import secrets
from typing import Any, Dict, Optional
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.api.deps import get_current_tenant_member, get_current_user, get_optional_current_user, require_role
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.security import create_access_token, get_password_hash
from app.models.entities import Agency, AgencyMember, AuditLog, Invitation, RefreshToken, User
from app.schemas.pydantic_models import InviteAcceptRequest, OnboardingProgressUpdate, UserOut

router = APIRouter(prefix="/organizations", tags=["Organizations"])
orgs_compat_router = APIRouter(prefix="/orgs", tags=["Organizations"])

VALID_ROLES = {"OWNER", "ADMIN", "MEMBER", "DEVELOPER", "VIEWER"}


def _slugify(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", name.lower()).strip("-")
    return cleaned or "workspace"


async def _unique_slug(db: AsyncSession, name: str) -> str:
    base = _slugify(name)[:72]
    candidate = f"{base}-org"
    if (await db.execute(select(Agency.id).where(Agency.slug == candidate))).scalar_one_or_none() is None:
        return candidate
    for _ in range(10):
        candidate = f"{base}-{secrets.token_hex(3)}"
        if (await db.execute(select(Agency.id).where(Agency.slug == candidate))).scalar_one_or_none() is None:
            return candidate
    return f"org-{secrets.token_hex(6)}"


class OrgCreate(BaseModel):
    name: str
    contact_email: EmailStr


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    timezone: Optional[str] = None


class MemberInvite(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    role: str = "MEMBER"


class MemberRoleUpdate(BaseModel):
    role: str


async def _get_agency_or_404(db: AsyncSession, agency_id: str) -> Agency:
    result = await db.execute(select(Agency).where(Agency.id == agency_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def _list_members_for_agency(db: AsyncSession, agency_id: str):
    result = await db.execute(
        select(AgencyMember, User)
        .join(User, AgencyMember.user_id == User.id)
        .where(AgencyMember.agency_id == agency_id)
    )
    rows = result.all()
    return [
        {
            "id": mem.id,
            "user_id": usr.id,
            "name": usr.name,
            "email": usr.email,
            "role": mem.role,
            "status": mem.status,
            "joined_at": mem.joined_at,
        }
        for mem, usr in rows
    ]


async def _invite_member_for_agency(
    db: AsyncSession,
    agency_id: str,
    inviter: AgencyMember,
    payload: MemberInvite,
):
    role = payload.role.strip().upper()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Unsupported role '{payload.role}'")
    if role == "OWNER" and inviter.role != "OWNER":
        raise HTTPException(status_code=403, detail="Only workspace OWNERs can invite another OWNER.")

    normalized_email = str(payload.email).strip().lower()
    now_dt = datetime.now(timezone.utc)

    user_res = await db.execute(select(User).where(User.email == normalized_email))
    target_user = user_res.scalar_one_or_none()

    if target_user:
        mem_res = await db.execute(
            select(AgencyMember).where(
                AgencyMember.agency_id == agency_id,
                AgencyMember.user_id == target_user.id,
            )
        )
        existing_member = mem_res.scalar_one_or_none()
        if existing_member and existing_member.status == "ACTIVE":
            raise HTTPException(status_code=400, detail="User is already an active member of this organization")

    pending_res = await db.execute(
        select(Invitation).where(
            Invitation.agency_id == agency_id,
            Invitation.email == normalized_email,
            Invitation.status == "PENDING",
        )
    )
    existing_pending = pending_res.scalar_one_or_none()
    if existing_pending:
        if existing_pending.expires_at >= now_dt:
            raise HTTPException(status_code=409, detail="A pending invitation already exists for this email address")
        existing_pending.status = "EXPIRED"

    inv_token = f"inv_{secrets.token_urlsafe(24)}"
    invitation = Invitation(
        agency_id=agency_id,
        email=normalized_email,
        role=role,
        token=inv_token,
        invited_by=inviter.user_id,
        status="PENDING",
        expires_at=now_dt + timedelta(days=7),
    )
    db.add(invitation)
    await db.flush()

    db.add(
        AuditLog(
            agency_id=agency_id,
            user_id=inviter.user_id,
            action="MEMBER_INVITED",
            entity_type="INVITATION",
            entity_id=invitation.id,
            details={"email": normalized_email, "role": role},
        )
    )
    await db.commit()
    await db.refresh(invitation)

    return {
        "success": True,
        "status": "INVITED",
        "invitation_id": invitation.id,
        "token": invitation.token,
        "email": normalized_email,
        "role": role,
        "expires_at": invitation.expires_at,
    }


async def _update_org_for_agency(db: AsyncSession, agency_id: str, actor_user_id: str, payload: OrgUpdate) -> Agency:
    org = await _get_agency_or_404(db, agency_id)
    if payload.name and payload.name.strip():
        org.name = payload.name.strip()
    if payload.contact_email:
        org.contact_email = str(payload.contact_email).strip().lower()
    if payload.timezone:
        try:
            ZoneInfo(payload.timezone)
        except ZoneInfoNotFoundError:
            raise HTTPException(status_code=400, detail=f"Invalid IANA timezone: {payload.timezone}")
        org.timezone = payload.timezone

    db.add(
        AuditLog(
            agency_id=agency_id,
            user_id=actor_user_id,
            action="AGENCY_UPDATED",
            entity_type="AGENCY",
            entity_id=agency_id,
            details={"name": org.name, "timezone": org.timezone},
        )
    )
    await db.commit()
    await db.refresh(org)
    return org


# =============================================================================
# Primary /organizations routes
# =============================================================================

@router.get("")
async def list_user_organizations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Agency)
        .join(AgencyMember, Agency.id == AgencyMember.agency_id)
        .where(AgencyMember.user_id == user.id, AgencyMember.status == "ACTIVE")
    )
    return result.scalars().all()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_organization(
    payload: OrgCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    slug = await _unique_slug(db, payload.name)
    org = Agency(
        name=payload.name.strip(),
        slug=slug,
        tier="STARTER",
        contact_email=str(payload.contact_email).strip().lower(),
        onboarding_step=1,
        onboarding_completed=False,
        onboarding_data={
            "organizationName": payload.name.strip(),
            "contactEmail": str(payload.contact_email).strip().lower(),
            "timezone": "UTC",
            "platform": "n8n",
        },
    )
    db.add(org)
    await db.flush()

    member = AgencyMember(
        agency_id=org.id,
        user_id=user.id,
        role="OWNER",
        status="ACTIVE",
    )
    db.add(member)
    await db.commit()
    await db.refresh(org)
    return org


@router.get("/onboarding")
async def get_onboarding_state(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_agency_or_404(db, member.agency_id)
    return {
        "agency_id": org.id,
        "current_step": org.onboarding_step or 1,
        "completed": bool(org.onboarding_completed),
        "completed_at": org.onboarding_completed_at,
        "data": org.onboarding_data or {},
    }


@router.put("/onboarding")
async def update_onboarding_state(
    payload: OnboardingProgressUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_agency_or_404(db, member.agency_id)
    merged_data: Dict[str, Any] = dict(org.onboarding_data or {})
    if payload.data:
        merged_data.update(payload.data)
    org.onboarding_step = payload.current_step
    org.onboarding_data = merged_data
    if payload.completed is not None:
        org.onboarding_completed = payload.completed
        if payload.completed and org.onboarding_completed_at is None:
            org.onboarding_completed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(org)
    return {
        "agency_id": org.id,
        "current_step": org.onboarding_step,
        "completed": bool(org.onboarding_completed),
        "completed_at": org.onboarding_completed_at,
        "data": org.onboarding_data or {},
    }


@router.post("/onboarding/complete")
async def complete_onboarding(
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    org = await _get_agency_or_404(db, member.agency_id)
    org.onboarding_step = 8
    org.onboarding_completed = True
    org.onboarding_completed_at = org.onboarding_completed_at or datetime.now(timezone.utc)
    db.add(
        AuditLog(
            agency_id=org.id,
            user_id=member.user_id,
            action="ONBOARDING_COMPLETED",
            entity_type="AGENCY",
            entity_id=org.id,
            details={"completed_step": 8},
        )
    )
    await db.commit()
    await db.refresh(org)
    return {
        "success": True,
        "agency_id": org.id,
        "current_step": 8,
        "completed": True,
        "completed_at": org.onboarding_completed_at,
        "data": org.onboarding_data or {},
    }


@router.put("/{org_id}")
async def update_organization(
    org_id: str,
    payload: OrgUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    if member.agency_id != org_id:
        raise HTTPException(status_code=403, detail="Cross-tenant access forbidden.")
    return await _update_org_for_agency(db, org_id, member.user_id, payload)


@router.get("/{org_id}/members")
async def list_organization_members(
    org_id: str,
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    if member.agency_id != org_id:
        raise HTTPException(status_code=403, detail="Cross-tenant access forbidden.")
    return await _list_members_for_agency(db, org_id)


@router.post("/{org_id}/members/invite", status_code=status.HTTP_201_CREATED)
async def invite_member(
    org_id: str,
    payload: MemberInvite,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    if member.agency_id != org_id:
        raise HTTPException(status_code=403, detail="Cross-tenant access forbidden.")
    return await _invite_member_for_agency(db, org_id, member, payload)


@router.put("/{org_id}/members/{member_id}/role")
async def update_member_role(
    org_id: str,
    member_id: str,
    payload: MemberRoleUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    if member.agency_id != org_id:
        raise HTTPException(status_code=403, detail="Cross-tenant access forbidden.")
    next_role = payload.role.strip().upper()
    if next_role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role '{payload.role}'")
    if next_role == "OWNER" and member.role != "OWNER":
        raise HTTPException(status_code=403, detail="Only OWNERs can grant the OWNER role.")

    res = await db.execute(
        select(AgencyMember).where(AgencyMember.id == member_id, AgencyMember.agency_id == org_id)
    )
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if target.role == "OWNER" and member.role != "OWNER":
        raise HTTPException(status_code=403, detail="Only OWNERs can modify another OWNER's role.")
    if target.user_id == member.user_id and next_role != "OWNER":
        raise HTTPException(status_code=400, detail="Owners cannot downgrade their own role.")

    target.role = next_role
    db.add(
        AuditLog(
            agency_id=org_id,
            user_id=member.user_id,
            action="MEMBER_ROLE_UPDATED",
            entity_type="AGENCY_MEMBER",
            entity_id=target.id,
            details={"new_role": next_role},
        )
    )
    await db.commit()
    await db.refresh(target)
    return {"id": target.id, "user_id": target.user_id, "role": target.role, "status": target.status}


@router.delete("/{org_id}/members/{user_id}")
async def remove_member(
    org_id: str,
    user_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    if member.agency_id != org_id:
        raise HTTPException(status_code=403, detail="Cross-tenant access forbidden.")
    if member.user_id == user_id:
        raise HTTPException(status_code=400, detail="Owners cannot remove themselves from their organization.")

    result = await db.execute(
        select(AgencyMember).where(AgencyMember.agency_id == org_id, AgencyMember.user_id == user_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")

    await db.delete(target)
    await db.commit()
    return {"success": True, "removed_user_id": user_id}


# =============================================================================
# Compatibility /orgs/* routes aligned with frontend/lib/api-client.ts
# =============================================================================

@orgs_compat_router.get("/current")
async def get_current_org_compat(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    return await _get_agency_or_404(db, member.agency_id)


@orgs_compat_router.put("/current")
async def update_current_org_compat(
    payload: OrgUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    return await _update_org_for_agency(db, member.agency_id, member.user_id, payload)


@orgs_compat_router.get("/members")
async def list_current_members_compat(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    return await _list_members_for_agency(db, member.agency_id)


@orgs_compat_router.post("/members/invite", status_code=status.HTTP_201_CREATED)
async def invite_member_compat(
    payload: MemberInvite,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    return await _invite_member_for_agency(db, member.agency_id, member, payload)


@orgs_compat_router.put("/members/{member_id}/role")
async def update_member_role_compat(
    member_id: str,
    payload: MemberRoleUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    return await update_member_role(member.agency_id, member_id, payload, member, db)


@orgs_compat_router.get("/invitations")
async def list_invitations_compat(
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Invitation)
        .where(Invitation.agency_id == member.agency_id)
        .order_by(Invitation.created_at.desc())
    )
    return res.scalars().all()


@orgs_compat_router.get("/invitations/{token}")
async def get_invitation_preview(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(request, bucket="orgs:invite_preview", max_requests=30, window_seconds=60)
    inv_res = await db.execute(select(Invitation).where(Invitation.token == token))
    invitation = inv_res.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation link is invalid or was not found")

    if invitation.status == "PENDING" and invitation.expires_at < datetime.now(timezone.utc):
        invitation.status = "EXPIRED"
        await db.commit()

    org_res = await db.execute(select(Agency).where(Agency.id == invitation.agency_id))
    agency = org_res.scalar_one_or_none()
    existing_user_res = await db.execute(select(User).where(User.email == invitation.email.lower()))
    existing_user = existing_user_res.scalar_one_or_none()
    has_real_account = bool(
        existing_user and existing_user.hashed_password and existing_user.hashed_password != "TEMP_INVITED_ACCOUNT"
    )
    return {
        "valid": invitation.status == "PENDING",
        "status": invitation.status,
        "email": invitation.email,
        "role": invitation.role,
        "expires_at": invitation.expires_at,
        "agency_name": agency.name if agency else "Workspace",
        "account_exists": has_real_account,
    }


@orgs_compat_router.post("/invitations/{token}/accept")
async def accept_invitation(
    token: str,
    request: Request,
    payload: Optional[InviteAcceptRequest] = Body(default=None),
    user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(request, bucket="orgs:invite_accept", max_requests=15, window_seconds=60)
    inv_res = await db.execute(select(Invitation).where(Invitation.token == token))
    invitation = inv_res.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation token not found")
    if invitation.status == "ACCEPTED":
        raise HTTPException(status_code=409, detail="This invitation has already been accepted")
    if invitation.status == "REVOKED":
        raise HTTPException(status_code=410, detail="This invitation has been revoked")
    if invitation.status == "EXPIRED" or invitation.expires_at < datetime.now(timezone.utc):
        invitation.status = "EXPIRED"
        await db.commit()
        raise HTTPException(status_code=410, detail="Invitation has expired")

    normalized_email = invitation.email.lower()
    target_user: Optional[User] = None

    if user is not None:
        if user.email.lower() != normalized_email:
            raise HTTPException(status_code=403, detail="Invitation email does not match authenticated account")
        target_user = user
        if not target_user.is_verified:
            target_user.is_verified = True
    else:
        existing_res = await db.execute(select(User).where(User.email == normalized_email))
        existing_user = existing_res.scalar_one_or_none()
        if existing_user and existing_user.hashed_password != "TEMP_INVITED_ACCOUNT":
            raise HTTPException(
                status_code=401,
                detail="An account already exists for this email. Please sign in to accept this invitation.",
            )
        if not payload or not payload.name or len(payload.name.strip()) < 2 or not payload.password or len(payload.password.strip()) < 8:
            raise HTTPException(
                status_code=400,
                detail="Full name (min 2 chars) and password (min 8 chars) are required to activate an invited account.",
            )
        if existing_user:
            existing_user.name = payload.name.strip()
            existing_user.hashed_password = get_password_hash(payload.password)
            existing_user.is_active = True
            existing_user.is_verified = True
            target_user = existing_user
        else:
            target_user = User(
                email=normalized_email,
                name=payload.name.strip(),
                hashed_password=get_password_hash(payload.password),
                is_active=True,
                is_verified=True,
            )
            db.add(target_user)
            await db.flush()

    mem_res = await db.execute(
        select(AgencyMember).where(
            AgencyMember.agency_id == invitation.agency_id,
            AgencyMember.user_id == target_user.id,
        )
    )
    membership = mem_res.scalar_one_or_none()
    if membership:
        membership.status = "ACTIVE"
        membership.role = invitation.role
    else:
        membership = AgencyMember(
            agency_id=invitation.agency_id,
            user_id=target_user.id,
            role=invitation.role,
            status="ACTIVE",
        )
        db.add(membership)

    invitation.status = "ACCEPTED"
    db.add(
        AuditLog(
            agency_id=invitation.agency_id,
            user_id=target_user.id,
            action="TEAM_INVITE_ACCEPTED",
            entity_type="INVITATION",
            entity_id=invitation.id,
            details={"email": normalized_email, "role": membership.role},
        )
    )

    access_tok = create_access_token(target_user.id)
    refresh_tok = create_access_token(target_user.id, expires_delta=timedelta(days=7))
    db.add(
        RefreshToken(
            user_id=target_user.id,
            token_hash=hashlib.sha256(refresh_tok.encode("utf-8")).hexdigest(),
            is_revoked=False,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
    )
    await db.commit()
    await db.refresh(target_user)

    return {
        "success": True,
        "agency_id": invitation.agency_id,
        "role": membership.role,
        "access_token": access_tok,
        "refresh_token": refresh_tok,
        "token_type": "bearer",
        "user": UserOut.model_validate(target_user),
    }


@orgs_compat_router.delete("/invitations/{invitation_id}")
async def revoke_invitation(
    invitation_id: str,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Invitation).where(
            Invitation.id == invitation_id,
            Invitation.agency_id == member.agency_id,
        )
    )
    inv = res.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if inv.status == "ACCEPTED":
        raise HTTPException(status_code=409, detail="Cannot revoke an invitation that was already accepted")
    inv.status = "REVOKED"
    db.add(
        AuditLog(
            agency_id=member.agency_id,
            user_id=member.user_id,
            action="TEAM_INVITE_REVOKED",
            entity_type="INVITATION",
            entity_id=inv.id,
            details={"email": inv.email},
        )
    )
    await db.commit()
    return {"success": True, "id": invitation_id, "status": "REVOKED"}


@orgs_compat_router.get("/onboarding")
async def get_onboarding_compat(
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    return await get_onboarding_state(member, db)


@orgs_compat_router.put("/onboarding")
async def update_onboarding_compat(
    payload: OnboardingProgressUpdate,
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    return await update_onboarding_state(payload, member, db)


@orgs_compat_router.post("/onboarding/complete")
async def complete_onboarding_compat(
    member: AgencyMember = Depends(require_role(["OWNER", "ADMIN"])),
    db: AsyncSession = Depends(get_db),
):
    return await complete_onboarding(member, db)

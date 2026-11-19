from datetime import datetime, timedelta, timezone
import hashlib
import re
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.api.deps import get_current_tenant_member, get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.security import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from app.models.entities import Agency, AgencyMember, AuditLog, RefreshToken, User
from app.schemas.pydantic_models import TimezoneUpdate, Token, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["Authentication"])


def slugify(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", name.lower()).strip("-")
    return cleaned or "workspace"


async def generate_unique_slug(db: AsyncSession, name: str) -> str:
    base = slugify(name)[:72]
    candidate = f"{base}-org"
    existing = await db.execute(select(Agency.id).where(Agency.slug == candidate))
    if existing.scalar_one_or_none() is None:
        return candidate
    for _ in range(10):
        suffix = secrets.token_hex(3)
        candidate = f"{base}-{suffix}"
        check = await db.execute(select(Agency.id).where(Agency.slug == candidate))
        if check.scalar_one_or_none() is None:
            return candidate
    return f"org-{secrets.token_hex(6)}"


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def _issue_refresh_token(db: AsyncSession, user_id: str) -> str:
    raw_refresh = create_access_token(
        user_id,
        expires_delta=timedelta(days=7),
    )
    record = RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(raw_refresh),
        is_revoked=False,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(record)
    return raw_refresh


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=255)


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8)


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class VerifyEmailRequest(BaseModel):
    token: str


@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: UserCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    normalized_email = str(payload.email).strip().lower()
    enforce_rate_limit(request, bucket="auth:signup", max_requests=10, window_seconds=300, identifier=normalized_email)

    existing = await db.execute(select(User).where(User.email == normalized_email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists",
        )

    org_slug = await generate_unique_slug(db, payload.agency_name)
    org = Agency(
        name=payload.agency_name.strip(),
        slug=org_slug,
        tier="STARTER",
        contact_email=normalized_email,
        onboarding_step=1,
        onboarding_completed=False,
        onboarding_data={
            "organizationName": payload.agency_name.strip(),
            "contactEmail": normalized_email,
            "timezone": "UTC",
            "platform": "n8n",
        },
    )
    db.add(org)
    await db.flush()

    user = User(
        email=normalized_email,
        name=payload.name.strip(),
        hashed_password=get_password_hash(payload.password),
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    await db.flush()

    member = AgencyMember(
        agency_id=org.id,
        user_id=user.id,
        role="OWNER",
        status="ACTIVE",
    )
    db.add(member)
    db.add(
        AuditLog(
            agency_id=org.id,
            user_id=user.id,
            action="ORG_REGISTERED",
            entity_type="AGENCY",
            entity_id=org.id,
            details={"agency_name": org.name, "owner_email": normalized_email},
        )
    )
    refresh_tok = await _issue_refresh_token(db, user.id)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return Token(
        access_token=token,
        refresh_token=refresh_tok,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=Token)
async def login(
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = str(payload.get("email") or "").strip().lower()
    password = payload.get("password")

    enforce_rate_limit(request, bucket="auth:login", max_requests=15, window_seconds=60, identifier=email)

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required",
        )

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    refresh_tok = await _issue_refresh_token(db, user.id)
    await db.commit()

    token = create_access_token(user.id)
    return Token(
        access_token=token,
        refresh_token=refresh_tok,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    decoded = decode_access_token(payload.refresh_token)
    if not decoded or not decoded.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = decoded["sub"]
    hashed = _hash_token(payload.refresh_token)
    rt_res = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hashed))
    stored_rt = rt_res.scalar_one_or_none()
    if stored_rt is not None:
        if stored_rt.is_revoked or stored_rt.expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token has been revoked or expired",
            )
        stored_rt.is_revoked = True
        stored_rt.rotated_at = datetime.now(timezone.utc)

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User account not found")

    next_refresh = await _issue_refresh_token(db, user.id)
    await db.commit()

    new_token = create_access_token(user.id)
    return Token(
        access_token=new_token,
        refresh_token=next_refresh,
        token_type="bearer",
        user=UserOut.model_validate(user),
    )


@router.post("/logout")
async def logout(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.is_revoked == False)
        .values(is_revoked=True, rotated_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"success": True, "message": "Successfully logged out session."}


@router.get("/me")
async def get_me(
    user: User = Depends(get_current_user),
    member: AgencyMember = Depends(get_current_tenant_member),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Agency).where(Agency.id == member.agency_id))
    agency = result.scalar_one_or_none()

    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "timezone": getattr(user, "timezone", "UTC") or "UTC",
            "isVerified": bool(getattr(user, "is_verified", False)),
            "is_verified": bool(getattr(user, "is_verified", False)),
            "role": member.role,
            "agencyId": member.agency_id,
        },
        "agency": {
            "id": agency.id if agency else member.agency_id,
            "name": agency.name if agency else "Organization",
            "slug": agency.slug if agency else "org",
            "tier": agency.tier if agency else "STARTER",
            "contactEmail": agency.contact_email if agency else user.email,
            "timezone": getattr(agency, "timezone", "UTC") if agency else "UTC",
            "onboardingStep": getattr(agency, "onboarding_step", 1) if agency else 1,
            "onboardingCompleted": bool(getattr(agency, "onboarding_completed", False)) if agency else False,
            "onboardingData": getattr(agency, "onboarding_data", None) if agency else None,
        },
    }


@router.put("/timezone")
async def update_timezone(
    payload: TimezoneUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        ZoneInfo(payload.timezone)
    except ZoneInfoNotFoundError:
        raise HTTPException(status_code=400, detail=f"Invalid IANA timezone: {payload.timezone}")

    user.timezone = payload.timezone
    await db.commit()
    await db.refresh(user)
    return {"success": True, "timezone": user.timezone}


@router.put("/profile")
async def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.name = payload.name.strip()
    await db.commit()
    await db.refresh(user)
    return {"success": True, "user": UserOut.model_validate(user)}


@router.post("/change-password")
async def change_password(
    payload: PasswordChange,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.old_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password incorrect")

    user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    return {"success": True, "message": "Password updated successfully."}


@router.post("/forgot-password")
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    normalized_email = str(payload.email).strip().lower()
    enforce_rate_limit(request, bucket="auth:forgot", max_requests=6, window_seconds=300, identifier=normalized_email)

    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()
    dev_token = create_access_token(user.id) if (user and settings.ENVIRONMENT == "development") else None
    return {
        "success": True,
        "email_delivery": "NOT_CONFIGURED" if not settings.SENTRY_DSN else "QUEUED",
        "message": "If an account exists for that email, password reset instructions have been prepared. Configure SMTP in production to dispatch emails automatically.",
        "dev_reset_token": dev_token,
    }


@router.post("/reset-password")
async def reset_password(
    payload: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit(request, bucket="auth:reset", max_requests=10, window_seconds=300)

    if len(payload.new_password.strip()) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters long.")

    decoded = decode_access_token(payload.token)
    if not decoded or not decoded.get("sub"):
        raise HTTPException(status_code=400, detail="Invalid or expired password reset token.")

    result = await db.execute(select(User).where(User.id == decoded["sub"], User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Account not found.")

    user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
    return {"success": True, "message": "Password has been reset successfully."}


@router.post("/resend-verification")
async def resend_verification(
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = str(payload.get("email") or "").strip().lower()
    enforce_rate_limit(request, bucket="auth:verify", max_requests=6, window_seconds=300, identifier=email)

    user = None
    if email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

    dev_token = create_access_token(user.id) if (user and settings.ENVIRONMENT == "development") else None
    return {
        "success": True,
        "email_delivery": "NOT_CONFIGURED" if settings.ENVIRONMENT != "development" else "LOCAL_DEV_PREVIEW",
        "message": "Verification instructions prepared.",
        "dev_verification_token": dev_token,
    }


@router.post("/verify-email")
async def verify_email(
    payload: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
):
    decoded = decode_access_token(payload.token)
    if not decoded or not decoded.get("sub"):
        raise HTTPException(status_code=400, detail="Invalid or expired email verification token.")

    result = await db.execute(select(User).where(User.id == decoded["sub"]))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Account not found.")

    user.is_verified = True
    await db.commit()
    return {"success": True, "is_verified": True, "message": "Email address verified."}

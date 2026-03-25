"""
ORM models aligned with the mobile app:
  PanoramaItem  → panoramas
  World3DMeta   → world3d (JSONB)
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Panorama(Base):
    __tablename__ = "panoramas"

    # Same id as X-Panorama-Id from /stitch (UUID string)
    id: Mapped[str] = mapped_column(String(64), primary_key=True)

    title: Mapped[str] = mapped_column(String(512), default="Untitled panorama")
    date_display: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Filenames under PANORAMA_OUTPUT_DIR (not full URLs — app may use local file://)
    stitched_filename: Mapped[str] = mapped_column(String(512))
    staged_filename: Mapped[str | None] = mapped_column(String(512), nullable=True)

    staging_prompt_last: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Mirrors World3DMeta from src/services/panoramaStorage.ts
    world3d: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    # Optional multi-device / future auth (nullable)
    device_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)

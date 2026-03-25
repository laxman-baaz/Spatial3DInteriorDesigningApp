"""CRUD helpers for panoramas (Postgres)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from db_models import Panorama


def upsert_after_stitch(
    db: Session,
    panorama_id: str,
    stitched_filename: str,
    *,
    title: str | None = None,
    device_id: str | None = None,
) -> Panorama:
    row = db.get(Panorama, panorama_id)
    now = datetime.now(timezone.utc)
    if row:
        row.stitched_filename = stitched_filename
        row.updated_at = now
        if device_id:
            row.device_id = device_id
        if title is not None:
            row.title = title
    else:
        row = Panorama(
            id=panorama_id,
            title=title or f"Panorama {panorama_id[:8]}",
            date_display=None,
            stitched_filename=stitched_filename,
            staged_filename=None,
            staging_prompt_last=None,
            world3d=None,
            created_at=now,
            updated_at=now,
            device_id=device_id,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_after_stage(
    db: Session,
    panorama_id: str,
    staged_filename: str,
    staging_prompt: str | None = None,
) -> Panorama | None:
    row = db.get(Panorama, panorama_id)
    if not row:
        return None
    row.staged_filename = staged_filename
    row.updated_at = datetime.now(timezone.utc)
    if staging_prompt is not None:
        row.staging_prompt_last = staging_prompt
    db.commit()
    db.refresh(row)
    return row


def update_world3d(db: Session, panorama_id: str, world3d: dict[str, Any]) -> Panorama | None:
    row = db.get(Panorama, panorama_id)
    if not row:
        return None
    row.world3d = world3d
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


def patch_metadata(
    db: Session,
    panorama_id: str,
    *,
    title: str | None = None,
    date_display: str | None = None,
    device_id: str | None = None,
) -> Panorama | None:
    row = db.get(Panorama, panorama_id)
    if not row:
        return None
    if title is not None:
        row.title = title
    if date_display is not None:
        row.date_display = date_display
    if device_id is not None:
        row.device_id = device_id
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(row)
    return row


def list_all(db: Session, limit: int = 200) -> list[Panorama]:
    stmt = select(Panorama).order_by(Panorama.created_at.desc()).limit(limit)
    return list(db.scalars(stmt).all())


def get_one(db: Session, panorama_id: str) -> Panorama | None:
    return db.get(Panorama, panorama_id)


def upsert_imported_panorama(
    db: Session,
    panorama_id: str,
    stitched_filename: str,
    *,
    title: str,
    date_display: str | None,
    staged_filename: str | None,
    world3d: dict[str, Any] | None = None,
    patch_world3d: bool = False,
    device_id: str | None = None,
) -> Panorama:
    """
    Create or replace a panorama from phone upload (stitched JPEG on disk + DB row).
    If patch_world3d is False on update, existing world3d JSON is left unchanged.
    """
    row = db.get(Panorama, panorama_id)
    now = datetime.now(timezone.utc)
    if row:
        row.stitched_filename = stitched_filename
        row.title = title
        row.date_display = date_display
        row.updated_at = now
        row.staged_filename = staged_filename
        if patch_world3d:
            row.world3d = world3d
        if device_id is not None:
            row.device_id = device_id
    else:
        row = Panorama(
            id=panorama_id,
            title=title,
            date_display=date_display,
            stitched_filename=stitched_filename,
            staged_filename=staged_filename,
            staging_prompt_last=None,
            world3d=world3d if patch_world3d else None,
            created_at=now,
            updated_at=now,
            device_id=device_id,
        )
        db.add(row)
    db.commit()
    db.refresh(row)
    return row

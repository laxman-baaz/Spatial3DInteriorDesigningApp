"""
PostgreSQL connection (optional). Set DATABASE_URL in backend/.env, e.g.:
  postgresql+psycopg2://user:password@localhost:5432/interior_design
"""
from __future__ import annotations

import os
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

engine = create_engine(DATABASE_URL, pool_pre_ping=True) if DATABASE_URL else None
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session | None, None, None]:
    if SessionLocal is None:
        yield None
        return
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> bool:
    """Create tables if DATABASE_URL is set. Returns True if DB is ready."""
    if engine is None:
        return False
    # Import models so they register on Base.metadata
    from db_models import Panorama  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return True


def db_health_check() -> dict:
    """For GET /health when DB is configured."""
    if engine is None:
        return {"configured": False}
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"configured": True, "ok": True}
    except Exception as e:
        return {"configured": True, "ok": False, "error": str(e)}

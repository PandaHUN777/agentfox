"""Database session management.

SQLite by default so the whole control plane runs with no infrastructure at all
(NFR-9); Postgres via ``NOMETRIA_DATABASE_URL`` for anything real.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings
from .models import Base

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _build_engine() -> Engine:
    settings = get_settings()
    url = settings.database_url
    kwargs: dict = {"echo": settings.sql_echo, "future": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(url, **kwargs)

    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            # WAL keeps the gateway's write path from blocking dashboard reads.
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return engine


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def get_sessionmaker() -> sessionmaker[Session]:
    """The one session factory, with tenant isolation already wired in.

    Isolation is installed here rather than at each call site so that there is no way
    to obtain an unfiltered session by accident — a second, unprotected factory would
    reintroduce exactly the leak this closes.
    """
    global _SessionLocal
    if _SessionLocal is None:
        from .tenancy import install as install_tenancy

        _SessionLocal = sessionmaker(bind=get_engine(), expire_on_commit=False, future=True)
        install_tenancy(_SessionLocal)
    return _SessionLocal


def init_db(stamp: bool = True) -> None:
    """Create the schema directly.

    Convenience for tests and first-run local use. **Production upgrades go through
    Alembic** (`nometria db upgrade`) — `create_all` cannot evolve an existing schema,
    which is the defect PL-2 fixed.

    When ``stamp`` is set and Alembic is available, the fresh database is stamped at
    ``head`` so a later `alembic upgrade` does not try to re-create tables that are
    already there.
    """
    engine = get_engine()
    fresh = not inspect(engine).has_table("agents")
    Base.metadata.create_all(engine)
    if stamp and fresh:
        _stamp_head()


def _stamp_head() -> None:
    """Mark a create_all-built database as being at the latest revision."""
    try:
        from alembic import command
        from alembic.config import Config

        from .config import REPO_ROOT

        ini = REPO_ROOT / "alembic.ini"
        if not ini.exists():
            return
        cfg = Config(str(ini))
        cfg.set_main_option("script_location", str(REPO_ROOT / "migrations"))
        cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
        command.stamp(cfg, "head")
    except Exception:  # pragma: no cover - alembic is optional for library use
        pass


def upgrade_db(revision: str = "head") -> None:
    """Run migrations against the configured database."""
    from alembic import command
    from alembic.config import Config

    from .config import REPO_ROOT

    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
    command.upgrade(cfg, revision)


def downgrade_db(revision: str) -> None:
    from alembic import command
    from alembic.config import Config

    from .config import REPO_ROOT

    cfg = Config(str(REPO_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(REPO_ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
    command.downgrade(cfg, revision)


def current_revision() -> str | None:
    from sqlalchemy import text

    with get_engine().connect() as conn:
        try:
            row = conn.execute(text("SELECT version_num FROM alembic_version")).first()
        except Exception:
            return None
    return row[0] if row else None


def reset_engine() -> None:
    """Test hook. Drops cached engine/sessionmaker so settings changes take effect."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


@contextmanager
def session_scope() -> Iterator[Session]:
    session = get_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    session = get_sessionmaker()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

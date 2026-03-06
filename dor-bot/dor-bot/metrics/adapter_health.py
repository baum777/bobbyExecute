"""
Adapter health tracking for KPI Dashboard V1.
Status: ok | degraded | down
"""
from datetime import datetime
from db.database import get_connection


def record_adapter_status(adapter: str, status: str, reason: str | None = None) -> int:
    """Record adapter health. Status: ok | degraded | down."""
    if status not in ("ok", "degraded", "down"):
        status = "down"
    last_ok_at = datetime.utcnow().isoformat() + "Z" if status == "ok" else None
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO adapter_health (adapter, status, last_ok_at, reason)
           VALUES (?, ?, ?, ?)""",
        (adapter, status, last_ok_at, reason),
    )
    conn.commit()
    return cur.lastrowid


def get_latest_adapter_health() -> list[dict]:
    """Return latest status per adapter (one row per adapter, most recent)."""
    by_adapter = get_adapter_health_by_adapter()
    return [{"adapter": k, **v} for k, v in by_adapter.items()]


def get_adapter_health_by_adapter() -> dict[str, dict]:
    """Return latest health per adapter as {adapter: {status, last_ok_at, reason}}."""
    conn = get_connection()
    cur = conn.execute(
        """SELECT adapter, status, last_ok_at, reason
           FROM adapter_health
           WHERE id IN (
             SELECT MAX(id) FROM adapter_health GROUP BY adapter
           )"""
    )
    # SQLite doesn't support that subquery directly; use simpler query
    cur = conn.execute(
        """SELECT adapter, status, last_ok_at, reason
           FROM adapter_health
           ORDER BY id DESC"""
    )
    seen = set()
    out = {}
    for r in cur.fetchall():
        a = r["adapter"]
        if a not in seen:
            seen.add(a)
            out[a] = {
                "status": r["status"],
                "last_ok_at": r["last_ok_at"],
                "reason": r["reason"],
            }
    return out

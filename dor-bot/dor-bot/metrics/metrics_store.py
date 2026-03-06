"""
Metrics snapshot writer for KPI Dashboard V1.
Write/read MCI, BCI, Hybrid, DataQuality, ChaosPassRate.
"""
from db.database import get_connection


def write_metrics_snapshot(
    ts: str,
    mci: float | None = None,
    bci: float | None = None,
    hybrid: float | None = None,
    data_quality: float | None = None,
    chaos_pass_rate: float | None = None,
) -> int:
    """Write a metrics snapshot row. Returns row id."""
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO metrics_snapshot (ts, mci, bci, hybrid, data_quality, chaos_pass_rate)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (ts, mci, bci, hybrid, data_quality, chaos_pass_rate),
    )
    conn.commit()
    return cur.lastrowid


def get_latest_metrics() -> dict | None:
    """Return the most recent metrics snapshot."""
    conn = get_connection()
    cur = conn.execute(
        """SELECT ts, mci, bci, hybrid, data_quality, chaos_pass_rate
           FROM metrics_snapshot ORDER BY id DESC LIMIT 1"""
    )
    row = cur.fetchone()
    if not row:
        return None
    return {
        "ts": row["ts"],
        "mci": row["mci"],
        "bci": row["bci"],
        "hybrid": row["hybrid"],
        "data_quality": row["data_quality"],
        "chaos_pass_rate": row["chaos_pass_rate"],
    }


def get_metrics_history(limit: int = 100) -> list[dict]:
    """Return last N metric snapshots for sparklines."""
    conn = get_connection()
    cur = conn.execute(
        """SELECT ts, mci, bci, hybrid, data_quality, chaos_pass_rate
           FROM metrics_snapshot ORDER BY id DESC LIMIT ?""",
        (limit,),
    )
    return [dict(r) for r in cur.fetchall()]

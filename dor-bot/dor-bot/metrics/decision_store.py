"""
Decision persistence for KPI Dashboard V1.
Stores decisions from ActionLog, RiskAgent, Execution layer.
"""
import json
from db.database import get_connection


def store_decision(
    ts: str,
    run_id: str = "",
    entity: str = "",
    action: str = "",
    confidence: float = 0.0,
    reasons: list | dict | None = None,
    risk_flags: list | None = None,
) -> int:
    """Insert a decision row. Returns row id."""
    reasons_str = json.dumps(reasons) if reasons is not None else None
    risk_flags_str = json.dumps(risk_flags) if risk_flags is not None else None
    conn = get_connection()
    cur = conn.execute(
        """INSERT INTO decisions (ts, run_id, entity, action, confidence, reasons, risk_flags)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (ts, run_id, entity, action, confidence, reasons_str, risk_flags_str),
    )
    conn.commit()
    return cur.lastrowid


def get_recent_decisions(limit: int = 50) -> list[dict]:
    """Return recent decisions, newest first."""
    conn = get_connection()
    cur = conn.execute(
        """SELECT id, ts, run_id, entity, action, confidence, reasons, risk_flags
           FROM decisions ORDER BY id DESC LIMIT ?""",
        (limit,),
    )
    rows = cur.fetchall()
    out = []
    for r in rows:
        reasons = json.loads(r["reasons"]) if r["reasons"] else None
        risk_flags = json.loads(r["risk_flags"]) if r["risk_flags"] else None
        out.append({
            "id": r["id"],
            "ts": r["ts"],
            "run_id": r["run_id"],
            "entity": r["entity"],
            "action": r["action"],
            "confidence": r["confidence"],
            "reasons": reasons,
            "risk_flags": risk_flags,
        })
    return out

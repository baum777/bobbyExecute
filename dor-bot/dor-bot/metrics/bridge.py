"""
TS→Python Bridge (Wave 3 P1).
Fetches KPIs from BobbyExecution bot HTTP API when available.
When bot server is not running, returns None so dor-bot falls back to legacy sources.
"""
import json
import logging
import os
import urllib.request

log = logging.getLogger("bridge")

# Default: bot server on port 3333 (see bot/package.json start:server)
BOT_KPI_URL = os.environ.get("BOT_KPI_URL", "http://localhost:3333")
TIMEOUT_SEC = 3


def _fetch(path: str) -> dict | None:
    """GET from bot API. Returns parsed JSON or None on failure."""
    url = f"{BOT_KPI_URL.rstrip('/')}{path}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=TIMEOUT_SEC) as r:
            return json.loads(r.read().decode())
    except Exception as e:
        log.debug("bridge fetch %s: %s", path, e)
        return None


def get_bot_summary() -> dict | None:
    """Fetch /kpi/summary from bot. Returns None if bot unreachable."""
    return _fetch("/kpi/summary")


def get_bot_decisions(limit: int = 50) -> list[dict] | None:
    """Fetch /kpi/decisions from bot. Returns None if bot unreachable."""
    data = _fetch(f"/kpi/decisions?limit={limit}")
    if not data or "decisions" not in data:
        return None
    # Convert bot format → dor-bot format (entity, ts, action, confidence, reasons)
    return [
        {
            "id": d.get("id", ""),
            "ts": d.get("timestamp", ""),
            "run_id": "",
            "entity": d.get("token", ""),
            "action": d.get("action", "allow"),
            "confidence": d.get("confidence", 0),
            "reasons": d.get("reasons", []),
            "risk_flags": None,
        }
        for d in data["decisions"]
    ]


def get_bot_adapters() -> list[dict] | None:
    """Fetch /kpi/adapters from bot. Returns None if bot unreachable."""
    data = _fetch("/kpi/adapters")
    if not data or "adapters" not in data:
        return None
    # Convert bot format → dor-bot format (adapter, status, last_ok_at, reason)
    return [
        {
            "adapter": a.get("id", ""),
            "status": "ok" if a.get("status") == "healthy" else ("degraded" if a.get("status") == "degraded" else "down"),
            "last_ok_at": a.get("lastSuccessAt") if a.get("status") != "down" else None,
            "reason": f"failures={a.get('consecutiveFailures', 0)}" if a.get("consecutiveFailures", 0) > 0 else None,
        }
        for a in data["adapters"]
    ]


def get_bot_metrics() -> dict | None:
    """Fetch /kpi/summary for metrics-like data. Returns chaos_pass_rate, data_quality, hybrid proxy."""
    data = get_bot_summary()
    if not data:
        return None
    from datetime import datetime
    return {
        "ts": datetime.utcnow().isoformat() + "Z",
        "chaos_pass_rate": data.get("chaosPassRate", 1.0),
        "data_quality": data.get("dataQuality", 1.0),
        "hybrid": data.get("riskScore", 0.0),
    }


def is_bot_available() -> bool:
    """Check if bot /health responds."""
    data = _fetch("/health")
    return data is not None and data.get("status") in ("OK", "DEGRADED")

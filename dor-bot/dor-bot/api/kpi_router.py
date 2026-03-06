"""
KPI API Endpoints for Browser Dashboard V1.
Read-only. Fail-safe: return null + reason on missing data.
Wave 3: Prefer bot KPIs via bridge when BobbyExecution bot server is available.
"""
import time
from fastapi import APIRouter, Request
from db.database import get_connection
from metrics.metrics_store import get_latest_metrics, get_metrics_history
from metrics.decision_store import get_recent_decisions
from metrics.adapter_health import get_latest_adapter_health

try:
    from metrics.bridge import get_bot_summary, get_bot_decisions, get_bot_adapters, get_bot_metrics
    BRIDGE_AVAILABLE = True
except ImportError:
    BRIDGE_AVAILABLE = False

router = APIRouter(prefix="/kpi", tags=["kpi"])


def _safe_metric(val, reason: str = "not computed"):
    """Fail-safe: return value or {value: null, reason}."""
    if val is not None:
        return {"value": val, "reason": None}
    return {"value": None, "reason": reason}


# --- /health (root level, not under /kpi) ---
# We'll add this to the main app separately or use a different path.
# Prompt says GET /health - so we need it. Include in router with prefix="" for /health?
# Actually the router has prefix="/kpi", so /kpi/health would be wrong. The prompt says GET /health at root.
# I'll create the router with no prefix for /health, and prefix "/kpi" for the rest. We can have two routers or add /health in server.py. Let me add /health in server.py when we modify it, and keep the kpi routes here.


@router.get("/summary")
def kpi_summary(request: Request):
    """Bot status, risk score, chaos pass rate, data quality. Prefer bot bridge when available."""
    bot_summary = None
    if BRIDGE_AVAILABLE:
        bot_summary = get_bot_summary()
    if bot_summary:
        return {
            "bot_status": bot_summary.get("botStatus", "stopped"),
            "risk_score": _safe_metric(bot_summary.get("riskScore")),
            "chaos_pass_rate": _safe_metric(bot_summary.get("chaosPassRate")),
            "data_quality": _safe_metric(bot_summary.get("dataQuality")),
            "last_decision_at": bot_summary.get("lastDecisionAt"),
            "trades_today": bot_summary.get("tradesToday", 0),
        }
    metrics = get_latest_metrics()
    bot_state = getattr(request.app.state, "bot_state", None)
    bot_status = "running" if (bot_state and getattr(bot_state, "running", False)) else "stopped"
    risk_score = None
    chaos_pass_rate = None
    data_quality = None
    if metrics:
        chaos_pass_rate = metrics.get("chaos_pass_rate")
        data_quality = metrics.get("data_quality")
        hybrid = metrics.get("hybrid")
        if hybrid is not None:
            risk_score = abs(hybrid)  # proxy: absolute hybrid as risk exposure
    return {
        "bot_status": bot_status,
        "risk_score": _safe_metric(risk_score),
        "chaos_pass_rate": _safe_metric(chaos_pass_rate),
        "data_quality": _safe_metric(data_quality),
    }


@router.get("/market")
def kpi_market(request: Request):
    """MCI, BCI, Hybrid from latest snapshot."""
    metrics = get_latest_metrics()
    if not metrics:
        return {
            "mci": _safe_metric(None),
            "bci": _safe_metric(None),
            "hybrid": _safe_metric(None),
        }
    return {
        "mci": _safe_metric(metrics.get("mci")),
        "bci": _safe_metric(metrics.get("bci")),
        "hybrid": _safe_metric(metrics.get("hybrid")),
    }


@router.get("/adapters")
def kpi_adapters():
    """Latest adapter health grouped by adapter. Prefer bot bridge when available."""
    if BRIDGE_AVAILABLE:
        rows = get_bot_adapters()
        if rows is not None:
            return {"adapters": rows, "source": "bot"}
    rows = get_latest_adapter_health()
    return {"adapters": rows}


@router.get("/decisions")
def kpi_decisions(limit: int = 50):
    """Recent decisions. Prefer bot bridge when available."""
    if BRIDGE_AVAILABLE:
        items = get_bot_decisions(limit=limit)
        if items is not None:
            return {"items": items, "source": "bot"}
    items = get_recent_decisions(limit=limit)
    return {"items": items}


@router.get("/history")
def kpi_history(limit: int = 100):
    """Metric snapshots for sparklines."""
    items = get_metrics_history(limit=limit)
    return {"items": items}

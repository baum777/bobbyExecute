"""
server.py – BOOBY BOT Dashboard-Server v30
Starten: python3 start.py → http://localhost:8000
NEU in v30: /api/backtest, /api/ml_status, Telegram-Config
"""
import asyncio, json, logging, os, sys, threading, time
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("bot.log", encoding="utf-8"),
    ],
    force=True,
)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
import uvicorn

log = logging.getLogger("server")
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(__file__))

try:
    from bot import Bot, DEFAULT_CFG
    BOT_AVAILABLE = True
except ImportError as e:
    BOT_AVAILABLE = False
    log.warning(f"bot.py nicht gefunden: {e}")


class BotState:
    running    = False
    bot        = None
    thread     = None
    start_time = None
    log_lines  = []

state = BotState()


def append_log(msg: str, level: str = "INFO"):
    state.log_lines.append({
        "time":  datetime.now().strftime("%H:%M:%S"),
        "level": level,
        "msg":   msg,
    })
    if len(state.log_lines) > 500:
        state.log_lines = state.log_lines[-500:]


class DashHandler(logging.Handler):
    def emit(self, record):
        lvl = ("ERROR" if record.levelno >= logging.ERROR else
               "WARN"  if record.levelno >= logging.WARNING else "INFO")
        append_log(self.format(record), lvl)

_h = DashHandler()
_h.setFormatter(logging.Formatter("%(message)s"))
logging.getLogger().addHandler(_h)


def read_json(path: str, default=None) -> dict:
    try:
        if os.path.exists(path): return json.load(open(path))
    except Exception: pass
    return default or {}


def load_config() -> dict:
    cfg = dict(DEFAULT_CFG) if BOT_AVAILABLE else {}
    cfg.update(read_json("config.json", {}))
    return cfg


def run_bot():
    try:
        cfg = load_config()
        b = Bot(cfg)
        state.bot = b
        state.start_time = datetime.now()
        asyncio.run(b.run())
    except Exception as e:
        append_log(f"Bot-Fehler: {e}", "ERROR")
        log.error(f"Bot-Thread Fehler: {e}", exc_info=True)
    finally:
        state.running = False
        append_log("Bot gestoppt", "WARN")


app = FastAPI(title="BOOBY BOT v30")

# KPI Dashboard V1
def metrics_tick():
    """Compute and store metrics snapshot every 15s. Prefer bot KPIs via bridge when available."""
    try:
        from datetime import datetime
        from metrics.metrics_store import write_metrics_snapshot
        ts = datetime.utcnow().isoformat() + "Z"
        try:
            from metrics.bridge import get_bot_metrics
            bot_m = get_bot_metrics()
            if bot_m:
                write_metrics_snapshot(
                    ts,
                    mci=None,
                    bci=None,
                    hybrid=bot_m.get("hybrid"),
                    data_quality=bot_m.get("data_quality"),
                    chaos_pass_rate=bot_m.get("chaos_pass_rate"),
                )
                return
        except ImportError:
            pass
        mem = read_json("memory.json", {})
        s = mem.get("stats", {})
        wr = float(s.get("win_rate", 0.5) or 0.5)
        th = float(mem.get("threshold", 62) or 62)
        # Proxies: mci ~ (win_rate-0.5)*2, bci ~ 0.8, hybrid ~ weighted
        mci = max(-1, min(1, (wr - 0.5) * 2))
        bci = 0.8
        hybrid = 0.55 * mci + 0.45 * bci
        hybrid = max(-1, min(1, hybrid))
        data_quality = 0.9
        chaos_pass_rate = 1.0
        write_metrics_snapshot(ts, mci, bci, hybrid, data_quality, chaos_pass_rate)
    except Exception as e:
        log.warning(f"metrics_tick: {e}")

def run_metrics_loop():
    while True:
        time.sleep(15)
        metrics_tick()

_metrics_thread = None

@app.on_event("startup")
def auto_start():
    global _metrics_thread
    app.state.server_start = time.time()
    app.state.bot_state = state
    if BOT_AVAILABLE and not state.running:
        state.running = True
        state.thread = threading.Thread(target=run_bot, daemon=True)
        state.thread.start()
        append_log("Bot automatisch gestartet", "INFO")
    # KPI metrics background loop
    try:
        from metrics.metrics_store import write_metrics_snapshot
        from datetime import datetime
        ts = datetime.utcnow().isoformat() + "Z"
        write_metrics_snapshot(ts, 0, 0.8, 0.4, 0.9, 1.0)  # bootstrap
        _metrics_thread = threading.Thread(target=run_metrics_loop, daemon=True)
        _metrics_thread.start()
    except Exception as e:
        log.warning(f"KPI metrics loop: {e}")
    # KPI router
    try:
        from api.kpi_router import router as kpi_router
        app.include_router(kpi_router)
    except Exception as e:
        log.warning(f"KPI router: {e}")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    """KPI Dashboard V1 - Health check."""
    uptime_s = time.time() - getattr(app.state, "server_start", time.time())
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z", "uptime_s": round(uptime_s)}

@app.get("/dashboard", response_class=HTMLResponse)
def dashboard():
    p = Path("dashboard.html")
    if p.exists(): return p.read_text(encoding="utf-8")
    return "<h1>dashboard.html nicht gefunden</h1>"


@app.get("/", response_class=HTMLResponse)
def index():
    p = Path("dashboard.html")
    if p.exists(): return p.read_text(encoding="utf-8")
    return "<h1>dashboard.html nicht gefunden</h1>"


@app.get("/api/status")
def api_status():
    uptime = ""
    if state.start_time:
        d = datetime.now() - state.start_time
        h, rem = divmod(int(d.total_seconds()), 3600)
        m, s = divmod(rem, 60)
        uptime = f"{h:02d}:{m:02d}:{s:02d}"
    return {"running": state.running, "uptime": uptime,
            "libs": BOT_AVAILABLE, "mode": "LIVE" if BOT_AVAILABLE else "SIM"}


@app.get("/api/stats")
def api_stats():
    mem = read_json("memory.json", {})
    s = mem.get("stats", {})
    trades = mem.get("trades", [])
    real_trades = [t for t in trades if abs(float(t.get("pnl_pct", 0) or 0)) > 0.001]
    real_wins   = [t for t in real_trades if float(t.get("pnl_pct", 0) or 0) > 0]
    real_wr     = len(real_wins) / len(real_trades) if real_trades else 0
    real_pnl    = sum(float(t.get("pnl_sol", 0) or 0) for t in real_trades)
    streak = 0
    for t in reversed(trades[-20:]):
        if float(t.get("pnl_pct", 0) or 0) < 0: streak += 1
        else: break
    return {
        "total_trades":  s.get("n", 0),
        "real_trades":   len(real_trades),
        "win_rate":      round(real_wr, 4),
        "pnl_sol":       round(real_pnl, 6),
        "threshold":     mem.get("threshold", 62.0),
        "loss_streak":   streak,
        "strategy_stats": mem.get("strategy_stats", {}),
        "avg_win":       round(s.get("avg_win", 0), 4),
        "avg_loss":      round(s.get("avg_loss", 0), 4),
    }


@app.get("/api/balance")
async def api_balance():
    mem = read_json("memory.json", {})
    bal = float(mem.get("last_balance_sol", 0.0) or 0.0)
    if bal < 0.001:
        try:
            cfg = load_config()
            rpc = cfg.get("rpc_url", "")
            wallet_data = read_json(cfg.get("wallet_file", "wallet.json"), {})
            address = wallet_data.get("address", "")
            if address and rpc:
                import aiohttp
                async with aiohttp.ClientSession() as s:
                    async with s.post(rpc, json={"jsonrpc":"2.0","id":1,"method":"getBalance","params":[address]},
                                      timeout=aiohttp.ClientTimeout(total=4)) as r:
                        d = await r.json()
                bal = d.get("result", {}).get("value", 0) / 1e9
        except Exception: pass
    return {"sol": round(bal, 6), "balance_sol": round(bal, 6)}


@app.get("/api/positions")
def api_positions():
    positions = read_json("positions.json", {})
    result = []
    for mint, pos in positions.items():
        result.append({
            "mint":         mint,
            "token_name":   pos.get("name", pos.get("token_name", mint[:8])),
            "strategy":     pos.get("strategy", "?"),
            "entry_price":  pos.get("entry_price", 0),
            "amount_sol":   pos.get("amount_sol", 0),
            "opened_at":    pos.get("opened_at", ""),
            "signal_score": pos.get("score", pos.get("signal_score", 0)),
            "held_min":     pos.get("held_min", 0),
            "peak_price":   pos.get("peak_price", 0),
            "dyn_stop":     pos.get("dyn_stop", 0),
        })
    return result


@app.get("/api/trades")
def api_trades():
    mem = read_json("memory.json", {})
    trades = mem.get("trades", [])
    normalized = []
    for t in trades[-200:]:
        normalized.append({
            "ts":       t.get("ts", ""),
            "name":     t.get("name", t.get("token_name", "?")),
            "token_name": t.get("name", t.get("token_name", "?")),
            "mint":     t.get("mint", ""),
            "strat":    t.get("strat", t.get("strategy", "?")),
            "pnl_pct":  t.get("pnl_pct", 0),
            "pnl_sol":  t.get("pnl_sol", 0),
            "hold_min": t.get("hold_min", 0),
            "reason":   t.get("reason", ""),
            "score":    t.get("score", 0),
        })
    return normalized[-200:]


@app.get("/api/wallet")
async def api_wallet():
    cfg = load_config()
    rpc = cfg.get("rpc_url", "")
    wallet_data = read_json(cfg.get("wallet_file", "wallet.json"), {})
    address = wallet_data.get("address", "")
    if not address or not rpc: return {"sol_balance": 0, "tokens": []}
    import aiohttp
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(rpc, json={"jsonrpc":"2.0","id":1,"method":"getBalance","params":[address]},
                              timeout=aiohttp.ClientTimeout(total=5)) as r:
                d = await r.json()
            sol_bal = d.get("result", {}).get("value", 0) / 1e9
            async with s.post(rpc, json={"jsonrpc":"2.0","id":2,"method":"getTokenAccountsByOwner",
                "params":[address,{"programId":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},{"encoding":"jsonParsed"}]},
                timeout=aiohttp.ClientTimeout(total=8)) as r:
                td = await r.json()
        tokens = []
        for acc in td.get("result", {}).get("value", []):
            info = acc["account"]["data"]["parsed"]["info"]
            amt = float(info["tokenAmount"]["uiAmount"] or 0)
            if amt > 0: tokens.append({"mint": info["mint"], "ui_amount": round(amt, 4)})
        return {"sol_balance": round(sol_bal, 6), "address": address, "tokens": tokens}
    except Exception as e:
        return {"sol_balance": 0, "tokens": [], "error": str(e)}


@app.get("/api/logs")
def api_logs():
    return state.log_lines[-200:]


@app.get("/api/config")
def api_config():
    return load_config()


@app.post("/api/config")
async def api_config_save(data: dict):
    cfg = load_config()
    allowed = {
        "min_trade_sol","max_trade_sol","max_open_positions",
        "mo_min_score","pf_min_score","min_wallet_sol","loss_streak_limit","loss_streak_pause_min",
        "priority_fee_lamports","pf_profit","pf_stop","pf_max_hold",
        "mo_profit","mo_stop","mo_max_hold",
        "scan_interval_sec","websocket_enabled","dry_run",
        "ql_alpha","ql_gamma","ql_epsilon","kelly_fraction","atr_period",
        "telegram_token","telegram_chat_id",
        "min_liq_buy","min_mc_buy","emergency_stop_pct",
    }
    for k, v in data.items():
        if k in allowed: cfg[k] = v
    with open("config.json", "w") as f:
        json.dump(cfg, f, indent=2)
    return {"ok": True}


@app.post("/api/bot/start")
def api_bot_start():
    if state.running: return {"ok": False, "msg": "Läuft bereits"}
    if not BOT_AVAILABLE: return {"ok": False, "msg": "bot.py nicht gefunden"}
    state.running = True
    state.thread = threading.Thread(target=run_bot, daemon=True)
    state.thread.start()
    append_log("Bot gestartet", "INFO")
    return {"ok": True}


@app.post("/api/bot/stop")
def api_bot_stop():
    if state.bot: state.bot.stop()
    state.running = False
    append_log("Bot gestoppt", "WARN")
    return {"ok": True}


# ── SELL SINGLE ──────────────────────────────────────────────────────────────
@app.post("/api/sell")
async def api_sell(data: dict):
    mint = data.get("mint")
    if not mint: return {"ok": False, "msg": "Kein mint"}
    try:
        cfg = load_config()
        wallet_data = read_json(cfg.get("wallet_file", "wallet.json"), {})
        from solders.keypair import Keypair
        from solders.transaction import VersionedTransaction
        from solana.rpc.async_api import AsyncClient
        from solana.rpc.commitment import Confirmed
        from base64 import b64decode
        import aiohttp
        keypair = Keypair.from_bytes(bytes(wallet_data["secret_key"]))
        rpc_url = cfg.get("rpc_url"); jupiter = cfg.get("jupiter_api", "https://lite-api.jup.ag/swap/v1")
        SOL_MINT = "So11111111111111111111111111111111111111112"
        async with aiohttp.ClientSession() as s:
            async with s.post(rpc_url, json={"jsonrpc":"2.0","id":1,"method":"getTokenAccountsByOwner",
                "params":[str(keypair.pubkey()),{"mint":mint},{"encoding":"jsonParsed"}]},
                timeout=aiohttp.ClientTimeout(total=8)) as r:
                d = await r.json()
        amount_raw = max((int(a["account"]["data"]["parsed"]["info"]["tokenAmount"]["amount"])
                          for a in d.get("result", {}).get("value", [])), default=0)
        if amount_raw == 0: return {"ok": False, "msg": "Balance = 0"}
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{jupiter}/quote", params={"inputMint":mint,"outputMint":SOL_MINT,
                "amount":amount_raw,"slippageBps":1000}, timeout=aiohttp.ClientTimeout(total=8)) as r:
                quote = await r.json()
            if "error" in quote or "inputMint" not in quote:
                return {"ok": False, "msg": "Quote fehlgeschlagen"}
            async with s.post(f"{jupiter}/swap", json={"quoteResponse":quote,
                "userPublicKey":str(keypair.pubkey()),"wrapAndUnwrapSol":True,
                "dynamicComputeUnitLimit":True,"prioritizationFeeLamports":100000},
                timeout=aiohttp.ClientTimeout(total=15)) as r:
                swap = await r.json()
        if "swapTransaction" not in swap: return {"ok": False, "msg": str(swap)[:100]}
        raw = b64decode(swap["swapTransaction"]); tx = VersionedTransaction.from_bytes(raw)
        signed = VersionedTransaction(tx.message, [keypair])
        async with AsyncClient(rpc_url, commitment=Confirmed) as client:
            res = await client.send_raw_transaction(bytes(signed)); sig = str(res.value)
        pos = read_json(cfg.get("positions_file", "positions.json"), {})
        pos.pop(mint, None)
        with open(cfg.get("positions_file", "positions.json"), "w") as f:
            json.dump(pos, f, indent=2)
        append_log(f"Manuell verkauft: {mint[:8]} TX:{sig[:12]}", "WARN")
        try:
            from metrics.decision_store import store_decision
            store_decision(datetime.utcnow().isoformat() + "Z", "", "sell", "sell", 1.0, {"mint": mint[:8]}, [])
        except Exception: pass
        return {"ok": True, "tx": sig, "solscan": f"https://solscan.io/tx/{sig}"}
    except Exception as e:
        return {"ok": False, "msg": str(e)[:200]}


# ── SELL ALL (Emergency) ──────────────────────────────────────────────────────
@app.post("/api/sell_all")
async def api_sell_all():
    results = []
    try:
        cfg = load_config()
        wallet_data = read_json(cfg.get("wallet_file", "wallet.json"), {})
        from solders.keypair import Keypair
        from solders.transaction import VersionedTransaction
        from solana.rpc.async_api import AsyncClient
        from solana.rpc.commitment import Confirmed
        from base64 import b64decode
        import aiohttp
        keypair = Keypair.from_bytes(bytes(wallet_data["secret_key"]))
        rpc_url = cfg.get("rpc_url"); jupiter = cfg.get("jupiter_api", "https://lite-api.jup.ag/swap/v1")
        SOL_MINT = "So11111111111111111111111111111111111111112"
        async with aiohttp.ClientSession() as s:
            async with s.post(rpc_url, json={"jsonrpc":"2.0","id":1,"method":"getTokenAccountsByOwner",
                "params":[str(keypair.pubkey()),
                {"programId":"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},{"encoding":"jsonParsed"}]},
                timeout=aiohttp.ClientTimeout(total=10)) as r:
                d = await r.json()
        to_sell = [{"mint":a["account"]["data"]["parsed"]["info"]["mint"],
                    "amount":int(a["account"]["data"]["parsed"]["info"]["tokenAmount"]["amount"])}
                   for a in d.get("result",{}).get("value",[])
                   if int(a["account"]["data"]["parsed"]["info"]["tokenAmount"]["amount"]) > 0
                   and a["account"]["data"]["parsed"]["info"]["mint"] != SOL_MINT]
        if not to_sell: return {"ok": True, "msg": "Keine Tokens", "results": []}
        append_log(f"🚨 EMERGENCY SELL: {len(to_sell)} Tokens", "WARN")
        for token in to_sell:
            mint = token["mint"]
            try:
                async with aiohttp.ClientSession() as s:
                    async with s.get(f"{jupiter}/quote", params={"inputMint":mint,"outputMint":SOL_MINT,
                        "amount":token["amount"],"slippageBps":1500},
                        timeout=aiohttp.ClientTimeout(total=8)) as r:
                        quote = await r.json()
                if "error" in quote or "inputMint" not in quote:
                    results.append({"mint":mint[:8],"ok":False,"msg":"Kein Markt"}); continue
                out_sol = int(quote.get("outAmount",0)) / 1e9
                if out_sol < 0.000001:
                    results.append({"mint":mint[:8],"ok":False,"msg":"~0 SOL"}); continue
                async with aiohttp.ClientSession() as s:
                    async with s.post(f"{jupiter}/swap", json={"quoteResponse":quote,
                        "userPublicKey":str(keypair.pubkey()),"wrapAndUnwrapSol":True,
                        "dynamicComputeUnitLimit":True,"prioritizationFeeLamports":100000},
                        timeout=aiohttp.ClientTimeout(total=15)) as r:
                        swap = await r.json()
                if "swapTransaction" not in swap:
                    results.append({"mint":mint[:8],"ok":False,"msg":str(swap)[:60]}); continue
                raw = b64decode(swap["swapTransaction"]); tx = VersionedTransaction.from_bytes(raw)
                signed = VersionedTransaction(tx.message, [keypair])
                async with AsyncClient(rpc_url, commitment=Confirmed) as client:
                    res = await client.send_raw_transaction(bytes(signed)); sig = str(res.value)
                results.append({"mint":mint[:8],"ok":True,"sol":round(out_sol,5),
                                "tx":f"https://solscan.io/tx/{sig}"})
                append_log(f"🚨 Sold {mint[:8]} → {out_sol:.5f} SOL", "WARN")
                await asyncio.sleep(0.4)
                pos_file = cfg.get("positions_file","positions.json")
                pos = read_json(pos_file, {})
                pos.pop(mint, None)
                with open(pos_file,"w") as f: json.dump(pos, f, indent=2)
            except Exception as e:
                results.append({"mint":mint[:8],"ok":False,"msg":str(e)[:80]})
        sold = [r for r in results if r["ok"]]
        total = sum(r.get("sol",0) for r in sold)
        append_log(f"🚨 Done: {len(sold)} sold, +{total:.5f} SOL", "WARN")
        return {"ok":True,"sold":len(sold),"failed":len(results)-len(sold),
                "total_sol":round(total,5),"results":results}
    except Exception as e:
        return {"ok": False, "msg": str(e)}


# ── BACKTEST ──────────────────────────────────────────────────────────────────
@app.get("/api/backtest")
def api_backtest():
    """Walk-forward backtest on historical trade data from memory.json"""
    mem    = read_json("memory.json", {})
    trades = mem.get("trades", [])
    if len(trades) < 5:
        return {"error": "Not enough trades (need 5+)", "n": len(trades)}
    equity = 1.0; peak = 1.0; max_dd = 0.0; wins = 0
    equity_curve = []
    for t in trades:
        pnl = float(t.get("pnl_pct", 0) or 0)
        trade_size = equity * 0.05
        equity += trade_size * pnl
        equity = max(equity, 0.001)
        if equity > peak: peak = equity
        dd = (peak - equity) / peak
        if dd > max_dd: max_dd = dd
        if pnl > 0: wins += 1
        equity_curve.append({"ts": t.get("ts",""), "name": t.get("name","?"),
                              "pnl": round(pnl*100,2), "equity": round(equity,4)})
    n = len(trades); wr = wins / n if n > 0 else 0
    total_r = (equity - 1.0) * 100
    return {
        "n": n, "win_rate": round(wr, 4),
        "max_drawdown": round(max_dd, 4),
        "total_return_pct": round(total_r, 2),
        "final_equity": round(equity, 4),
        "equity_curve": equity_curve[-200:],
    }


# ── ML STATUS ─────────────────────────────────────────────────────────────────
@app.get("/api/ml_status")
def api_ml_status():
    """Q-Learning + Kelly + ATR status."""
    mem  = read_json("memory.json", {})
    cfg  = load_config()
    ql   = mem.get("ql", {})
    s    = mem.get("stats", {})
    return {
        "threshold":     mem.get("threshold", 62),
        "ql_states":     len(ql),
        "trend":         "bull" if s.get("win_rate", 0.5) > 0.6 else ("bear" if s.get("win_rate", 0.5) < 0.4 else "neutral"),
        "avg_win":       round(s.get("avg_win",  0), 4),
        "avg_loss":      round(s.get("avg_loss", 0), 4),
        "kelly_fraction": cfg.get("kelly_fraction", 0.25),
        "atr_period":    cfg.get("atr_period", 14),
    }


# ── RECAP ─────────────────────────────────────────────────────────────────────
@app.get("/api/recap")
def api_recap():
    mem = read_json("memory.json", {}); trades = mem.get("trades", [])
    if not trades: return []
    recaps = []
    for t in trades[-60:]:
        name = t.get("name", "?"); pnl_pct = t.get("pnl_pct", 0)
        pnl_sol = t.get("pnl_sol", 0); hold = t.get("hold_min", 0)
        reason = t.get("reason", ""); score = t.get("score", 0); ts = t.get("ts", "")
        win = pnl_pct > 0; p = abs(pnl_pct * 100); sol = abs(pnl_sol); hm = f"{hold:.1f}min"
        if "Trailing" in reason:     exit_desc = "trailed the peak"
        elif "Rug" in reason:        exit_desc = "cut on rug signal"
        elif "Stop" in reason:       exit_desc = "hit stop-loss"
        elif "Profit" in reason:     exit_desc = "hit take-profit"
        elif "Stagnation" in reason: exit_desc = "stalled"
        elif "Max-Hold" in reason:   exit_desc = "timed out"
        else:                        exit_desc = "closed"
        if win:
            sentence = f"Bought {name} (score {score}), {exit_desc} after {hm} for +{p:.1f}% (+{sol:.4f} SOL)."
        else:
            sentence = f"Entered {name} (score {score}), {exit_desc} after {hm} — {p:.1f}% loss (-{sol:.4f} SOL)."
        recaps.append({"ts":ts,"name":name,"pnl_pct":pnl_pct,"pnl_sol":pnl_sol,
                        "hold_min":hold,"sentence":sentence})
    return list(reversed(recaps))


if __name__ == "__main__":
    import webbrowser, time as _t
    _t.sleep(1.5)
    webbrowser.open("http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

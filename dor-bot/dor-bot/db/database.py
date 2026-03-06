"""
SQLite database for KPI Dashboard V1.
Path: data/bot_metrics.db
"""
import os
import sqlite3
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DB_DIR / "bot_metrics.db"


def get_connection():
    """Get SQLite connection. Creates DB dir and tables if needed."""
    DB_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    init_tables(conn)
    return conn


def init_tables(conn: sqlite3.Connection):
    """Create tables if they don't exist."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT,
            run_id TEXT,
            entity TEXT,
            action TEXT,
            confidence REAL,
            reasons TEXT,
            risk_flags TEXT
        );
        CREATE TABLE IF NOT EXISTS metrics_snapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT,
            mci REAL,
            bci REAL,
            hybrid REAL,
            data_quality REAL,
            chaos_pass_rate REAL
        );
        CREATE TABLE IF NOT EXISTS adapter_health (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            adapter TEXT,
            status TEXT,
            last_ok_at TEXT,
            reason TEXT
        );
    """)
    conn.commit()

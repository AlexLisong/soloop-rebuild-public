#!/usr/bin/env python3
"""Consistent SQLite backup, including committed WAL records. Root only."""
import os
from pathlib import Path
import sqlite3
import sys

source, destination = map(Path, sys.argv[1:])
if not source.is_file() or destination.exists():
    raise SystemExit("Source must exist and destination must be new.")
os.umask(0o077)
destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
with sqlite3.connect(f"file:{source}?mode=ro", uri=True) as src, sqlite3.connect(destination) as dst:
    src.backup(dst)
    if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise SystemExit("Backup integrity check failed.")
print("Consistent database backup created.")

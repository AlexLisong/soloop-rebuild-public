#!/usr/bin/env python3
"""Build a clean revision and package portable output, never local dependencies."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if subprocess.check_output(["git", "status", "--porcelain"], text=True).strip():
    raise SystemExit("Commit source changes before packaging a release.")
revision = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
subprocess.run(["npm", "run", "build"], check=True)
subprocess.run(["npm", "test"], check=True)
subprocess.run(["npm", "run", "smoke:production"], check=True)
release = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + revision[:8]
output = ROOT / ".aws"
output.mkdir(mode=0o700, exist_ok=True)
files = [ROOT / name for name in ("package.json", "package-lock.json", ".npmrc", "scripts/install-ci.mjs", "scripts/sites-env.mjs")]
files += [p for folder in (ROOT / "dist", ROOT / "deploy", ROOT / "server") for p in folder.rglob("*") if p.is_file() or p.is_symlink()]
files = sorted(p for p in files if "__pycache__" not in p.parts and p.name not in ("wrangler.json", ".assetsignore"))
manifest = {"release": release, "revision": revision, "files": {}}
for path in files:
    if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != ROOT.parent):
        raise SystemExit(f"Symlinked release input: {path.relative_to(ROOT)}")
    if path.name.startswith(".env") or path.name.startswith(".dev.vars") or path.suffix in (".pem", ".key", ".db"):
        raise SystemExit(f"Private file in release input: {path.relative_to(ROOT)}")
    manifest["files"][str(path.relative_to(ROOT))] = hashlib.sha256(path.read_bytes()).hexdigest()
archive = output / f"{release}.tar.gz"
with tempfile.TemporaryDirectory() as scratch:
    metadata = Path(scratch) / "release.json"
    metadata.write_text(json.dumps(manifest, indent=2) + "\n")
    with tarfile.open(archive, "w:gz") as bundle:
        for path in files:
            bundle.add(path, arcname=str(path.relative_to(ROOT)), recursive=False)
        bundle.add(metadata, arcname="release.json")
(output / "latest-release.txt").write_text(str(archive) + "\n")
print(archive)

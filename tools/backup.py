"""Consistent SQLite backup; works with a running server via SQLite backup API."""
import argparse
import datetime
import sqlite3
from pathlib import Path
p = argparse.ArgumentParser()
p.add_argument('--source', default='data/world.sqlite3')
p.add_argument('--out', default='backups')
a = p.parse_args()
source = Path(a.source).resolve()
if not source.is_file():
    raise SystemExit('Save not found; start the game first.')
out = Path(a.out)
out.mkdir(parents=True, exist_ok=True)
target = out / ('world-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.sqlite3')
src = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
dst = sqlite3.connect(target)
try:
    src.backup(dst)
finally:
    dst.close(); src.close()
print(target)

"""SQLite snapshot store; each completed action and its resources commit together."""
import json
import sqlite3
from pathlib import Path
from .game import new_world


class Store:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.execute('CREATE TABLE IF NOT EXISTS world (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')
        self.db.commit()

    def load(self):
        row = self.db.execute('SELECT value FROM world WHERE id=1').fetchone()
        w = json.loads(row[0]) if row else new_world()
        if w.get('version') != 1:
            raise RuntimeError('Unsupported save version; restore a compatible backup. Do not delete the save.')
        return w

    def save(self, world):
        with self.db:
            self.db.execute('INSERT INTO world VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
                            (json.dumps(world, ensure_ascii=False),))

    def close(self):
        self.db.close()
